// Sharing a window, captured by the app itself: its picture and its app's sound, from the native
// add-on (native/src/capture.cc), sent straight to the page through a port. This runs in a
// process of its own (Electron's utility process), so the app's window never stutters while it
// works, and a problem here can't take the app down.
//
// From the main process: { type: 'supported' }, and { type: 'start', id, hwnd, audio, maxWidth,
// maxHeight, fps } with the port to send on. It answers each with { id, ... }. And for your
// activity, { type: 'activity', id, media }: the windows that are open, what's playing (if
// `media`), and where Steam is (see main.js).
// Through the port: { t: 'v', w, h, format, ts, data } (a frame), { t: 'a', frames, rate,
// channels, ts, data } (10ms of sound), { t: 'noaudio' }, { t: 'ended' }. The page can send
// { t: 'stop' } or { t: 'tune', maxWidth, maxHeight, fps }, or just close the port.

const path = require('node:path');

let native = null;
let loadError = '';
try {
  native = require(path.join(__dirname, 'native', 'build', 'Release', 'rainlit_capture.node'));
} catch (err) {
  loadError = err.message;
}

const shares = new Map(); // id -> { port, video, audio, watch }

function stop(id) {
  const s = shares.get(id);
  if (!s) return;
  shares.delete(id);
  clearInterval(s.watch);
  try { if (s.video) native.stopWindow(s.video); } catch {}
  try { if (s.audio) native.stopAudio(s.audio); } catch {}
  // (The page hears it's over; the port closes once that's on its way.)
  try { s.port.postMessage({ t: 'ended' }); } catch {}
  setTimeout(() => { try { s.port.close(); } catch {} }, 500);
}

// A window (hwnd) or a whole screen (monitor, a handle from listMonitors). A window's sound is
// just its app's; a screen's is everything but Rainlit (excludePid), so your friend isn't echoed.
function start({ id, hwnd, monitor, audio, excludePid, maxWidth, maxHeight, fps }, port) {
  if (!native || !port) return { id, ok: false, message: loadError || 'No port' };
  const s = { port, video: 0, audio: 0, watch: 0 };
  shares.set(id, s);
  port.on('message', (e) => {
    const m = e.data || {};
    if (m.t === 'stop') stop(id);
    else if (m.t === 'tune' && s.video) {
      try { native.tuneWindow(s.video, { maxWidth: m.maxWidth | 0 || 1920, maxHeight: m.maxHeight | 0 || 1080, fps: m.fps | 0 || 30 }); } catch {}
    }
  });
  port.on('close', () => stop(id));
  port.start();
  const onFrame = (f) => port.postMessage({ t: 'v', w: f.w, h: f.h, format: f.format, ts: f.ts, data: f.data });
  const onEnd = (ev) => { if (ev === 'closed') stop(id); };
  try {
    s.video = monitor
      ? native.startMonitor({ id: monitor, maxWidth, maxHeight, fps }, onFrame, onEnd)
      : native.startWindow({ hwnd, maxWidth, maxHeight, fps }, onFrame, onEnd);
  } catch (err) {
    shares.delete(id);
    try { port.close(); } catch {}
    return { id, ok: false, message: err.message };
  }
  // A window closing (or its app quitting, even suddenly) ends the sharing. (Windows says so,
  // mostly; this makes sure.) A monitor doesn't close like that: its own 'closed' (unplugged) does.
  if (!monitor) {
    s.watch = setInterval(() => {
      let alive = false;
      try { alive = native.windowProcess(hwnd) > 0; } catch {}
      if (!alive) stop(id);
    }, 500);
  }
  const onAudio = (c) => port.postMessage({ t: 'a', frames: c.frames, rate: c.rate, channels: c.channels, ts: c.ts, data: c.data });
  if (audio) {
    try {
      s.audio = monitor ? native.startSystemAudio({ excludePid }, onAudio) : native.startAudio({ pid: native.windowProcess(hwnd) }, onAudio);
    } catch {
      port.postMessage({ t: 'noaudio' });
    }
  }
  return { id, ok: true, audio: Boolean(s.audio) };
}

process.parentPort.on('message', (e) => {
  const m = e.data || {};
  if (m.type === 'supported') {
    const can = native ? native.supported() : { window: false, monitor: false, audio: false };
    process.parentPort.postMessage({ id: m.id, ok: Boolean(native), ...can, message: loadError });
  } else if (m.type === 'monitors') {
    let monitors = [];
    try { if (native && native.listMonitors) monitors = native.listMonitors(); } catch {}
    process.parentPort.postMessage({ id: m.id, ok: true, monitors });
  } else if (m.type === 'start') {
    process.parentPort.postMessage(start(m, e.ports[0]));
  } else if (m.type === 'stop') {
    stop(m.id);
  } else if (m.type === 'activity') {
    if (!native || !native.listWindows) return process.parentPort.postMessage({ id: m.id, ok: false });
    try {
      process.parentPort.postMessage({ id: m.id, ok: true, windows: native.listWindows(), media: m.media ? native.mediaSessions() : [], steam: native.steam() });
    } catch (err) {
      process.parentPort.postMessage({ id: m.id, ok: false, message: err.message });
    }
  }
});
