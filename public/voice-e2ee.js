'use strict';

// Voice channels' end-to-end encryption, when they go through Cloudflare (voice-cf.js): every
// frame of sound and video is encrypted here before it leaves, and decrypted here when it
// arrives, with a key made from the channel's own (which only Rainlit hands out, to the people
// in it). Cloudflare only ever passes along scrambled frames.
//
// Each frame: AES-GCM with a fresh random IV. A few bytes at the start stay readable (and are
// checked, as "additional data"), because the browsers and Cloudflare need them to handle the
// frame: 1 for sound (Opus), 10 for a video key frame and 3 for the rest (VP8), as LiveKit and
// Jitsi do. At the end: the IV (12 bytes), how many bytes stayed readable, and a marker.
//
// Two ways frames get here: RTCRtpScriptTransform (Firefox, Safari, newer Chrome), or streams
// posted from the page (Chrome's createEncodedStreams).

const MARK = 0x52; // "R"
let key = null;
let errors = 0;

async function setKey(raw) {
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('rainlit voice'), info: new TextEncoder().encode('frames') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

const readable = (frame, kind) => (kind === 'audio' ? 1 : frame.type === 'key' ? 10 : 3);

async function encrypt(frame, controller, kind) {
  const data = new Uint8Array(frame.data);
  if (!data.length) return controller.enqueue(frame);
  if (!key) return; // (nothing goes out unencrypted)
  const n = Math.min(readable(frame, kind), data.length);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: data.subarray(0, n) }, key, data.subarray(n)));
  const out = new Uint8Array(n + sealed.length + 14);
  out.set(data.subarray(0, n), 0);
  out.set(sealed, n);
  out.set(iv, n + sealed.length);
  out[out.length - 2] = n;
  out[out.length - 1] = MARK;
  frame.data = out.buffer;
  controller.enqueue(frame);
}

async function decrypt(frame, controller) {
  const data = new Uint8Array(frame.data);
  if (!data.length) return controller.enqueue(frame);
  const n = data.length >= 30 ? data[data.length - 2] : -1;
  if (!key || data[data.length - 1] !== MARK || n < 0 || n > 10) return failed();
  try {
    const iv = data.subarray(data.length - 14, data.length - 2);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: data.subarray(0, n) }, key, data.subarray(n, data.length - 14)));
    const out = new Uint8Array(n + plain.length);
    out.set(data.subarray(0, n), 0);
    out.set(plain, n);
    frame.data = out.buffer;
    controller.enqueue(frame);
  } catch {
    failed();
  }
}

// (A frame that can't be decrypted is dropped. The page hears about it, now and then.)
function failed() {
  if (errors++ % 100 === 0) self.postMessage({ type: 'error' });
}

// (Video coming in, from partway through: nothing can be shown until a keyframe comes, and a
// still screen sends one only when asked. So until one's come through, one's asked for, every
// second, where the browser lets this worker ask.)
function pipe(readableStream, writableStream, operation, kind, asker) {
  let keyed = !(asker && typeof asker.sendKeyFrameRequest === 'function');
  let asked = 0;
  const transform = new TransformStream({
    transform: (frame, controller) => {
      note(operation, kind, frame);
      if (!keyed) {
        if (frame.type === 'key') keyed = true;
        else if (Date.now() - asked > 1000) {
          asked = Date.now();
          asker.sendKeyFrameRequest().catch(() => {});
        }
      }
      return operation === 'encrypt' ? encrypt(frame, controller, kind) : decrypt(frame, controller);
    },
  });
  readableStream.pipeThrough(transform).pipeTo(writableStream).catch(() => {});
}

self.onrtctransform = (event) => {
  const t = event.transformer;
  const { operation, kind } = t.options;
  pipe(t.readable, t.writable, operation, kind, operation === 'decrypt' && kind === 'video' ? t : null);
};

self.onmessage = (event) => {
  const m = event.data || {};
  if (m.type === 'key') setKey(m.key);
  else if (m.type === 'streams') pipe(m.readable, m.writable, m.operation, m.kind);
  else if (m.type === 'stats') self.postMessage({ type: 'stats', sizes: sizes.splice(0) });
};

// (For finding out what's going through: the sizes of the latest frames, on request.)
const sizes = [];
function note(operation, kind, frame) {
  if (sizes.length < 400) sizes.push(`${operation[0]}${kind[0]}${frame.type ? frame.type[0] : ''}:${frame.data.byteLength}`);
}
