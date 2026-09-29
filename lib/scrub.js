'use strict';

// Taking the hidden details out of what people upload (files they send, profile pictures, and
// homepage pictures and songs): where a photo or video was taken, when, on what phone or camera,
// with what software, by whom, its tags and comments, a thumbnail of how it looked before it was
// cropped, and the like. Only what's needed to show or play it as it is stays: which way up a
// photo goes, and its colours. The picture, video or sound itself isn't touched, and neither is
// the file's name.
//
//   - Photos (JPEG, PNG, WebP, GIF) and MP3s lose those parts, and anything tacked on after the
//     picture ends (a motion photo's video, say).
//   - Videos and recordings from phones and cameras (MP4, MOV, M4A, HEIC, AVIF), FLAC and WAV
//     have theirs blanked out where they are, so nothing else in them moves.
//   - Anything that doesn't look the way it should is left exactly as it came.
//   - Not yet: WebM, Ogg, and documents (a PDF's or a Word file's author, say).

const fs = require('fs');
const zlib = require('zlib');
const sharp = require('sharp');

const IN_MEMORY_MAX = 64 * 1024 * 1024; // (bigger ones are only ever read in parts)

// ---------- Which way up ----------
// EXIF (as TIFF) with nothing in it but which way up the picture goes.

function orientationTiff(o) {
  const t = Buffer.alloc(26);
  t.write('MM', 0, 'latin1');
  t.writeUInt16BE(42, 2);
  t.writeUInt32BE(8, 4); // (where its one list starts)
  t.writeUInt16BE(1, 8); // one entry:
  t.writeUInt16BE(0x0112, 10); // Orientation,
  t.writeUInt16BE(3, 12); // a short number,
  t.writeUInt32BE(1, 14); // just the one:
  t.writeUInt16BE(o, 18);
  t.writeUInt32BE(0, 22); // and no more lists
  return t;
}

// ---------- JPEG ----------

const EXIF_ID = Buffer.from('Exif\0\0', 'latin1');

function orientationApp1(o) {
  const t = orientationTiff(o);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(2 + EXIF_ID.length + t.length, 2);
  return Buffer.concat([head, EXIF_ID, t]);
}

// What stays of a JPEG's header parts: the ones that say how to draw it (its tables and size),
// its colour profile, and Adobe's note on its colours. Every other "APPn" part (EXIF, XMP, IPTC,
// a phone maker's own), and comments, go. So does a JFIF part with a thumbnail in it.
function keepJpegPart(marker, body) {
  if (marker === 0xfe) return false;
  if (marker < 0xe0 || marker > 0xef) return true;
  if (marker === 0xe0) return body.toString('latin1', 0, 5) === 'JFIF\0' && body.length >= 14 && body[12] * body[13] === 0;
  if (marker === 0xe2) return body.toString('latin1', 0, 12) === 'ICC_PROFILE\0';
  if (marker === 0xee) return body.toString('latin1', 0, 5) === 'Adobe';
  return false;
}

function jpeg(buf, orientation) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const parts = [buf.subarray(0, 2)];
  let changed = false;
  let oriented = !(orientation > 1);
  let i = 2;
  for (;;) {
    if (i + 2 > buf.length || buf[i] !== 0xff) return buf;
    const marker = buf[i + 1];
    // The end of the picture. Anything after it goes.
    if (marker === 0xd9) {
      parts.push(buf.subarray(i, i + 2));
      if (i + 2 < buf.length) changed = true;
      break;
    }
    if (marker === 0xff || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return buf;
    if (i + 4 > buf.length) return buf;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    const part = buf.subarray(i, i + 2 + len);
    if (keepJpegPart(marker, part.subarray(4))) {
      parts.push(part);
    } else {
      changed = true;
      if (!oriented && marker === 0xe1 && part.subarray(4, 10).equals(EXIF_ID)) {
        parts.push(orientationApp1(orientation));
        oriented = true;
      }
    }
    i += 2 + len;
    // A scan: the picture's coded data, up to the next marker. (0xFF 0x00 is a coded 0xFF, and
    // restart markers and fill bytes are part of it. A progressive JPEG has several scans, with
    // tables between them.)
    if (marker === 0xda) {
      let j = i;
      for (;;) {
        j = buf.indexOf(0xff, j);
        if (j === -1 || j + 1 >= buf.length) {
          // (It never says it's ended: the rest is kept as it is.)
          parts.push(buf.subarray(i));
          return changed ? Buffer.concat(parts) : buf;
        }
        const next = buf[j + 1];
        if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
          j += 1;
          continue;
        }
        break;
      }
      parts.push(buf.subarray(i, j));
      i = j;
    }
  }
  return changed ? Buffer.concat(parts) : buf;
}

// ---------- PNG ----------

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The parts that draw it (and animate it, and get its colours right). Text (a title, an author,
// the software, an AI picture's prompt), times, EXIF and anything else goes.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP', 'mDCV', 'mDCv', 'cLLI', 'cLLi', 'sBIT', 'pHYs', 'bKGD', 'acTL', 'fcTL', 'fdAT']);

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(buf, orientation) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return buf;
  const parts = [buf.subarray(0, 8)];
  let changed = false;
  let i = 8;
  for (;;) {
    if (i + 12 > buf.length) return buf;
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (PNG_KEEP.has(type)) {
      parts.push(buf.subarray(i, end));
    } else {
      changed = true;
      if (type === 'eXIf' && orientation > 1) parts.push(pngChunk('eXIf', orientationTiff(orientation)));
    }
    i = end;
    if (type === 'IEND') {
      if (i < buf.length) changed = true;
      break;
    }
  }
  return changed ? Buffer.concat(parts) : buf;
}

// ---------- WebP ----------

const WEBP_KEEP = new Set(['VP8X', 'ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']);

function webp(buf) {
  if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return buf;
  const riffEnd = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const parts = [buf.subarray(0, 12)];
  let changed = riffEnd < buf.length;
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = buf.toString('latin1', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    if (i + 8 + len > riffEnd) return buf;
    const end = Math.min(riffEnd, i + 8 + len + (len & 1));
    if (WEBP_KEEP.has(type)) parts.push(buf.subarray(i, end));
    else changed = true;
    i = end;
  }
  if (!changed) return buf;
  const out = Buffer.concat(parts);
  if (out.toString('latin1', 12, 16) === 'VP8X') out[20] &= ~0x0c; // (no EXIF or XMP now)
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

// ---------- GIF ----------
// Comments and applications' own blocks (XMP, Photoshop's) go; the ones that make it loop, and
// its colour profile, stay.

const GIF_KEEP_APPS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0', 'ICCRGBG1012']);

function gif(buf) {
  if (buf.length < 13 || !/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return buf;
  let i = 13;
  if (buf[10] & 0x80) i += 3 * (1 << ((buf[10] & 7) + 1));
  if (i > buf.length) return buf;
  const parts = [buf.subarray(0, i)];
  let changed = false;
  const blocksEnd = (p) => {
    while (p < buf.length) {
      const n = buf[p];
      p += 1 + n;
      if (n === 0) return p;
    }
    return -1;
  };
  for (;;) {
    if (i >= buf.length) return buf;
    const b = buf[i];
    if (b === 0x3b) {
      parts.push(buf.subarray(i, i + 1));
      if (i + 1 < buf.length) changed = true;
      break;
    }
    if (b === 0x21) {
      const label = buf[i + 1];
      const end = blocksEnd(i + 2);
      if (end === -1) return buf;
      const keep = label === 0xfe ? false
        : label === 0xff ? buf[i + 2] === 11 && GIF_KEEP_APPS.has(buf.toString('latin1', i + 3, i + 14))
        : true;
      if (keep) parts.push(buf.subarray(i, end));
      else changed = true;
      i = end;
    } else if (b === 0x2c) {
      if (i + 11 > buf.length) return buf;
      let p = i + 10;
      if (buf[i + 9] & 0x80) p += 3 * (1 << ((buf[i + 9] & 7) + 1));
      const end = blocksEnd(p + 1); // (after the LZW code size)
      if (end === -1) return buf;
      parts.push(buf.subarray(i, end));
      i = end;
    } else {
      return buf;
    }
  }
  return changed ? Buffer.concat(parts) : buf;
}

// ---------- MP3 ----------
// ID3 tags at the start (title, artist, cover art, comments...), and ID3v1 and APE tags at the end.

function syncsafe(b, p) {
  if ((b[p] | b[p + 1] | b[p + 2] | b[p + 3]) & 0x80) return -1;
  return (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];
}

function mp3(buf, isMp3) {
  let start = 0;
  while (start + 10 <= buf.length && buf.toString('latin1', start, start + 3) === 'ID3') {
    const size = syncsafe(buf, start + 6);
    if (size < 0) return buf;
    start += 10 + size + (buf[start + 5] & 0x10 ? 10 : 0);
    if (start > buf.length) return buf;
  }
  let end = buf.length;
  if (isMp3 || start > 0) {
    if (end - start >= 128 && buf.toString('latin1', end - 128, end - 125) === 'TAG') end -= 128;
    if (end - start >= 227 && buf.toString('latin1', end - 227, end - 223) === 'TAG+') end -= 227;
    if (end - start >= 32 && buf.toString('latin1', end - 32, end - 24) === 'APETAGEX') {
      const total = buf.readUInt32LE(end - 20) + (buf.readUInt32LE(end - 12) & 0x80000000 ? 32 : 0);
      if (total <= end - start) end -= total;
    }
  }
  return start === 0 && end === buf.length ? buf : buf.subarray(start, end);
}

// ---------- FLAC and WAV (blanked where they are) ----------

function flac(buf) {
  if (buf.length < 8 || buf.toString('latin1', 0, 4) !== 'fLaC') return buf;
  let out = null;
  let i = 4;
  for (;;) {
    if (i + 4 > buf.length) return buf;
    const head = buf[i];
    const len = buf.readUIntBE(i + 1, 3);
    if (i + 4 + len > buf.length) return buf;
    // An application's own block, the tags ("Vorbis comments"), or a picture: padding now.
    if ([2, 4, 6].includes(head & 0x7f)) {
      out ||= Buffer.from(buf);
      out[i] = (head & 0x80) | 1;
      out.fill(0, i + 4, i + 4 + len);
    }
    i += 4 + len;
    if (head & 0x80) break;
  }
  return out || buf;
}

const WAV_EXTRAS = new Set(['LIST', 'bext', 'iXML', 'id3 ', 'ID3 ', '_PMX', 'DISP', 'axml', 'cart']);

function wav(buf) {
  if (buf.length < 12 || !['RIFF', 'RF64'].includes(buf.toString('latin1', 0, 4)) || buf.toString('latin1', 8, 12) !== 'WAVE') return buf;
  let out = null;
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    if (len === 0xffffffff || i + 8 + len > buf.length) break; // (RF64's sound: its size is elsewhere)
    if (WAV_EXTRAS.has(type)) {
      out ||= Buffer.from(buf);
      out.write('JUNK', i, 'latin1');
      out.fill(0, i + 8, i + 8 + len);
    }
    i += 8 + len + (len & 1);
  }
  return out || buf;
}

// ---------- MP4, MOV, M4A, HEIC, AVIF (blanked where they are) ----------
// These are made of nested "boxes". The ones holding extras (user data, metadata, vendors' own)
// become "free" boxes (space a player skips) full of zeros, and the times in the movie's, tracks'
// and media's headers become 0. Nothing moves, so everything that points into the file still
// points at the same place. In a HEIC or AVIF photo, whose "meta" box is the photo's own
// description, only the EXIF and XMP it lists are zeroed out.

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'mif2', 'msf1', 'avif', 'avis']);
const FIRST_BOXES = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

// The boxes in buf from start to end: { type, at, head, end }.
function boxes(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let len = buf.readUInt32BE(p);
    let head = 8;
    if (len === 1) {
      if (p + 16 > end) break;
      len = Number(buf.readBigUInt64BE(p + 8));
      head = 16;
    } else if (len === 0) {
      len = end - p;
    }
    if (len < head || p + len > end) break;
    out.push({ type: buf.toString('latin1', p + 4, p + 8), at: p, head, end: p + len });
    p += len;
  }
  return out;
}

function free(buf, b) {
  buf.write('free', b.at + 4, 'latin1');
  buf.fill(0, b.at + b.head, b.end);
}

// mvhd, tkhd, mdhd: version, flags, then when it was made and changed.
function zeroTimes(buf, b) {
  const p = b.at + b.head;
  if (p + 20 > b.end) return;
  buf.fill(0, p + 4, p + 4 + (buf[p] === 1 ? 16 : 8));
}

// A movie's description (moov), changed in place. (Returns whether anything was.)
function moov(buf, from, to) {
  let changed = false;
  for (const b of boxes(buf, from, to)) {
    if (b.type === 'udta' || b.type === 'meta' || b.type === 'uuid') {
      free(buf, b);
      changed = true;
    } else if (b.type === 'trak' || b.type === 'mdia') {
      changed = moov(buf, b.at + b.head, b.end) || changed;
    } else if (b.type === 'mvhd' || b.type === 'tkhd' || b.type === 'mdhd') {
      zeroTimes(buf, b);
      changed = true;
    }
  }
  return changed;
}

const readN = (buf, p, n) => (n === 0 ? 0 : n === 2 ? buf.readUInt16BE(p) : n === 4 ? buf.readUInt32BE(p) : n === 8 ? Number(buf.readBigUInt64BE(p)) : NaN);

// A HEIC or AVIF photo's EXIF and XMP: where they are in the file, as [position, length] pairs.
// (meta: the whole "meta" box, which starts at metaAt in the file.)
function heifExtras(meta, metaAt) {
  const kids = boxes(meta, 12, meta.length); // (after its header, version and flags)
  const iinf = kids.find((b) => b.type === 'iinf');
  const iloc = kids.find((b) => b.type === 'iloc');
  const idat = kids.find((b) => b.type === 'idat');
  if (!iinf || !iloc) return [];
  const ids = new Set();
  let p = iinf.at + iinf.head;
  p += 4 + (meta[p] === 0 ? 2 : 4);
  for (const b of boxes(meta, p, iinf.end)) {
    if (b.type !== 'infe') continue;
    const v = meta[b.at + b.head];
    if (v < 2) continue;
    let q = b.at + b.head + 4;
    const id = v === 2 ? meta.readUInt16BE(q) : meta.readUInt32BE(q);
    q += (v === 2 ? 2 : 4) + 2;
    const type = meta.toString('latin1', q, q + 4);
    q += 4;
    if (type === 'Exif') ids.add(id);
    if (type === 'mime') {
      const nameEnd = meta.indexOf(0, q);
      const typeEnd = nameEnd === -1 ? -1 : meta.indexOf(0, nameEnd + 1);
      if (typeEnd !== -1 && /xml|rdf/i.test(meta.toString('latin1', nameEnd + 1, typeEnd))) ids.add(id);
    }
  }
  if (!ids.size) return [];
  const out = [];
  p = iloc.at + iloc.head;
  const v = meta[p];
  p += 4;
  const offSize = meta[p] >> 4;
  const lenSize = meta[p] & 15;
  const baseSize = meta[p + 1] >> 4;
  const idxSize = v >= 1 ? meta[p + 1] & 15 : 0;
  p += 2;
  const count = v < 2 ? meta.readUInt16BE(p) : meta.readUInt32BE(p);
  p += v < 2 ? 2 : 4;
  for (let n = 0; n < count && p < iloc.end; n++) {
    const id = v < 2 ? meta.readUInt16BE(p) : meta.readUInt32BE(p);
    p += v < 2 ? 2 : 4;
    const method = v >= 1 ? meta.readUInt16BE(p) & 15 : 0;
    if (v >= 1) p += 2;
    p += 2; // (data reference)
    const base = readN(meta, p, baseSize);
    p += baseSize;
    const extents = meta.readUInt16BE(p);
    p += 2;
    for (let e = 0; e < extents; e++) {
      p += idxSize;
      const off = readN(meta, p, offSize);
      p += offSize;
      const len = readN(meta, p, lenSize);
      p += lenSize;
      if (!ids.has(id) || !(len > 0) || !Number.isFinite(base + off)) continue;
      if (method === 0) out.push([base + off, len]);
      else if (method === 1 && idat) out.push([metaAt + idat.at + idat.head + base + off, len]);
    }
  }
  return out;
}

// io: { size, read(at, n), write(at, buf) }, for a file or a buffer.
async function isobmff(io) {
  let heif = false;
  let changed = false;
  let p = 0;
  while (p + 8 <= io.size) {
    const h = await io.read(p, 16);
    let len = h.readUInt32BE(0);
    let head = 8;
    if (len === 1) {
      len = Number(h.readBigUInt64BE(8));
      head = 16;
    } else if (len === 0) {
      len = io.size - p;
    }
    const type = h.toString('latin1', 4, 8);
    if (len < head || p + len > io.size) break;
    if (type === 'ftyp') {
      const f = await io.read(p, Math.min(len, 512));
      for (let q = head; q + 4 <= f.length; q += 4) if (q !== head + 4 && HEIF_BRANDS.has(f.toString('latin1', q, q + 4))) heif = true;
    } else if (type === 'moov' && len <= IN_MEMORY_MAX) {
      const box = Buffer.from(await io.read(p, len));
      if (moov(box, head, len)) {
        await io.write(p, box);
        changed = true;
      }
    } else if (type === 'meta' && heif && len <= IN_MEMORY_MAX) {
      for (const [at, n] of heifExtras(await io.read(p, len), p)) {
        if (at + n > io.size) continue;
        await io.write(at, Buffer.alloc(n));
        changed = true;
      }
    } else if (type === 'udta' || type === 'uuid' || (type === 'meta' && !heif)) {
      // (Someone's extras, out on their own.)
      const h2 = Buffer.from(h.subarray(0, head));
      h2.write('free', 4, 'latin1');
      await io.write(p, h2);
      for (let q = p + head; q < p + len; q += 1024 * 1024) await io.write(q, Buffer.alloc(Math.min(1024 * 1024, p + len - q)));
      changed = true;
    }
    p += len;
  }
  return changed;
}

// ---------- Which kind ----------

function kindOf(head, hints = {}) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (head.length >= 12 && ['RIFF', 'RF64'].includes(head.toString('latin1', 0, 4)) && head.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.toString('latin1', 0, 6))) return 'gif';
  if (head.length >= 4 && head.toString('latin1', 0, 4) === 'fLaC') return 'flac';
  if (head.length >= 3 && head.toString('latin1', 0, 3) === 'ID3') return 'mp3';
  if (head.length >= 8 && FIRST_BOXES.has(head.toString('latin1', 4, 8)) && head.readUInt32BE(0) !== 0) return 'isobmff';
  const mp3ish = /^audio\/(mpeg|mp3)$/.test(String(hints.type || '')) || /\.mp3$/i.test(String(hints.name || ''));
  if (mp3ish && head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}

// Which way up a JPEG or PNG goes (from its EXIF, read by sharp), and whether sharp can read it.
async function pictureInfo(buf) {
  const m = await sharp(buf, { limitInputPixels: false }).metadata();
  return { orientation: m.orientation || 1, width: m.width, height: m.height };
}

// buf without its extras (the same Buffer if it had none, or anything's off).
async function scrubData(buf, hints = {}) {
  try {
    const kind = kindOf(buf.subarray(0, 64), hints);
    if (!kind) return buf;
    if (kind === 'isobmff') {
      const out = Buffer.from(buf);
      const io = { size: out.length, read: async (at, n) => out.subarray(at, at + n), write: async (at, b) => void b.copy(out, at) };
      return (await isobmff(io)) ? out : buf;
    }
    if (kind === 'mp3') return mp3(buf, true);
    if (kind === 'flac') return flac(buf);
    if (kind === 'wav') return wav(buf);
    if (kind === 'webp') return webp(buf);
    if (kind === 'gif') return gif(buf);
    // JPEG and PNG: which way up they go is kept, and what's left has to read as the same picture.
    const before = await pictureInfo(buf);
    const out = kind === 'jpeg' ? jpeg(buf, before.orientation) : png(buf, before.orientation);
    if (out === buf) return buf;
    const after = await pictureInfo(out);
    return after.width === before.width && after.height === before.height && after.orientation === before.orientation ? out : buf;
  } catch {
    return buf;
  }
}

// A file on disk, changed where it is. Returns its size after (or null if it can't be read).
async function scrubFile(file, hints = {}) {
  let fh;
  try {
    fh = await fs.promises.open(file, 'r+');
    const { size } = await fh.stat();
    const read = async (at, n) => {
      const b = Buffer.alloc(Math.max(0, Math.min(n, size - at)));
      await fh.read(b, 0, b.length, at);
      return b;
    };
    const kind = kindOf(await read(0, 64), hints);
    if (!kind) return size;
    if (kind === 'isobmff') {
      await isobmff({ size, read, write: async (at, b) => void (await fh.write(b, 0, b.length, at)) });
      return size;
    }
    if (size > IN_MEMORY_MAX) return size;
    const buf = await read(0, size);
    const out = await scrubData(buf, hints);
    if (out === buf) return size;
    await fh.close();
    fh = null;
    await fs.promises.writeFile(file, out);
    return out.length;
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

module.exports = { scrubData, scrubFile, kindOf, jpeg, png, webp, gif, mp3, flac, wav };
