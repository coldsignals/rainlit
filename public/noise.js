// Noise suppression for your microphone (Settings > Voice and video), Rainlit's own: what it hears is
// cleaned up by a small neural network before anyone hears it, the browser's own left off.
//   Standard: GTCRN, tiny and quick: 200 KB, about 32 ms later. (It hears up to 8 kHz: a voice is
//   all there, if a touch less crisp.) Far more taken out than RNNoise's: 23 to 41 dB of a fan and
//   keys to its 6 to 13 (scripts/tools/noise-compare.mjs).
//   Strong: DeepFilterNet 3, bigger and cleaner, the whole of a voice: about 12 MB, fetched the first
//   time it's wanted (prepare), about 51 ms later.
// Strength (0 to 1): how much it may take away. Under 1, some of what the mic heard is kept, faintly
// (as much quieter as `atten`: 40 dB at most), lined up with what's been cleaned so the voice stays
// whole; at 1, all it can. (Strong takes that as how much quieter it may make noise under a voice,
// and in pauses more.) The engines, and their licences: public/vendor/noise/NOTICE.txt.
// An ES module (app.js imports it when it's first needed; voice channels' LiveKit too).

const BASE = '/vendor/noise/';
const RATE = 48000;
// (How much later what comes out is than what went in, in samples at 48 kHz: what's been heard is
// kept back that much to line up with it. Measured: scripts/tools/noise-compare.mjs.)
const ENGINES = {
  gtcrn: { worklet: `${BASE}gtcrn-worklet.js`, processor: '@sapphi-red/web-noise-suppressor/gtcrn', wasm: `${BASE}gtcrn.wasm`, delay: 1530 },
};
const DFN3 = {
  module: `${BASE}dfn3/deepfilternet.js`, worklet: `${BASE}dfn3/deepfilternet-worklet-processor.js`,
  wasm: `${BASE}dfn3/df_bg.wasm`, model: `${BASE}dfn3/DeepFilterNet3_onnx.tar.gz`,
};
export const ENGINE_NAMES = ['gtcrn', 'dfn3'];

// Whether it can run here at all (an AudioWorklet, and WebAssembly).
export const supported = () => typeof AudioWorkletNode === 'function' && typeof WebAssembly === 'object' && typeof AudioContext === 'function';

// (How much quieter what it takes away may be made, in dB: none at strength 0, 40 dB at 0.99, and
// as much as it can at 1.)
export const attenOf = (strength) => (strength >= 1 ? Infinity : Math.max(0, strength) * 40);

// (Each engine's worklet, added once to each context; each one's WebAssembly, fetched once.)
const added = new WeakMap(); // context -> Map(url -> Promise)
function addModule(ctx, url) {
  let m = added.get(ctx);
  if (!m) added.set(ctx, (m = new Map()));
  if (!m.has(url)) m.set(url, ctx.audioWorklet.addModule(url));
  return m.get(url);
}
const binaries = new Map();
function wasmOf(e) {
  const url = e.wasm;
  if (!binaries.has(url)) {
    binaries.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Noise suppression couldn't load (${r.status}).`);
      return r.arrayBuffer();
    }).catch((err) => {
      binaries.delete(url);
      throw err;
    }));
  }
  return binaries.get(url);
}
let dfn3Loader = null;
const loadDfn3 = () => (dfn3Loader ||= import(DFN3.module).catch((err) => {
  dfn3Loader = null;
  throw err;
}));
const dfn3Options = (strength) => {
  const atten = attenOf(strength);
  const speech = Number.isFinite(atten) ? Math.max(3, atten) : 100;
  // (In pauses, 20 dB more, its gate looking a frame ahead: 20 ms sooner than its default of three.)
  return {
    moduleUrl: DFN3.worklet, wasmUrl: DFN3.wasm, modelUrl: DFN3.model,
    speechAttenuationDb: speech, pauseAttenuationDb: Math.min(100, speech + 20), pauseGateLookaheadFrames: 1,
  };
};

// Strong's 12 MB, fetched (and its engine made ready) before it's wanted: when it's picked, say, so
// a call doesn't wait. Its loader keeps them, for every mic it cleans after. (A context made only for
// that, and closed.)
let dfn3Prepared = null;
export function prepare(engine) {
  if (engine !== 'dfn3') return Promise.resolve();
  dfn3Prepared ||= (async () => {
    const { createDeepFilterNetAudioWorklet } = await loadDfn3();
    // (A context that can be closed, so its engine goes with it: an OfflineAudioContext can't be, and
    // kept its engine, 80 MB or so, each time.)
    const scratch = new AudioContext({ sampleRate: RATE });
    try {
      const d = await createDeepFilterNetAudioWorklet(scratch, dfn3Options(0.8));
      d.dispose();
    } finally {
      scratch.close().catch(() => {});
    }
    dfn3Ready = true;
  })().catch((err) => {
    dfn3Prepared = null;
    throw err;
  });
  return dfn3Prepared;
}
let dfn3Ready = false;
export const isReady = (engine) => engine !== 'dfn3' || dfn3Ready;
// Strong, let go of (nothing's using a mic): what it fetched and made ready, a hundred MB or so, back.
// The next time it's wanted it's fetched again (from the browser's cache, as a rule) and made ready.
// A mic it's cleaning has its own, and keeps it till it's stopped. (Its module stays, as a module
// does: what it keeps is let go of. Its forget is Rainlit's, added to it: vendor/noise/NOTICE.txt.)
export function release() {
  if (dfn3Loader) dfn3Loader.then((m) => m.forget && m.forget(), () => {});
  dfn3Prepared = null;
  dfn3Ready = false;
}

// The cleaning-up, in `ctx` (48 kHz): what's heard goes into `input`, what's cleaned comes out of
// `output`. `ready`: once it's cleaning (Strong, till then, passes on what it hears). `delay`: how
// much later, in seconds. dispose(): it's done with.
export async function suppressor(ctx, engine = 'rnnoise', strength = 0.8) {
  if (ctx.sampleRate !== RATE) throw new Error(`Noise suppression needs a ${RATE} Hz AudioContext.`);
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (engine === 'dfn3') {
    const { createDeepFilterNetAudioWorklet } = await loadDfn3();
    const d = await createDeepFilterNetAudioWorklet(ctx, dfn3Options(strength));
    d.ready.then(() => { dfn3Ready = true; }, () => {});
    input.connect(d.node).connect(output);
    return {
      input, output, delay: 0.051, ready: d.ready,
      dispose() {
        d.dispose();
        input.disconnect();
        output.disconnect();
      },
    };
  }
  const e = ENGINES[engine] || ENGINES.gtcrn;
  const [, wasmBinary] = await Promise.all([addModule(ctx, e.worklet), wasmOf(e)]);
  const node = new AudioWorkletNode(ctx, e.processor, {
    channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1],
    processorOptions: { maxChannels: 1, wasmBinary },
  });
  const atten = attenOf(strength);
  const keep = Number.isFinite(atten) ? 10 ** (-atten / 20) : 0;
  const wet = ctx.createGain();
  wet.gain.value = 1 - keep;
  input.connect(node).connect(wet).connect(output);
  let dry = null;
  if (keep > 0) {
    // (What was heard, kept back to line up with what's been cleaned, quieter.)
    const late = ctx.createDelay(1);
    late.delayTime.value = e.delay / RATE;
    dry = ctx.createGain();
    dry.gain.value = keep;
    input.connect(late).connect(dry).connect(output);
  }
  return {
    input, output, delay: e.delay / RATE, ready: Promise.resolve(),
    dispose() {
      node.port.postMessage('destroy');
      input.disconnect();
      node.disconnect();
      wet.disconnect();
      if (dry) dry.disconnect();
      output.disconnect();
    },
  };
}

// A context of its own, running: one that can't (the browser won't start it without a click first,
// say) is no use, as all it would send is silence.
async function runningContext() {
  const ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
  if (ctx.state !== 'running') {
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
  }
  if (ctx.state !== 'running') {
    ctx.close().catch(() => {});
    throw Object.assign(new Error("Noise suppression couldn't start just now."), { name: 'NotRunning' });
  }
  // (Paused by something else meanwhile, a phone call say: going again when it can.)
  ctx.addEventListener('statechange', () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); });
  // (Something played, if only a whisper: a millionth, far below anything a speaker can make, so
  // the device's own clock keeps running it. One that plays nothing at all is, after half a minute,
  // run by a stand-in clock instead, and on some phones that goes too fast (two or six times), so the
  // track it feeds carries more sound than there was, and a call's other end hears it chopped up.)
  const keep = ctx.createConstantSource();
  keep.offset.value = 1e-6;
  keep.connect(ctx.destination);
  keep.start();
  return ctx;
}

// How fast a context's clock goes by the wall's (1: just as it should), looked at every few
// seconds: `fast(rate)` once it's been too fast (a quarter more) twice running. Returns a stop.
const CLOCK_EVERY = 5000;
function watchClock(ctx, fast) {
  let at = { clock: ctx.currentTime, wall: performance.now() };
  let over = 0;
  const timer = setInterval(() => {
    if (ctx.state !== 'running') return;
    const now = { clock: ctx.currentTime, wall: performance.now() };
    const rate = (now.clock - at.clock) / Math.max(0.001, (now.wall - at.wall) / 1000);
    at = now;
    over = rate > 1.25 ? over + 1 : 0;
    if (over === 2) fast(rate);
  }, CLOCK_EVERY);
  return () => clearInterval(timer);
}

// What `raw` (a microphone's track) hears, cleaned up: a track of its own, that passes for the mic's
// (its name, its settings, and when it ends), and stopping it stops the mic and all of this. Strong,
// not fetched yet, is Standard till next time (fetched meanwhile): `rainlitNoise` on the track says
// which it is. Waits for it to be cleaning, up to `wait` ms; past that it passes on what's heard
// meanwhile. Throws if it can't run here: the mic's track is then the caller's still, as it was.
export async function cleanTrack(raw, { engine = 'gtcrn', strength = 0.8, wait = 4000 } = {}) {
  if (engine === 'dfn3' && !dfn3Ready) {
    const fetched = await Promise.race([prepare('dfn3').then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 50))]);
    if (!fetched) engine = 'gtcrn';
  }
  const ctx = await runningContext();
  let s;
  try {
    s = await suppressor(ctx, engine, strength);
  } catch (err) {
    ctx.close().catch(() => {});
    throw err;
  }
  await Promise.race([s.ready.catch(() => {}), new Promise((r) => setTimeout(r, wait))]);
  const src = ctx.createMediaStreamSource(new MediaStream([raw]));
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 1;
  src.connect(s.input);
  s.output.connect(dest);
  const track = dest.stream.getAudioTracks()[0];
  // (Its clock, to keep an eye on: too fast, the track says so, for the app to start it again.)
  const unwatch = watchClock(ctx, (rate) => track.dispatchEvent(new CustomEvent('rainlitfast', { detail: rate })));
  let stopped = false;
  const stopAll = () => {
    if (stopped) return;
    stopped = true;
    unwatch();
    try { src.disconnect(); } catch {}
    s.dispose();
    ctx.close().catch(() => {});
  };
  const stop = track.stop.bind(track);
  Object.defineProperties(track, {
    label: { get: () => raw.label },
    readyState: { get: () => (raw.readyState === 'ended' ? 'ended' : 'live') },
  });
  track.getSettings = () => ({ ...raw.getSettings(), noiseSuppression: true });
  track.getCapabilities = () => raw.getCapabilities();
  track.rainlitNoise = engine;
  track.rainlitTime = () => ctx.currentTime; // (its clock: the call debug log notes how far it goes)
  track.stop = () => {
    stop();
    raw.stop();
    stopAll();
  };
  raw.addEventListener('ended', () => track.dispatchEvent(new Event('ended')));
  return track;
}

// The same for a voice channel's microphone, which LiveKit opens (and keeps) itself: a processor for
// its LocalAudioTrack.setProcessor. (LiveKit gives it a context: ours, from contextForLivekit and
// setAudioContext, closed when it's done with.)
export function livekitProcessor({ engine = 'gtcrn', strength = 0.8, fast = () => {} } = {}) {
  let ctx = null;
  let current = null;
  const start = async (track, ctx) => {
    const s = await suppressor(ctx, engine, strength);
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;
    src.connect(s.input);
    s.output.connect(dest);
    current = { s, src, unwatch: watchClock(ctx, fast) };
    return dest.stream.getAudioTracks()[0];
  };
  const end = () => {
    if (!current) return;
    current.unwatch();
    try { current.src.disconnect(); } catch {}
    current.s.dispose();
    current = null;
  };
  return {
    name: `rainlit-noise-${engine}`,
    processedTrack: undefined,
    async init({ track, audioContext }) {
      ctx = audioContext;
      this.processedTrack = await start(track, ctx);
    },
    async restart({ track, audioContext }) {
      end();
      ctx = audioContext || ctx;
      this.processedTrack = await start(track, ctx);
    },
    async destroy() {
      end();
      this.processedTrack = undefined;
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
// (A context for LiveKit's track to give its processor: 48 kHz, running.)
export const contextForLivekit = runningContext;
