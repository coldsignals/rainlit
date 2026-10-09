// Renders Rainlit's chime and ringtone to WAV files for the Android app's notifications.
// They're the same bell notes the website's Classic sounds play (bellNote, and SOUND_STYLES'
// classic chime and ring, in public/app.js), so a notification sounds like Rainlit. Run:
// node make-sounds.js

'use strict';

const fs = require('fs');
const path = require('path');

const RATE = 44100;
const OUT = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', 'raw');

// One soft bell note: the note itself plus a quiet overtone, each fading out.
// Same shape as bellNote() on the website (Web Audio exponential ramps).
function bell(samples, freq, at, loudness = 1) {
  for (const [mult, level, length] of [[1, 0.16, 0.9], [2.76, 0.035, 0.35]]) {
    const peak = level * loudness;
    const start = Math.round(at * RATE);
    const end = Math.min(samples.length, start + Math.round((length + 0.05) * RATE));
    for (let i = start; i < end; i++) {
      const t = (i - start) / RATE;
      let gain;
      if (t < 0.012) gain = 0.0001 * (peak / 0.0001) ** (t / 0.012);
      else if (t < length) gain = peak * (0.0001 / peak) ** ((t - 0.012) / (length - 0.012));
      else gain = 0;
      samples[i] += gain * Math.sin(2 * Math.PI * freq * mult * (t + at));
    }
  }
}

function wav(name, seconds, draw) {
  const samples = new Float64Array(Math.round(seconds * RATE));
  draw(samples);
  // Louder than on the website: the phone's own volume controls how loud it plays.
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const scale = 0.8 / peak;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * scale * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.concat([header, data]));
  console.log(`${name}.wav: ${seconds}s, ${Math.round((44 + data.length) / 1024)} KB`);
}

// New message: E5 then C5, like a doorbell.
wav('rainlit_chime', 1.2, (s) => {
  bell(s, 659.25, 0.02);
  bell(s, 523.25, 0.19);
});

// Incoming call: C, E, G, E, then a pause. The phone repeats it until the call is answered,
// the same every-3-seconds rhythm as on the website.
wav('rainlit_ring', 3.0, (s) => {
  for (const [freq, at] of [[523.25, 0], [659.25, 0.2], [783.99, 0.4], [659.25, 0.72]]) bell(s, freq, at + 0.02);
});
