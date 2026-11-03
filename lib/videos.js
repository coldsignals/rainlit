'use strict';

// Videos that won't play everywhere: a copy that will. Phones record in HEVC (H.265), and newer
// ones in 10-bit HDR, which a computer plays but many phones can't, inside an app (Android's
// WebView says PIPELINE_ERROR_DECODE). So a video sent in a chat is looked at once, and if it isn't
// one that plays everywhere (H.264, VP8, VP9 or AV1, 8-bit, not HDR), a copy that is (H.264 and
// AAC, at most 1280 pixels on its longer side, HDR toned down to ordinary colours) is made beside
// it, for the chat's player; saving it still gets the original. Kept with the photos' smaller
// copies (lib/dms.js previewOf), named after its file: "<file>.play.mp4", or "<file>.fine" (it
// plays as it is) or "<file>.nocopy" (one couldn't be made), so each's only looked at once.
//
// With ffmpeg: the ffmpeg-static package's, FFMPEG_PATH's, or one on the PATH. Without it, none of
// this happens (videos play as they are, where they can). One at a time, at the lowest priority,
// on one thread, so calls and the chat don't wait for it: a minute of phone video takes a minute
// or two on a small server. Longer than 15 minutes, it isn't tried.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const blobs = require('./blobs');

const PREVIEWS_DIR = path.join(require('./db').DATA_DIR, 'previews');
const LONGEST_S = 15 * 60;
const TOOK_TOO_LONG_MS = 30 * 60_000;
const FROM_R2_MAX = 120 * 1024 * 1024; // (the server's memory is small)

const FFMPEG = (() => {
  const tries = [process.env.FFMPEG_PATH];
  try { tries.push(require('ffmpeg-static')); } catch {}
  tries.push('ffmpeg');
  for (const bin of tries.filter(Boolean)) {
    try {
      if (spawnSync(bin, ['-hide_banner', '-version'], { timeout: 10_000 }).status === 0) return bin;
    } catch {}
  }
  return null;
})();
if (!FFMPEG) console.log('[videos] No ffmpeg: videos that some phones cannot play get no copy that they can (see lib/videos.js).');

const names = (file) => ({ play: `${file}.play.mp4`, fine: `${file}.fine`, none: `${file}.nocopy` });
const isVideo = (r) => Boolean(r && r.kind === 'file' && /^video\//.test(r.file_type || ''));

// What's known of one already: 'ready' (its copy's there), 'fine', 'none', or '' (not looked at).
function stateOf(r) {
  if (!isVideo(r)) return 'fine';
  const n = names(r.file_path);
  if (blobs.exists('previews', n.play)) return 'ready';
  if (fs.existsSync(path.join(PREVIEWS_DIR, n.fine))) return 'fine';
  if (fs.existsSync(path.join(PREVIEWS_DIR, n.none))) return 'none';
  return making.has(r.file_path) ? 'working' : '';
}
const playName = (r) => names(r.file_path).play;

// What ffmpeg says of it: its video's codec, its pixels' format and its colours, and how long.
function probe(src) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-i', src], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { if (err.length < 64_000) err += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const v = /Stream #\d+:\d+[^:]*: Video: (\w+)([^\n]*)/.exec(err);
      if (!v) return resolve(null);
      const rest = v[2];
      const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
      resolve({
        codec: v[1],
        tenBit: /\b(yuv|gbr|p)\w*(10|12)(le|be)\b|\bp010\b|Main 10|High 10/.test(rest),
        pix: (/\b(yuvj?\d{3}p\w*|nv12|p010\w*)\b/.exec(rest) || [])[1] || '',
        hdr: /smpte2084|arib-std-b67|bt2020/.test(rest) || /DOVI|dvh1|dvhe/i.test(err),
        seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
      });
    });
  });
}

// Whether it plays everywhere as it is.
const playsEverywhere = (info) => ['h264', 'vp8', 'vp9', 'av1'].includes(info.codec) && !info.tenBit && !info.hdr && /^(yuvj?420p|nv12)$/.test(info.pix || 'yuv420p');

function run(args, ms) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    try { os.setPriority(p.pid, 19); } catch {} // (last in line for the processor)
    const timer = setTimeout(() => p.kill('SIGKILL'), ms);
    p.on('error', () => resolve({ ok: false, err: 'ffmpeg would not start' }));
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, err });
    });
  });
}

// The copy: smaller first (so the rest has less to do), HDR's colours toned down to ordinary ones,
// then H.264 and AAC, ready to play from its start (+faststart). (A build of ffmpeg without zscale
// can't tone it down: then plainly, its colours a little flat.)
async function transcode(src, out, info) {
  const fit = "scale=w='if(gte(iw,ih),min(1280,iw),-2)':h='if(gte(iw,ih),-2,min(1280,ih))':flags=bilinear";
  const tone = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
  const chains = info.hdr ? [`${fit},${tone}`, `${fit},format=yuv420p`] : [`${fit},format=yuv420p`];
  for (const vf of chains) {
    const r = await run([
      '-hide_banner', '-nostdin', '-y', '-threads', '1', '-i', src,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-map_metadata', '-1',
      // (One thread for its filters too: a 4K video in about 160 MB, not 350.)
      '-filter_threads', '1', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
      '-threads', '1', '-x264-params', 'rc-lookahead=10:ref=2',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', out,
    ], TOOK_TOO_LONG_MS);
    if (r.ok && fs.existsSync(out) && fs.statSync(out).size > 0) return true;
    fs.rmSync(out, { force: true });
    console.warn(`[videos] A copy didn't come (${vf.includes('zscale') ? 'toned down' : 'plainly'}): ${r.err.split('\n').filter(Boolean).slice(-2).join(' / ')}`);
  }
  return false;
}

// Looked at, and a copy made if it needs one (one at a time). Resolves with its state, once it has
// one: 'ready', 'fine' or 'none'. (done: told once its copy's there, to tell its conversation.
// force: made even of one that should play everywhere, a phone having said it can't.)
const making = new Map();
let queue = Promise.resolve();
function makePlayable(r, done, { force = false } = {}) {
  if (!FFMPEG || !isVideo(r)) return Promise.resolve('fine');
  const now = stateOf(r);
  if (now && now !== 'working' && !(force && now === 'fine')) return Promise.resolve(now);
  if (making.has(r.file_path)) return making.get(r.file_path);
  const n = names(r.file_path);
  const mark = (name) => fs.writeFileSync(path.join(PREVIEWS_DIR, name), '');
  const job = (queue = queue.then(async () => {
    // (One that's gone on to R2 comes back whole, into memory, to work from: not a big one.)
    if (!fs.existsSync(blobs.localPath('files', r.file_path)) && r.file_size > FROM_R2_MAX) { mark(n.none); return 'none'; }
    const src = await blobs.localCopy('files', r.file_path);
    if (!src) return 'none';
    const info = await probe(src);
    if (!info) { mark(n.none); return 'none'; }
    if (playsEverywhere(info) && !force) { mark(n.fine); return 'fine'; }
    fs.rmSync(path.join(PREVIEWS_DIR, n.fine), { force: true });
    if (info.seconds > LONGEST_S) { mark(n.none); return 'none'; }
    const out = path.join(PREVIEWS_DIR, n.play);
    const t0 = Date.now();
    const ok = await transcode(src, `${out}.part`, info);
    if (!blobs.exists('files', r.file_path)) { fs.rmSync(`${out}.part`, { force: true }); return 'none'; } // (deleted meanwhile)
    if (!ok) { mark(n.none); return 'none'; }
    fs.renameSync(`${out}.part`, out);
    console.log(`[videos] A copy that plays everywhere (${info.codec}${info.tenBit ? ' 10-bit' : ''}${info.hdr ? ' HDR' : ''}, ${Math.round(info.seconds)} s) in ${Math.round((Date.now() - t0) / 1000)} s.`);
    await blobs.offload('previews', n.play, 'video/mp4'); // (to R2, if it's set up)
    return 'ready';
  }).catch((err) => {
    console.warn(`[videos] ${err.message}`);
    return 'none';
  }).then((state) => {
    making.delete(r.file_path);
    if (state === 'ready' && done) done();
    return state;
  }));
  making.set(r.file_path, job);
  return job;
}

// Gone with its file (lib/dms.js removeFile).
function removeFor(file) {
  if (!file) return;
  const n = names(file);
  blobs.remove('previews', n.play);
  for (const name of [n.fine, n.none, `${n.play}.part`]) fs.rm(path.join(PREVIEWS_DIR, name), { force: true }, () => {});
}

module.exports = { enabled: Boolean(FFMPEG), stateOf, playName, makePlayable, removeFor, probe, playsEverywhere };
