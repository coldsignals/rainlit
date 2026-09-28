'use strict';

// What kind of picture a file really is, from its first bytes (not from what it claims to be),
// and whether it moves.

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

module.exports = { imageKind, animated };
