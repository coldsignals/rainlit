// Homepage scenes: a page's background, alive. public/homepage.js (sceneOn) loads this the first
// time a page has one, draws the scene in view behind the weather and the page's pieces, and
// tells it where the pointer is, and where the page is pressed (a click or a tap, anywhere: on a
// piece too, the scene answering behind it). Each scene is made for a canvas's 2D context, in CSS
// pixels, with the page's two colours, and has:
//   resize(w, h)   (the view's size; it starts over)
//   frame(dt)      (dt: seconds since the last frame)
//   point(x, y)    (where the pointer is; null when it's gone)
//   poke(x, y)     (pressed there)
//   still()        (one picture that stands for it: for someone who'd rather things didn't
//                  move, and the editor's swatches)
// Starfield flight and Bubbles are everyone's; Pipes, Pond and Lava lamp come with Glow
// (lib/homepages.js keeps to that).

const rgbOf = (hex) => {
  const n = parseInt(String(hex || '').replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const shade = (c, k) => (k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const canvasOf = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

// ---------- Starfield flight ----------
// Flying through the stars, as the old screensaver did: they stream out from where you're headed,
// which the pointer steers; a click or a tap is a burst of warp speed (towards there).
function warp(g, c1, c2) {
  const space = rgbOf(c1);
  const star = rgbOf(c2);
  const tints = [star, mix(star, [150, 185, 255], 0.45), mix(star, [255, 220, 160], 0.45)];
  let w = 1;
  let h = 1;
  let stars = [];
  let far = null; // (the faintest, far away: they don't move)
  let cx = 0.5;
  let cy = 0.5;
  let aimX = 0.5;
  let aimY = 0.5;
  let boost = 0;
  const place = (s, far) => {
    s.x = rand(-1, 1);
    s.y = rand(-1, 1);
    s.z = far ? rand(0.75, 1) : rand(0.04, 1);
    s.tint = tints[Math.floor(Math.random() * tints.length)];
    s.px = null;
  };
  // (still: as dots a little bigger and brighter, to read as one picture, or small.)
  const draw = (dt, still = false) => {
    g.drawImage(far, 0, 0, w, h);
    const f = Math.max(w, h) * 0.5;
    const ox = cx * w;
    const oy = cy * h;
    const speed = 0.16 + boost * boost * 1.9;
    g.lineCap = 'round';
    for (const s of stars) {
      s.z -= speed * dt;
      const sx = ox + (s.x / s.z) * f;
      const sy = oy + (s.y / s.z) * f;
      if (s.z < 0.02 || sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) {
        place(s, true);
        continue;
      }
      const near = 1 - s.z;
      const size = (0.5 + near * near * 3) * (still ? 2.2 : 1);
      g.strokeStyle = css(s.tint, clamp(near * 1.8, still ? 0.55 : 0.18, 1));
      g.lineWidth = size;
      g.beginPath();
      if (s.px === null) g.moveTo(sx - 0.01, sy);
      else g.moveTo(s.px, s.py);
      g.lineTo(sx, sy);
      g.stroke();
      s.px = sx;
      s.py = sy;
    }
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      far = canvasOf(w, h);
      const f = far.getContext('2d');
      f.fillStyle = css(space);
      f.fillRect(0, 0, w, h);
      for (let i = 0; i < (w * h) / 2200; i++) {
        f.fillStyle = css(tints[i % 3], rand(0.12, 0.45));
        f.fillRect(rand(0, w), rand(0, h), rand(0.6, 1.4), rand(0.6, 1.4));
      }
      const n = Math.round(clamp((w * h) / 1700, 220, 800));
      stars = Array.from({ length: n }, () => {
        const s = {};
        place(s, false);
        return s;
      });
    },
    frame(dt) {
      cx += (aimX - cx) * Math.min(1, dt * 1.4);
      cy += (aimY - cy) * Math.min(1, dt * 1.4);
      boost = Math.max(0, boost - dt * 0.55);
      draw(dt);
    },
    point(x, y) {
      aimX = x === null ? 0.5 : 0.5 + (x / w - 0.5) * 0.7;
      aimY = y === null ? 0.5 : 0.5 + (y / h - 0.5) * 0.7;
    },
    poke(x, y) {
      boost = 1;
      this.point(x, y);
    },
    still() {
      for (const s of stars) s.px = null;
      draw(0, true);
      for (const s of stars) s.px = null;
    },
  };
}

// ---------- Bubbles ----------
// Soap bubbles drifting up, with a sheen of every colour turning on them. Click or tap one and it
// pops; anywhere else, a new one's blown there. The pointer nudges them aside.
function bubbleFilm() {
  const S = 128;
  const c = canvasOf(S, S);
  const x = c.getContext('2d');
  const m = S / 2;
  // (A whisper of colour across it, and its rim.)
  const body = x.createRadialGradient(m, m, 0, m, m, m);
  body.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
  body.addColorStop(0.72, 'rgba(255, 255, 255, 0.05)');
  body.addColorStop(0.92, 'rgba(255, 255, 255, 0.22)');
  body.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
  x.fillStyle = body;
  x.beginPath();
  x.arc(m, m, m - 0.5, 0, Math.PI * 2);
  x.fill();
  const hues = ['rgba(255, 120, 200, 0.42)', 'rgba(255, 220, 110, 0.38)', 'rgba(120, 255, 170, 0.34)', 'rgba(110, 200, 255, 0.4)', 'rgba(190, 130, 255, 0.4)', 'rgba(255, 120, 200, 0.42)'];
  let sheen;
  if (x.createConicGradient) {
    sheen = x.createConicGradient(0, m, m);
    hues.forEach((hue, i) => sheen.addColorStop(i / (hues.length - 1), hue));
  } else {
    sheen = x.createLinearGradient(0, 0, S, S);
    hues.forEach((hue, i) => sheen.addColorStop(i / (hues.length - 1), hue));
  }
  x.globalCompositeOperation = 'source-atop';
  x.lineWidth = S * 0.13;
  x.strokeStyle = sheen;
  x.beginPath();
  x.arc(m, m, m - S * 0.06, 0, Math.PI * 2);
  x.stroke();
  return c;
}
function bubbleShine() {
  const S = 128;
  const c = canvasOf(S, S);
  const x = c.getContext('2d');
  const spot = (cx, cy, r, a) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  spot(S * 0.34, S * 0.3, S * 0.16, 0.95);
  spot(S * 0.7, S * 0.74, S * 0.08, 0.45);
  return c;
}
function bubbles(g, c1, c2) {
  const top = rgbOf(c1);
  const bottom = rgbOf(c2);
  const film = bubbleFilm();
  const shine = bubbleShine();
  let w = 1;
  let h = 1;
  let back = null;
  let list = [];
  let bits = [];
  let px = null;
  let py = null;
  const want = () => Math.round(clamp((w * h) / 42000, 9, 26));
  const blow = (x, y, r, grow) => ({ x, y, r, size: grow ? 3 : r, vx: rand(-10, 10), vy: -rand(14, 30) * (40 / Math.max(r, 12)) ** 0.3, wob: rand(0, 6.3), spin: rand(0, 6.3), turn: rand(-0.25, 0.25) });
  const fresh = (fromBelow) => {
    const r = rand(12, 46);
    return blow(rand(r, w - r), fromBelow ? h + r + rand(0, h * 0.3) : rand(r, h), r, false);
  };
  const paint = () => {
    g.fillStyle = back;
    g.fillRect(0, 0, w, h);
    for (const b of list) {
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.spin);
      g.drawImage(film, -b.size, -b.size, b.size * 2, b.size * 2);
      g.restore();
      g.drawImage(shine, b.x - b.size, b.y - b.size, b.size * 2, b.size * 2);
    }
    for (const p of bits) {
      g.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
      if (p.ring) {
        g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(p.x, p.y, p.r + p.t * 160, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.fillStyle = 'rgba(255, 255, 255, 0.9)';
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      back = g.createLinearGradient(0, 0, 0, h);
      back.addColorStop(0, css(top));
      back.addColorStop(1, css(bottom));
      list = Array.from({ length: want() }, () => fresh(false));
      bits = [];
    },
    frame(dt) {
      for (const b of list) {
        b.size += (b.r - b.size) * Math.min(1, dt * 6);
        b.wob += dt * 1.3;
        b.spin += b.turn * dt;
        let ax = Math.sin(b.wob) * 9;
        if (px !== null) {
          const dx = b.x - px;
          const dy = b.y - py;
          const d = Math.hypot(dx, dy);
          const reach = b.r + 70;
          if (d < reach && d > 0.01) {
            const push = (1 - d / reach) * 220;
            ax += (dx / d) * push;
            b.vy += (dy / d) * push * dt;
          }
        }
        b.vx += ax * dt;
        b.vx *= Math.exp(-dt * 1.2);
        b.vy += (-(22 + 600 / (b.r + 10)) - b.vy) * Math.min(1, dt * 0.8);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < b.size) {
          b.x = b.size;
          b.vx = Math.abs(b.vx);
        } else if (b.x > w - b.size) {
          b.x = w - b.size;
          b.vx = -Math.abs(b.vx);
        }
      }
      list = list.filter((b) => b.y > -b.r * 2);
      while (list.length < want()) list.push(fresh(true));
      for (const p of bits) {
        p.t += dt;
        if (!p.ring) {
          p.vy += 260 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      bits = bits.filter((p) => p.t < p.life);
      paint();
    },
    point(x, y) {
      px = x;
      py = y;
    },
    poke(x, y) {
      const hit = [...list].reverse().find((b) => Math.hypot(b.x - x, b.y - y) <= b.size);
      if (hit) {
        list = list.filter((b) => b !== hit);
        bits.push({ ring: true, x: hit.x, y: hit.y, r: hit.size * 0.9, t: 0, life: 0.22 });
        const n = Math.round(clamp(hit.size / 3, 7, 16));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
          const v = rand(60, 150);
          bits.push({ x: hit.x + Math.cos(a) * hit.size, y: hit.y + Math.sin(a) * hit.size, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: rand(1.2, 2.6), t: 0, life: rand(0.35, 0.6) });
        }
      } else if (list.length < want() + 8) {
        list.push(blow(x, y, rand(16, 38), true));
      }
    },
    still() {
      paint();
    },
    things: () => list.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.size) })),
  };
}

// ---------- Pipes ----------
// The pipes screensaver: shiny pipes laid joint by joint through a box of space, a colour each,
// turning now and then, till it's full enough; then it fades and they start again. A click or a
// tap starts a new one there. (Now and then a joint's a teapot, as it was.)
function pipes(g, c1, c2) {
  const back = rgbOf(c1);
  const COLORS = [rgbOf(c2), [235, 64, 64], [64, 200, 90], [70, 120, 245], [245, 205, 60], [60, 210, 225], [220, 80, 220], [245, 140, 50], [225, 225, 225]];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let w = 1;
  let h = 1;
  let NX = 16;
  let NY = 10;
  const NZ = 10;
  let filled = null;
  let pipe = null; // { at: [x, y, z], dir, color }
  let laid = 0;
  let pipesLaid = 0;
  let wait = 0;
  let fading = 0;
  let colorAt = 0;
  const D = NZ * 1.7;
  let f = 1;
  const idx = (x, y, z) => (z * NY + y) * NX + x;
  const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ;
  const free = (x, y, z) => inside(x, y, z) && !filled[idx(x, y, z)];
  // (A cell's centre, on the screen, and how big a pipe's radius is there.)
  const project = ([x, y, z]) => {
    const zc = z - (NZ - 1) / 2 + D;
    const s = f / zc;
    return { x: w / 2 + (x - (NX - 1) / 2) * s, y: h / 2 + (y - (NY - 1) / 2) * s, r: 0.19 * s };
  };
  const ball = (p, color, teapot) => {
    const r = p.r * 1.28;
    const grad = g.createRadialGradient(p.x - r * 0.38, p.y - r * 0.42, r * 0.08, p.x, p.y, r * 1.05);
    grad.addColorStop(0, css(shade(color, 0.75)));
    grad.addColorStop(0.3, css(color));
    grad.addColorStop(1, css(shade(color, -0.7)));
    g.fillStyle = grad;
    g.beginPath();
    if (teapot) {
      // (Its body, lid and knob, spout and handle.)
      g.ellipse(p.x, p.y + r * 0.1, r * 1.25, r * 0.95, 0, 0, Math.PI * 2);
      g.moveTo(p.x - r * 0.55, p.y - r * 0.7);
      g.ellipse(p.x, p.y - r * 0.72, r * 0.6, r * 0.22, 0, 0, Math.PI * 2);
      g.moveTo(p.x + r * 0.12, p.y - r * 1.05);
      g.arc(p.x, p.y - r * 1.05, r * 0.12, 0, Math.PI * 2);
      g.moveTo(p.x + r * 1.05, p.y + r * 0.2);
      g.quadraticCurveTo(p.x + r * 1.75, p.y - r * 0.1, p.x + r * 1.9, p.y - r * 0.75);
      g.lineTo(p.x + r * 2.05, p.y - r * 0.6);
      g.quadraticCurveTo(p.x + r * 1.8, p.y + r * 0.25, p.x + r * 1.0, p.y + r * 0.55);
      g.fill();
      g.lineWidth = r * 0.22;
      g.strokeStyle = css(shade(color, -0.25));
      g.beginPath();
      g.ellipse(p.x - r * 1.35, p.y + r * 0.05, r * 0.42, r * 0.52, 0, Math.PI * 0.5, Math.PI * 1.5);
      g.stroke();
      return;
    }
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
  };
  const tube = (a, b, color) => {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    a = { x: a.x - dx * 0.8, y: a.y - dy * 0.8, r: a.r };
    b = { x: b.x + dx * 0.8, y: b.y + dy * 0.8, r: b.r };
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const r = (a.r + b.r) / 2;
    const grad = g.createLinearGradient(mx - nx * r, my - ny * r, mx + nx * r, my + ny * r);
    grad.addColorStop(0, css(shade(color, -0.72)));
    grad.addColorStop(0.28, css(color));
    grad.addColorStop(0.42, css(shade(color, 0.6)));
    grad.addColorStop(0.58, css(color));
    grad.addColorStop(1, css(shade(color, -0.78)));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(a.x + nx * a.r, a.y + ny * a.r);
    g.lineTo(b.x + nx * b.r, b.y + ny * b.r);
    g.lineTo(b.x - nx * b.r, b.y - ny * b.r);
    g.lineTo(a.x - nx * a.r, a.y - ny * a.r);
    g.closePath();
    g.fill();
  };
  const begin = (at) => {
    const spot = at || (() => {
      for (let i = 0; i < 40; i++) {
        const c = [Math.floor(rand(0, NX)), Math.floor(rand(0, NY)), Math.floor(rand(0, NZ))];
        if (free(...c)) return c;
      }
      return null;
    })();
    if (!spot) return false;
    const color = COLORS[colorAt++ % COLORS.length];
    filled[idx(...spot)] = 1;
    pipe = { at: spot, dir: DIRS[Math.floor(rand(0, 6))], color };
    ball(project(spot), color, false);
    pipesLaid++;
    return true;
  };
  // One joint further (or a turn, now and then, or when it must): false if it's stuck.
  const step = () => {
    const { at, color } = pipe;
    let dir = pipe.dir;
    const ahead = [at[0] + dir[0], at[1] + dir[1], at[2] + dir[2]];
    if (!free(...ahead) || Math.random() < 0.22) {
      const ways = DIRS.filter((d) => !(d[0] === -dir[0] && d[1] === -dir[1] && d[2] === -dir[2]) && free(at[0] + d[0], at[1] + d[1], at[2] + d[2]));
      if (!ways.length) return false;
      const turned = ways[Math.floor(rand(0, ways.length))];
      if (turned !== dir) ball(project(at), color, Math.random() < 1 / 250);
      dir = turned;
    }
    const next = [at[0] + dir[0], at[1] + dir[1], at[2] + dir[2]];
    filled[idx(...next)] = 1;
    laid++;
    tube(project(at), project(next), color);
    pipe.at = next;
    pipe.dir = dir;
    return true;
  };
  const restart = () => {
    filled = new Uint8Array(NX * NY * NZ);
    laid = 0;
    pipesLaid = 0;
    pipe = null;
    fading = 0;
    g.fillStyle = css(back);
    g.fillRect(0, 0, w, h);
  };
  const advance = () => {
    if (!pipe && !begin()) return;
    if (!step()) {
      ball(project(pipe.at), pipe.color, false);
      pipe = null;
      if (laid > NX * NY * NZ * 0.32 || pipesLaid >= 7) fading = 1.4;
    }
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      NX = clamp(Math.round(NY * (w / h)), 6, 22);
      f = (w * 1.02 * (D - (NZ - 1) / 2)) / NX; // (its nearest side as wide as the view: none of it out of sight)
      restart();
    },
    frame(dt) {
      if (fading > 0) {
        fading -= dt;
        g.fillStyle = css(back, 0.14);
        g.fillRect(0, 0, w, h);
        if (fading <= 0) restart();
        return;
      }
      wait += dt;
      let n = 0;
      while (wait >= 1 / 11 && n++ < 3) {
        wait -= 1 / 11;
        advance();
        if (fading > 0) break;
      }
    },
    point() {},
    poke(x, y) {
      if (fading > 0) return;
      // (The nearest free cell to there, halfway back.)
      let best = null;
      let bestD = Infinity;
      const z = Math.floor(NZ / 2);
      for (let gx = 0; gx < NX; gx++) {
        for (let gy = 0; gy < NY; gy++) {
          if (!free(gx, gy, z)) continue;
          const p = project([gx, gy, z]);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) {
            bestD = d;
            best = [gx, gy, z];
          }
        }
      }
      if (!best) return;
      if (pipe) ball(project(pipe.at), pipe.color, false);
      begin(best);
    },
    still() {
      restart();
      for (let i = 0; i < 180 && fading <= 0; i++) advance();
    },
  };
}

// ---------- Pond ----------
// Water with ripples, where it's clicked or tapped, behind the pointer, and as rain now and then:
// koi swim below (and dart away from a ripple), and lily pads float on it, rocking as the ripples
// go by and pushed along by a splash. (The water's drawn sharp; the ripples are worked out a few
// pixels at a time, only where the water's moving, and laid over it as light and shade.)
function pond(g, c1, c2) {
  const deep = rgbOf(c1);
  const shallow = rgbOf(c2);
  const EPS = 0.35; // (water moving less than this doesn't show)
  const hi = shade(shallow, 0.82);
  const lo = shade(deep, -0.75);
  let w = 1;
  let h = 1;
  let CELL = 4;
  let W = 1;
  let H = 1;
  let rate = 60; // (steps a second: so ripples go as fast, however big the cells)
  let damp = 0.982;
  let cur = null;
  let old = null;
  let box = null; // (where the water's moving, in cells: [x0, y0, x1, y1]; null, nowhere)
  let was = null; // (and where it was, a step before)
  let water = null;
  let lit = null; // (the ripples' light and shade: a cell a pixel)
  let img = null;
  let pads = [];
  let koi = [];
  let rainIn = 2;
  let simWait = 0;
  let lastWake = 0;
  let clock = 0;
  const KOI = [
    { body: [250, 120, 40], spots: [255, 245, 235] },
    { body: [255, 248, 240], spots: [225, 50, 40] },
    { body: [250, 200, 70], spots: [255, 235, 160] },
    { body: [35, 30, 40], spots: [245, 110, 40] },
    { body: [255, 250, 245], spots: [240, 120, 40] },
  ];
  const SHADOW = { body: [0, 0, 0], spots: [0, 0, 0] };
  const both = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  // (A drop: the water pushed down there, r pixels across, in a smooth bump.)
  const drop = (x, y, amp, r) => {
    const cx = x / CELL + 1;
    const cy = y / CELL + 1;
    const rad = Math.max(1.3, r / CELL);
    const x0 = Math.max(1, Math.floor(cx - rad));
    const x1 = Math.min(W - 2, Math.ceil(cx + rad));
    const y0 = Math.max(1, Math.floor(cy - rad));
    const y1 = Math.min(H - 2, Math.ceil(cy + rad));
    if (x1 < x0 || y1 < y0) return;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const d = Math.hypot(gx - cx, gy - cy) / rad;
        if (d < 1) cur[gy * W + gx] += amp * (0.5 + 0.5 * Math.cos(Math.PI * d));
      }
    }
    box = both(box, [x0, y0, x1, y1]);
  };
  // (One step of the ripples spreading, where the water's moving and a cell round it: from all eight
  // cells round each, so they spread as circles, not squares.)
  const ripple = () => {
    const b = both(box, was);
    if (!b) return;
    const x0 = Math.max(1, b[0] - 1);
    const y0 = Math.max(1, b[1] - 1);
    const x1 = Math.min(W - 2, b[2] + 1);
    const y1 = Math.min(H - 2, b[3] + 1);
    let nx0 = W;
    let ny0 = H;
    let nx1 = -1;
    let ny1 = -1;
    for (let y = y0; y <= y1; y++) {
      let i = y * W + x0;
      for (let x = x0; x <= x1; x++, i++) {
        const v = ((cur[i] + cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) / 3 + (cur[i - W - 1] + cur[i - W + 1] + cur[i + W - 1] + cur[i + W + 1]) / 12 - old[i]) * damp;
        old[i] = v;
        if (v > EPS || v < -EPS) {
          if (x < nx0) nx0 = x;
          if (x > nx1) nx1 = x;
          if (y < ny0) ny0 = y;
          ny1 = y;
        }
      }
    }
    const t = cur;
    cur = old;
    old = t;
    was = box;
    box = nx1 >= 0 ? [nx0, ny0, nx1, ny1] : null;
    if (!box && !was) {
      cur.fill(0);
      old.fill(0);
    }
  };
  // (How the water's tilted at a spot, times `by`: what it bends, and how far.)
  const tilt = (x, y, by, most) => {
    const gx = clamp(Math.round(x / CELL + 1), 1, W - 2);
    const gy = clamp(Math.round(y / CELL + 1), 1, H - 2);
    const i = gy * W + gx;
    return [clamp((cur[i - 1] - cur[i + 1]) * by, -most, most), clamp((cur[i - W] - cur[i + W]) * by, -most, most)];
  };
  const drawWater = () => {
    const k = g.canvas.width / w;
    water = canvasOf(w * k, h * k);
    const x = water.getContext('2d');
    x.scale(k, k);
    const grad = x.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, css(shallow));
    grad.addColorStop(1, css(deep));
    x.fillStyle = grad;
    x.fillRect(0, 0, w, h);
    // (Darker deeps, and pebbles showing through.)
    for (let i = 0; i < 7; i++) {
      const bx = rand(0, w);
      const by = rand(0, h);
      const br = rand(80, 240);
      const d = x.createRadialGradient(bx, by, 0, bx, by, br);
      d.addColorStop(0, css(shade(deep, -0.35), 0.45));
      d.addColorStop(1, css(deep, 0));
      x.fillStyle = d;
      x.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    for (let i = 0; i < (w * h) / 9000; i++) {
      x.fillStyle = css(mix(shallow, [200, 190, 160], rand(0.1, 0.4)), rand(0.08, 0.2));
      x.beginPath();
      x.ellipse(rand(0, w), rand(0, h), rand(4, 11), rand(3, 8), rand(0, 3), 0, Math.PI * 2);
      x.fill();
    }
  };
  // (Each lily pad drawn once, as a picture of its own, to float about.)
  const makePad = (r) => {
    const k = g.canvas.width / w;
    const S = (r + 16) * 2;
    const c = canvasOf(S * k, S * k);
    const x = c.getContext('2d');
    x.scale(k, k);
    const m = S / 2;
    const notch = rand(0, Math.PI * 2);
    x.fillStyle = css(mix([60, 140, 60], [110, 170, 70], rand(0, 1)));
    x.beginPath();
    x.moveTo(m, m);
    x.arc(m, m, r, notch + 0.35, notch + Math.PI * 2 - 0.35);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(255, 255, 255, 0.16)'; // (its rim, catching the light)
    x.lineWidth = 1.2;
    x.beginPath();
    x.arc(m, m, r - 0.8, notch + 0.4, notch + Math.PI * 2 - 0.4);
    x.stroke();
    x.strokeStyle = 'rgba(30, 80, 30, 0.45)';
    x.lineWidth = 1.5;
    for (let v = 0; v < 6; v++) {
      const a = notch + 0.6 + v * ((Math.PI * 2 - 1.2) / 5);
      x.beginPath();
      x.moveTo(m, m);
      x.lineTo(m + Math.cos(a) * r * 0.85, m + Math.sin(a) * r * 0.85);
      x.stroke();
    }
    if (Math.random() < 0.4) {
      // (A water lily.)
      const fx = m + rand(-r * 0.3, r * 0.3);
      const fy = m + rand(-r * 0.3, r * 0.3);
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        x.fillStyle = p % 2 ? 'rgba(255, 190, 220, 0.95)' : 'rgba(255, 150, 200, 0.95)';
        x.beginPath();
        x.ellipse(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6, 8, 4, a, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = 'rgba(255, 220, 90, 1)';
      x.beginPath();
      x.arc(fx, fy, 3.5, 0, Math.PI * 2);
      x.fill();
    }
    return { pic: c, S };
  };
  const swim = (k, dt) => {
    k.wander += rand(-1.6, 1.6) * dt;
    k.angle += clamp(k.wander, -1.2, 1.2) * dt;
    // (Back from the edges.)
    const m = 70;
    const want = (k.x < m ? 0 : k.x > w - m ? Math.PI : null) ?? (k.y < m ? Math.PI / 2 : k.y > h - m ? -Math.PI / 2 : null);
    if (want !== null) {
      const diff = Math.atan2(Math.sin(want - k.angle), Math.cos(want - k.angle));
      k.angle += diff * Math.min(1, dt * 2.2);
    }
    k.fright = Math.max(0, k.fright - dt);
    const speed = k.speed * (1 + k.fright * 2.6);
    k.x += Math.cos(k.angle) * speed * dt;
    k.y += Math.sin(k.angle) * speed * dt;
    k.tail += dt * (5 + k.fright * 9);
  };
  const float = (p, dt) => {
    p.vx += (p.drift[0] - p.vx) * Math.min(1, dt * 0.7);
    p.vy += (p.drift[1] - p.vy) * Math.min(1, dt * 0.7);
    p.spin += (p.turn - p.spin) * Math.min(1, dt * 0.7);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += p.spin * dt;
    // (Back off the edges.)
    if (p.x < p.r * 0.6) p.vx = p.drift[0] = Math.abs(p.drift[0]);
    else if (p.x > w - p.r * 0.6) p.vx = p.drift[0] = -Math.abs(p.drift[0]);
    if (p.y < p.r * 0.6) p.vy = p.drift[1] = Math.abs(p.drift[1]);
    else if (p.y > h - p.r * 0.6) p.vy = p.drift[1] = -Math.abs(p.drift[1]);
  };
  const drawKoi = (k, look, dx, dy) => {
    const L = k.len;
    g.save();
    g.translate(k.x + dx, k.y + dy);
    g.rotate(k.angle);
    const sway = Math.sin(k.tail) * 0.45;
    g.fillStyle = css(look.body, 0.95);
    // (Its tail, its fins, then its body.)
    g.save();
    g.translate(-L * 0.42, 0);
    g.rotate(sway);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-L * 0.25, -L * 0.2, -L * 0.36, -L * 0.17);
    g.quadraticCurveTo(-L * 0.28, 0, -L * 0.36, L * 0.17);
    g.quadraticCurveTo(-L * 0.25, L * 0.2, 0, 0);
    g.fill();
    g.restore();
    for (const side of [-1, 1]) {
      // (Just behind its head, swept back.)
      g.beginPath();
      g.ellipse(L * 0.14, side * L * 0.16, L * 0.12, L * 0.05, -side * (0.7 + sway * 0.3), 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, 0, L * 0.5, L * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(look.spots, 0.95);
    g.beginPath();
    for (const [sx, sy, sr] of k.spots) {
      g.moveTo(sx * L + sr * L, sy * L);
      g.ellipse(sx * L, sy * L, sr * L, sr * L * 0.7, 0, 0, Math.PI * 2);
    }
    g.fill();
    g.restore();
  };
  // (The ripples, as light and shade, over the water and the fish, where it's moving.)
  const shine = () => {
    const b = both(box, was);
    if (!b) return;
    const x0 = Math.max(1, b[0] - 2);
    const y0 = Math.max(1, b[1] - 2);
    const x1 = Math.min(W - 2, b[2] + 2);
    const y1 = Math.min(H - 2, b[3] + 2);
    const d = img.data;
    const [hr, hg, hb] = hi;
    const [lr, lg, lb] = lo;
    for (let y = y0; y <= y1; y++) {
      let i = y * W + x0;
      let o = i * 4;
      for (let x = x0; x <= x1; x++, i++, o += 4) {
        const v = cur[i - 1] - cur[i + 1] - cur[i - W] + cur[i + W];
        if (v > 0) {
          d[o] = hr;
          d[o + 1] = hg;
          d[o + 2] = hb;
          d[o + 3] = v * 0.7 + v * v * 0.005;
        } else {
          d[o] = lr;
          d[o + 1] = lg;
          d[o + 2] = lb;
          d[o + 3] = -v * 0.55;
        }
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    lit.getContext('2d').putImageData(img, 0, 0, x0, y0, bw, bh);
    g.imageSmoothingEnabled = true;
    g.drawImage(lit, x0, y0, bw, bh, (x0 - 1.5) * CELL, (y0 - 1.5) * CELL, bw * CELL, bh * CELL);
  };
  const paint = () => {
    g.drawImage(water, 0, 0, w, h);
    // (A shadow under each fish, on the bottom, then the fish; the ripples over them; then the
    // pads, floating on top, each with its shadow.)
    const by = 0.035 * CELL;
    g.globalAlpha = 0.22;
    for (const k of koi) drawKoi(k, SHADOW, 6, 8);
    g.globalAlpha = 1;
    for (const k of koi) drawKoi(k, k.look, ...tilt(k.x, k.y, by, 7));
    shine();
    for (const p of pads) {
      const [dx, dy] = tilt(p.x, p.y, by * 0.6, 4);
      p.shown = [p.x + dx, p.y + dy];
      g.fillStyle = 'rgba(0, 0, 0, 0.16)';
      g.beginPath();
      g.arc(p.x + dx + 3, p.y + dy + 4, p.r, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of pads) {
      g.save();
      g.translate(...p.shown);
      g.rotate(p.a);
      g.drawImage(p.pic, -p.S / 2, -p.S / 2, p.S, p.S);
      g.restore();
    }
  };
  return {
    fps: 30,
    resize(nw, nh) {
      w = nw;
      h = nh;
      // (Cells of 4 pixels, bigger on a big screen: never more than about 130,000 of them.)
      CELL = clamp(Math.ceil(Math.sqrt((w * h) / 130000)), 4, 7);
      rate = (60 * 4) / CELL;
      damp = 0.982 ** (60 / rate);
      W = Math.ceil(w / CELL) + 3;
      H = Math.ceil(h / CELL) + 3;
      cur = new Float32Array(W * H);
      old = new Float32Array(W * H);
      box = was = null;
      lit = canvasOf(W, H);
      img = lit.getContext('2d').createImageData(W, H);
      drawWater();
      const n = Math.round(clamp((w * h) / 70000, 4, 12));
      pads = Array.from({ length: n }, () => {
        const r = rand(20, 42);
        const drift = [rand(-3, 3), rand(-3, 3)];
        const turn = rand(-0.05, 0.05);
        return { x: rand(30, w - 30), y: rand(30, h - 30), r, a: rand(0, Math.PI * 2), vx: drift[0], vy: drift[1], drift, turn, spin: turn, ...makePad(r) };
      });
      const many = Math.round(clamp((w * h) / 160000, 3, 6));
      koi = Array.from({ length: many }, (_, i) => ({
        x: rand(80, w - 80), y: rand(80, h - 80), angle: rand(0, Math.PI * 2), wander: 0, speed: rand(26, 44), tail: rand(0, 6), fright: 0,
        len: rand(46, 74), look: KOI[i % KOI.length],
        spots: Array.from({ length: 3 }, () => [rand(-0.3, 0.3), rand(-0.06, 0.06), rand(0.06, 0.12)]),
      }));
    },
    frame(dt) {
      clock += dt;
      rainIn -= dt;
      if (rainIn <= 0) {
        rainIn = rand(0.9, 3.2);
        drop(rand(0, w), rand(0, h), rand(70, 120), 7);
      }
      for (const k of koi) swim(k, dt);
      for (const p of pads) float(p, dt);
      simWait += dt;
      let n = 0;
      while (simWait >= 1 / rate && n++ < 4) {
        simWait -= 1 / rate;
        ripple();
      }
      paint();
    },
    point(x, y) {
      if (x === null || clock - lastWake < 0.05) return;
      lastWake = clock;
      drop(x, y, 32, 6);
    },
    poke(x, y) {
      drop(x, y, 420, 15);
      for (const k of koi) {
        const d = Math.hypot(k.x - x, k.y - y);
        if (d < 170) {
          k.angle = Math.atan2(k.y - y, k.x - x) + rand(-0.4, 0.4);
          k.fright = 1;
        }
      }
      // (A splash pushes the pads nearby away, turning.)
      for (const p of pads) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 240 && d > 0.01) {
          const push = (1 - d / 240) * 46;
          p.vx += ((p.x - x) / d) * push;
          p.vy += ((p.y - y) / d) * push;
          p.spin += rand(-0.6, 0.6) * (1 - d / 240);
        }
      }
    },
    still() {
      // (Rings from two drops, a moment after.)
      drop(w * 0.32, h * 0.58, 420, 15);
      drop(w * 0.7, h * 0.35, 300, 12);
      for (let i = 0; i < Math.round(rate * 0.55); i++) ripple();
      paint();
    },
    things: () => koi.map((k) => ({ x: Math.round(k.x), y: Math.round(k.y), len: Math.round(k.len), angle: +k.angle.toFixed(2), fright: +k.fright.toFixed(2) })),
  };
}

// ---------- Lava lamp ----------
// The inside of a lava lamp: wax in the warm liquid, heated at the bottom till it rises, stretching
// as it goes, cooling at the top and sinking back, joining and parting on the way. Pressed on, a
// blob warms and rises; pressed in the liquid, a new one starts there. The pointer warms them too.
// (The wax is worked out a few pixels at a time, only near a blob, and its glow from a smaller copy
// of it, blurred, put together small and drawn big once: blurring the whole view, every frame, is
// too slow for some computers. It's all soft, so on a computer it's drawn at three quarters of the
// screen's pixels.)
function lava(g, c1, c2) {
  const liquid = rgbOf(c1);
  const wax = rgbOf(c2);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const GLOW = 3; // (the glow's pixels: this many of the wax's)
  let CELL = 5;
  let w = 1;
  let h = 1;
  let W = 1;
  let H = 1;
  let blobs = [];
  let layer = null; // (the wax, a cell a pixel)
  let img = null;
  let glow = null;
  let both = null; // (the glow and the wax over it, a cell a pixel)
  let at = new Float64Array(0); // (each blob's x, y, size squared, and stretch, for working it out)
  let back = null; // (the liquid, and the glass it's in)
  let clock = 0;
  let px = null;
  let py = null;
  const hot = shade(wax, 0.45);
  const edge = shade(wax, -0.2);
  const blob = (x, y, r, heat) => ({ x, y, r, vx: 0, vy: 0, heat, phase: rand(0, 6.3) });
  const many = () => Math.round(clamp((w * h) / 120000, 4, 8));
  const blurs = (() => {
    try {
      const t = canvasOf(2, 2).getContext('2d');
      t.filter = 'blur(2px)';
      return t.filter === 'blur(2px)';
    } catch {
      return false;
    }
  })();
  // (How much wax there is at each cell: every blob's share, more the nearer it is. A block of 8 by
  // 8 cells too far from them all to be wax, at its nearest, is just liquid.)
  const TILE = 8;
  const field = () => {
    const d = img.data;
    const n = blobs.length;
    if (at.length < n * 4) at = new Float64Array(n * 8);
    for (let j = 0; j < n; j++) {
      const b = blobs[j];
      at[j * 4] = b.x;
      at[j * 4 + 1] = b.y;
      at[j * 4 + 2] = b.r * b.r;
      at[j * 4 + 3] = 1 / (1 + Math.min(0.7, Math.abs(b.vy) / 55)); // (stretched as it goes)
    }
    const [er, eg, eb] = edge;
    const [wr, wg, wb] = wax;
    const [hr, hg, hb] = hot;
    for (let ty = 0; ty < H; ty += TILE) {
      const gy1 = Math.min(H, ty + TILE);
      const ya = ty * CELL;
      const yb = (gy1 - 1) * CELL;
      for (let tx = 0; tx < W; tx += TILE) {
        const gx1 = Math.min(W, tx + TILE);
        const xa = tx * CELL;
        const xb = (gx1 - 1) * CELL;
        let most = 0;
        for (let j = 0; j < n * 4; j += 4) {
          const bx = at[j];
          const by = at[j + 1];
          const dx = bx < xa ? xa - bx : bx > xb ? bx - xb : 0;
          const dy = (by < ya ? ya - by : by > yb ? by - yb : 0) * at[j + 3];
          most += at[j + 2] / (dx * dx + dy * dy + 1);
        }
        if (most < 0.8) {
          for (let gy = ty; gy < gy1; gy++) for (let k = (gy * W + tx) * 4 + 3, e = (gy * W + gx1) * 4; k < e; k += 4) d[k] = 0;
          continue;
        }
        for (let gy = ty; gy < gy1; gy++) {
          const y = gy * CELL;
          for (let gx = tx; gx < gx1; gx++) {
            const x = gx * CELL;
            let f = 0;
            for (let j = 0; j < n * 4; j += 4) {
              const dx = x - at[j];
              const dy = (y - at[j + 1]) * at[j + 3];
              f += at[j + 2] / (dx * dx + dy * dy + 1);
            }
            const k = (gy * W + gx) * 4;
            if (f < 0.8) {
              d[k + 3] = 0;
            } else if (f < 1) {
              // (Its edge, darker, fading out.)
              const t = (f - 0.8) / 0.2;
              d[k] = er + (wr - er) * t;
              d[k + 1] = eg + (wg - eg) * t;
              d[k + 2] = eb + (wb - eb) * t;
              d[k + 3] = 255 * t ** 1.2;
            } else {
              // (Hotter in the middle.)
              const t = Math.min(0.45, (f - 1) * 0.12);
              d[k] = wr + (hr - wr) * t;
              d[k + 1] = wg + (hg - wg) * t;
              d[k + 2] = wb + (hb - wb) * t;
              d[k + 3] = 255;
            }
          }
        }
      }
    }
    layer.getContext('2d').putImageData(img, 0, 0);
  };
  const paint = () => {
    g.drawImage(back, 0, 0, w, h);
    field();
    // (Its glow: the wax, smaller, blurred, and faint; the wax over it; then all of it drawn big.)
    const q = glow.getContext('2d');
    q.clearRect(0, 0, glow.width, glow.height);
    q.drawImage(layer, 0, 0, W / GLOW, H / GLOW);
    const s = both.getContext('2d');
    s.clearRect(0, 0, W, H);
    s.globalAlpha = 0.3;
    s.drawImage(glow, 0, 0, glow.width * GLOW, glow.height * GLOW);
    s.globalAlpha = 1;
    s.drawImage(layer, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(both, -CELL / 2, -CELL / 2, W * CELL, H * CELL);
  };
  return {
    dpr: coarse ? 1 : 0.75,
    fps: 30,
    resize(nw, nh) {
      w = nw;
      h = nh;
      // (Cells of 5 pixels (6 on a phone), bigger on a big screen: never more than about 70,000.)
      CELL = Math.max(coarse ? 6 : 5, Math.ceil(Math.sqrt((w * h) / 70000)));
      W = Math.ceil(w / CELL) + 2;
      H = Math.ceil(h / CELL) + 2;
      layer = canvasOf(W, H);
      img = layer.getContext('2d').createImageData(W, H);
      both = canvasOf(W, H);
      glow = canvasOf(Math.ceil(W / GLOW) + 1, Math.ceil(H / GLOW) + 1);
      if (blurs) glow.getContext('2d').filter = 'blur(2px)';
      // (The liquid, lit from the lamp at the bottom.)
      const k = g.canvas.width / w;
      back = canvasOf(w * k, h * k);
      const b = back.getContext('2d');
      b.scale(k, k);
      const grad = b.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, css(shade(liquid, -0.45)));
      grad.addColorStop(0.55, css(liquid));
      grad.addColorStop(1, css(shade(liquid, 0.22)));
      b.fillStyle = grad;
      b.fillRect(0, 0, w, h);
      const bulb = b.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, Math.max(w, h) * 0.6);
      bulb.addColorStop(0, css(shade(wax, 0.55), 0.38));
      bulb.addColorStop(1, css(wax, 0));
      b.fillStyle = bulb;
      b.fillRect(0, 0, w, h);
      // (The glass: a gleam down one side, and its edges darker.)
      const gleam = b.createLinearGradient(0, 0, w, 0);
      gleam.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
      gleam.addColorStop(0.1, 'rgba(255, 255, 255, 0.07)');
      gleam.addColorStop(0.16, 'rgba(255, 255, 255, 0.16)');
      gleam.addColorStop(0.22, 'rgba(255, 255, 255, 0.04)');
      gleam.addColorStop(0.85, 'rgba(255, 255, 255, 0)');
      gleam.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
      b.fillStyle = gleam;
      b.fillRect(0, 0, w, h);
      const m = Math.min(w, h);
      const n = many();
      blobs = Array.from({ length: n }, (_, i) => blob(w * (0.12 + (0.76 * (i + rand(0.25, 0.75))) / n), rand(h * 0.1, h * 0.9), rand(m * 0.05, m * 0.085), i % 2 ? 0.85 : 0.15));
      blobs.sort(() => Math.random() - 0.5);
    },
    frame(dt) {
      clock += dt;
      const m = Math.min(w, h);
      for (const b of blobs) {
        // (Warmed at the bottom, cooled at the top; and by the pointer.)
        if (b.y > h * 0.8) b.heat = Math.min(1, b.heat + dt * 0.22);
        else if (b.y < h * 0.22) b.heat = Math.max(0, b.heat - dt * 0.22);
        if (px !== null && Math.hypot(b.x - px, b.y - py) < b.r + 90) b.heat = Math.min(1, b.heat + dt * 0.5);
        b.vy += -(b.heat - 0.5) * 58 * dt;
        b.vy *= Math.exp(-dt * 0.9);
        b.vy = clamp(b.vy, -52, 52);
        b.vx = Math.sin(clock * 0.25 + b.phase) * 7;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.x = clamp(b.x, b.r * 0.4, w - b.r * 0.4);
        if (b.y > h + b.r * 0.2) {
          b.y = h + b.r * 0.2;
          b.vy = Math.min(0, b.vy);
        } else if (b.y < -b.r * 0.2) {
          b.y = -b.r * 0.2;
          b.vy = Math.max(0, b.vy);
        }
      }
      // (Too many: the smallest melts into the rest.)
      if (blobs.length > many() + 5) {
        let small = blobs[0];
        for (const b of blobs) if (b.r < small.r) small = b;
        small.r -= dt * m * 0.05;
        if (small.r < m * 0.02) blobs = blobs.filter((b) => b !== small);
      }
      paint();
    },
    point(x, y) {
      px = x;
      py = y;
    },
    poke(x, y) {
      const m = Math.min(w, h);
      const near = blobs.find((b) => Math.hypot(b.x - x, b.y - y) < b.r * 1.3);
      if (near) {
        near.heat = 1;
        near.vy = Math.min(near.vy, -22);
      } else {
        blobs.push(blob(x, y, rand(m * 0.04, m * 0.065), clamp(1 - y / h + 0.3, 0.2, 1)));
      }
    },
    still() {
      paint();
    },
  };
}

export const SCENES = { warp, bubbles, pipes, pond, lava };
