'use strict';

// Pictures: what kind a file really is, from its first bytes (not from what it claims to be),
// and whether it moves. And, with sharp (libvips): the smaller copies of photos that the chat
// shows (tap one for the original), and profile pictures no bigger than they need to be. (Taking
// hidden details out of them is lib/scrub.js.)

const sharp = require('sharp');
const scrub = require('./scrub');

sharp.cache(false); // (Render's smallest server has 512 MB: nothing's kept around after)
sharp.concurrency(1); // one thread per picture; the queue below does two at once

function imageKind(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (/^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Moving pictures: a GIF with more than one frame (each has its own timing block), an animated
// PNG (its "acTL" part), or an animated WebP ("ANIM").
function animated(buf, kind) {
  if (kind === 'gif') {
    let frames = 0;
    for (let i = buf.indexOf(Buffer.from([0x21, 0xf9, 0x04])); i !== -1 && frames < 2; i = buf.indexOf(Buffer.from([0x21, 0xf9, 0x04]), i + 3)) frames++;
    return frames > 1;
  }
  if (kind === 'png') return buf.indexOf('acTL', 8, 'latin1') !== -1;
  if (kind === 'webp') return buf.indexOf('ANIM', 12, 'latin1') !== -1;
  return false;
}

// ---------- One or two pictures at a time ----------
// So a chat full of old photos, all wanting their small copies at once, can't swamp the server.

const queue = [];
let busy = 0;
function nextJob() {
  while (busy < 2 && queue.length) {
    busy++;
    queue.shift()();
  }
}
function queued(job) {
  return new Promise((resolve, reject) => {
    queue.push(() => job().then(resolve, reject).finally(() => {
      busy--;
      nextJob();
    }));
    nextJob();
  });
}

// ---------- The chat's smaller copies ----------
// A photo in a chat shows as a copy just big enough for it (on a sharp phone screen too), and
// opening it shows the original, like Discord. Screenshots and drawings (PNG) stay exact; photos
// get a high-quality WebP. null: the original's about as small (or can't be read, or moves).

const PREVIEW_EDGE = 1280;
const PREVIEW_TYPES = /^image\/(jpeg|png|webp|avif)$/;
const PREVIEW_MIN_BYTES = 300 * 1024;
const previewable = (type, size) => PREVIEW_TYPES.test(String(type)) && size > PREVIEW_MIN_BYTES;

// (`size`: the original's, in bytes.)
function preview(file, size) {
  return queued(async () => {
    const opts = { sequentialRead: true, limitInputPixels: 100_000_000 };
    const meta = await sharp(file, opts).metadata();
    if ((meta.pages || 1) > 1) return null;
    const exact = meta.format === 'png';
    const shrink = () => sharp(file, opts).autoOrient().keepIccProfile()
      .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true });
    let out = exact
      ? await shrink().webp({ lossless: true, effort: 4 }).toBuffer()
      : await shrink().webp({ quality: 85, smartSubsample: true, effort: 4 }).toBuffer();
    if (exact && out.length > 600 * 1024) out = await shrink().webp({ quality: 90, smartSubsample: true, effort: 4 }).toBuffer();
    return out.length < size * 0.7 ? out : null;
  });
}

// ---------- Profile pictures ----------
// They're shown small (84px at the most, in the app), so a big one's made 512px across on its
// shorter side: sharp on any screen, and a fraction of the download for everyone who sees it.
// Never more compressed, though: the smaller one's saved losslessly, in the original's colours,
// with nothing else in it. One that's small enough already stays exactly as it came (bar its
// hidden details), and so does one that moves.

const AVATAR_EDGE = 512;

async function avatar(buf, kind) {
  const same = { buf: await scrub.scrubData(buf), ext: kind };
  if (animated(buf, kind)) return same;
  const meta = await queued(() => sharp(buf).metadata());
  const { width, height } = meta.autoOrient || meta;
  if (Math.min(width, height) <= AVATAR_EDGE) return same;
  const small = await queued(() => sharp(buf).autoOrient().keepIccProfile()
    .resize({ width: AVATAR_EDGE, height: AVATAR_EDGE, fit: 'outside', withoutEnlargement: true })
    .webp({ lossless: true, effort: 5 }).toBuffer());
  return small.length < same.buf.length ? { buf: small, ext: 'webp' } : same;
}

module.exports = { imageKind, animated, previewable, preview, avatar, PREVIEW_EDGE, AVATAR_EDGE };
