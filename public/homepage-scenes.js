// Homepage scenes: a page's background, alive. public/homepage.js (sceneOn) loads this the first
// time a page has one, draws the scene in view behind the weather and the page's pieces, and
// tells it where the pointer is, and where the page is pressed (a click or a tap, anywhere: on a
// piece too, the scene answering behind it). Each scene is made for a canvas's 2D context, in CSS
// pixels, with the page's two colours (and { name }: its owner's), and has:
//   resize(w, h)   (the view's size; it starts over)
//   frame(dt)      (dt: seconds since the last frame)
//   point(x, y)    (where the pointer is; null when it's gone)
//   poke(x, y)     (pressed there)
//   still()        (one picture that stands for it: for someone who'd rather things didn't
//                  move, and the editor's swatches)
// Starfield flight, Bubbles, Bouncing logo, Rain on glass and the old browsers are everyone's; Pipes, Pond, Lava lamp,
// Mystify, Snow globe, Constellations, City at night and Fireplace come with Glow (lib/homepages.js
// keeps to that).

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
// turning now and then, each only so long before the next starts somewhere else, till there've been
// enough of them (or it's full enough); then it fades and they start again. Eight cells across the
// view's shorter side (more along its longer: a phone's tall), so they've room between them. A click
// or a tap starts a new one there. (Now and then a joint's a teapot, as it was.)
function pipes(g, c1, c2) {
  const back = rgbOf(c1);
  const COLORS = [rgbOf(c2), [235, 64, 64], [64, 200, 90], [70, 120, 245], [245, 205, 60], [60, 210, 225], [220, 80, 220], [245, 140, 50], [225, 225, 225]];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let w = 1;
  let h = 1;
  let NX = 16;
  let NY = 10;
  const NZ = 10;
  const PIPE_LEN = [28, 64]; // (joints each, at most: then the next)
  const ACROSS = 8; // (cells across the view's shorter side)
  const PIPES = 11; // (and then it starts again: about 35 seconds in all)
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
    return { x: w / 2 + (x - (NX - 1) / 2) * s, y: h / 2 + (y - (NY - 1) / 2) * s, r: 0.18 * s };
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
    pipe = { at: spot, dir: DIRS[Math.floor(rand(0, 6))], color, left: Math.floor(rand(...PIPE_LEN)) };
    ball(project(spot), color, false);
    pipesLaid++;
    return true;
  };
  // One joint further (or a turn, now and then, or when it must): false if it's stuck, or long enough.
  const step = () => {
    const { at, color } = pipe;
    if (--pipe.left < 0) return false;
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
      if (laid > NX * NY * NZ * 0.3 || pipesLaid >= PIPES) fading = 1.4;
    }
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const long = clamp(Math.round((ACROSS * Math.max(w, h)) / Math.max(1, Math.min(w, h))), ACROSS, 20);
      NX = w >= h ? long : ACROSS;
      NY = w >= h ? ACROSS : long;
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

// ---------- Bouncing logo ----------
// The old DVD player's, waiting: a logo (the page's owner's name, on a disc) drifting from side to
// side, a new colour each time it touches one; right into a corner, and sparkles burst out of it as
// it flashes through all its colours. A click or a tap sends it off away from there (and so, with a
// bit of aim, into a corner).
function bounce(g, c1, c2, opts = {}) {
  const back = rgbOf(c1);
  const PALETTE = [rgbOf(c2), [255, 79, 163], [90, 209, 255], [255, 214, 64], [120, 236, 140], [190, 120, 255], [255, 140, 60], [255, 255, 255]];
  const words = String(opts.name || '').trim().slice(0, 32) || 'Rainlit';
  const SLANT = 0.22; // (how far it leans: done here, not by the font, so it's known how far it reaches)
  const font = (size) => `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
  let w = 1;
  let h = 1;
  let logo = null; // (it in white, and in its colour now)
  let tinted = null;
  let lw = 1;
  let lh = 1;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let colorAt = 0;
  let hitX = -1; // (when it last touched a side, and the top or bottom: both at once is a corner)
  let hitY = -1;
  let clock = 0;
  let sparks = [];
  let corners = 0;
  let party = 0; // (after a corner: flashing through its colours, a while)
  let flashIn = 0;
  // (The name as big as fits across the logo, all of it, its letters' own shape measured, leaning
  // and all: none of it's cut off, however long it is or however tall its letters.)
  const paintLogo = () => {
    const k = g.canvas.width / w;
    lw = Math.round(clamp(Math.min(w, h) * 0.3, 110, 260));
    // (Its ink at a size: how far it reaches each way from where it's written, and how wide it is.)
    const m = canvasOf(1, 1).getContext('2d');
    const ink = (size) => {
      m.font = font(size);
      const at = m.measureText(words);
      const up = at.actualBoundingBoxAscent || size * 0.74;
      const down = at.actualBoundingBoxDescent || 0;
      const left = at.actualBoundingBoxLeft || 0;
      const right = at.actualBoundingBoxRight || at.width;
      return { size, up, down, left, right, w: left + right + SLANT * (up + down) };
    };
    const room = lw * 0.92;
    let t = ink(100);
    t = ink(Math.min((100 * room) / Math.max(1, t.w), lw * 0.4));
    // (Small letters can come out a little wider than big ones made small: measured again there.)
    for (let i = 0; i < 4 && t.w > room; i++) t = ink((t.size * room) / t.w - 0.1);
    const pad = 3;
    const disc = lw * 0.2;
    const gap = Math.max(3, t.size * 0.08);
    lh = Math.round(pad + t.up + t.down + gap + disc + pad);
    logo = canvasOf(lw * k, lh * k);
    const x2 = logo.getContext('2d');
    x2.scale(k, k);
    x2.fillStyle = '#fff';
    x2.font = font(t.size);
    x2.textAlign = 'left';
    x2.textBaseline = 'alphabetic';
    x2.save();
    x2.translate((lw - t.w) / 2 + t.left + SLANT * t.down, pad + t.up);
    x2.transform(1, 0, -SLANT, 1, 0, 0);
    x2.fillText(words, 0, 0);
    x2.restore();
    // (The disc under it, with HOMEPAGE cut out of it.)
    const dy = pad + t.up + t.down + gap + disc / 2;
    x2.beginPath();
    x2.ellipse(lw / 2, dy, lw * 0.46, disc / 2, 0, 0, Math.PI * 2);
    x2.fill();
    x2.globalCompositeOperation = 'destination-out';
    x2.font = font(disc * 0.58);
    x2.textAlign = 'center';
    x2.textBaseline = 'middle';
    x2.fillText('H O M E P A G E', lw / 2, dy + disc * 0.03, lw * 0.7);
    tint();
  };
  const tint = () => {
    tinted = canvasOf(logo.width, logo.height);
    const t = tinted.getContext('2d');
    t.drawImage(logo, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = css(PALETTE[colorAt % PALETTE.length]);
    t.fillRect(0, 0, tinted.width, tinted.height);
  };
  const recolor = () => {
    colorAt = (colorAt + 1 + Math.floor(Math.random() * (PALETTE.length - 2))) % PALETTE.length;
    tint();
  };
  // (Sparkles out of a corner, in all its colours.)
  const burst = (cx, cy) => {
    corners++;
    party = 1.1;
    for (let i = 0; i < 70; i++) {
      const a = Math.atan2(h / 2 - cy, w / 2 - cx) + rand(-0.95, 0.95);
      const v = rand(200, 640);
      sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(1, 2), size: rand(3, 7), color: PALETTE[i % PALETTE.length] });
    }
  };
  const paint = () => {
    g.fillStyle = css(back);
    g.fillRect(0, 0, w, h);
    for (const s of sparks) {
      g.globalAlpha = clamp(1 - s.t / s.life, 0, 1);
      g.fillStyle = css(s.color);
      g.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    g.globalAlpha = 1;
    g.drawImage(tinted, x, y, lw, lh);
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      paintLogo();
      x = rand(0, Math.max(0, w - lw));
      y = rand(0, Math.max(0, h - lh));
      const v = clamp((w + h) * 0.045, 60, 150);
      vx = (Math.random() < 0.5 ? -1 : 1) * v;
      vy = (Math.random() < 0.5 ? -1 : 1) * v * 0.8;
      // (Its font, once it's come, if it hadn't.)
      if (document.fonts && document.fonts.check && !document.fonts.check(font(100), words)) document.fonts.load(font(100), words).then(() => { if (logo) paintLogo(); }).catch(() => {});
    },
    frame(dt) {
      clock += dt;
      x += vx * dt;
      y += vy * dt;
      let hit = false;
      if (x <= 0 || x >= w - lw) {
        x = clamp(x, 0, Math.max(0, w - lw));
        vx = x <= 0 ? Math.abs(vx) : -Math.abs(vx);
        hitX = clock;
        hit = true;
      }
      if (y <= 0 || y >= h - lh) {
        y = clamp(y, 0, Math.max(0, h - lh));
        vy = y <= 0 ? Math.abs(vy) : -Math.abs(vy);
        hitY = clock;
        hit = true;
      }
      if (hit) {
        recolor();
        // (Both within a moment: a corner.)
        if (Math.abs(hitX - hitY) < 0.09) {
          burst(x < (w - lw) / 2 ? 0 : w, y < (h - lh) / 2 ? 0 : h);
          hitX = hitY = -1;
        }
      }
      if (party > 0) {
        party -= dt;
        flashIn -= dt;
        if (flashIn <= 0) {
          flashIn = 0.07;
          recolor();
        }
      }
      for (const s of sparks) {
        s.t += dt;
        s.vy += 380 * dt;
        s.vx *= Math.exp(-dt * 1.2);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      sparks = sparks.filter((s) => s.t < s.life);
      paint();
    },
    point() {},
    poke(px, py) {
      // (Off away from there, as fast as it was going.)
      const v = Math.hypot(vx, vy);
      let dx = x + lw / 2 - px;
      let dy = y + lh / 2 - py;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // (Never too nearly straight across or up and down: it'd take an age to get anywhere.)
      const a = Math.atan2(dy, dx);
      const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      const off = a - q;
      const b = q + (Math.abs(off) < 0.35 ? Math.sign(off || 1) * 0.35 : off);
      vx = Math.cos(b) * v;
      vy = Math.sin(b) * v;
      recolor();
    },
    still() {
      x = (w - lw) / 2;
      y = (h - lh) / 2;
      paint();
    },
    things: () => ({ words, x: Math.round(x), y: Math.round(y), w: lw, h: lh, vx: Math.round(vx), vy: Math.round(vy), color: colorAt, corners }),
  };
}

// ---------- Mystify ----------
// The other screensaver: shapes of bright lines, each corner bouncing about the screen on its own,
// echoes of where they were trailing behind, their colours slowly turning. A click or a tap starts
// another there (four at most: the oldest goes), and the pointer draws the corners near it.
function mystify(g, c1, c2) {
  const back = rgbOf(c1);
  const ECHOES = 7;
  const EVERY = 0.075; // (an echo, every this many seconds)
  let w = 1;
  let h = 1;
  let shapes = [];
  let px = null;
  let py = null;
  let since = 0;
  // (Where the first shape's colour starts: the page's second colour, or a bright cyan.)
  const startHue = (() => {
    const [r, gg, b] = rgbOf(c2).map((v) => v / 255);
    const hi = Math.max(r, gg, b);
    const lo = Math.min(r, gg, b);
    if (hi - lo < 0.15) return 185;
    const d = hi - lo;
    const hue = hi === r ? ((gg - b) / d) % 6 : hi === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    return (hue * 60 + 360) % 360;
  })();
  const shape = (hue, at) => {
    const v = clamp((w + h) * 0.07, 70, 190);
    const pts = Array.from({ length: 4 }, () => {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.55, 1) * v * (at ? 1.6 : 1);
      return { x: at ? at[0] : rand(0, w), y: at ? at[1] : rand(0, h), vx: Math.cos(a) * s, vy: Math.sin(a) * s };
    });
    return { pts, hue, echoes: [], born: 0 };
  };
  const colorOf = (s, a) => `hsla(${Math.round(s.hue)}, 100%, 62%, ${a})`;
  const paint = () => {
    g.fillStyle = css(back);
    g.fillRect(0, 0, w, h);
    g.lineJoin = 'round';
    for (const s of shapes) {
      const all = [...s.echoes, s.pts.flatMap((p) => [p.x, p.y])];
      all.forEach((q, i) => {
        const a = ((i + 1) / all.length) * Math.min(1, s.born * 3);
        g.beginPath();
        g.moveTo(q[0], q[1]);
        for (let j = 2; j < 8; j += 2) g.lineTo(q[j], q[j + 1]);
        g.closePath();
        // (Its glow, then the line.)
        g.strokeStyle = colorOf(s, a * 0.16);
        g.lineWidth = 7;
        g.stroke();
        g.strokeStyle = colorOf(s, a);
        g.lineWidth = 1.6;
        g.stroke();
      });
    }
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      shapes = [shape(startHue), shape((startHue + 180) % 360)];
      for (const s of shapes) s.born = 1;
    },
    frame(dt) {
      since += dt;
      const echo = since >= EVERY;
      if (echo) since = 0;
      for (const s of shapes) {
        s.born += dt;
        s.hue = (s.hue + dt * 14) % 360;
        for (const p of s.pts) {
          // (Drawn to the pointer, if it's near.)
          if (px !== null) {
            const dx = px - p.x;
            const dy = py - p.y;
            const d = Math.hypot(dx, dy);
            if (d < 240 && d > 1) {
              const pull = (1 - d / 240) * 260;
              p.vx += (dx / d) * pull * dt;
              p.vy += (dy / d) * pull * dt;
            }
          }
          // (Never too slow, nor too fast, for long.)
          const v = Math.hypot(p.vx, p.vy) || 1;
          const want = clamp(v, 50, 320);
          const nv = want + (v - want) * Math.exp(-dt * 1.5);
          p.vx = (p.vx / v) * nv;
          p.vy = (p.vy / v) * nv;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < 0 || p.x > w) {
            p.x = clamp(p.x, 0, w);
            p.vx = p.x <= 0 ? Math.abs(p.vx) : -Math.abs(p.vx);
          }
          if (p.y < 0 || p.y > h) {
            p.y = clamp(p.y, 0, h);
            p.vy = p.y <= 0 ? Math.abs(p.vy) : -Math.abs(p.vy);
          }
        }
        if (echo) {
          s.echoes.push(s.pts.flatMap((p) => [p.x, p.y]));
          if (s.echoes.length > ECHOES) s.echoes.shift();
        }
      }
      paint();
    },
    point(x, y) {
      px = x;
      py = y;
    },
    poke(x, y) {
      if (shapes.length >= 4) shapes.shift();
      const last = shapes[shapes.length - 1];
      shapes.push(shape(((last ? last.hue : startHue) + rand(90, 150)) % 360, [x, y]));
    },
    still() {
      for (let i = 0; i < 40; i++) this.frame(1 / 30);
    },
    things: () => shapes.map((s) => ({ hue: Math.round(s.hue), pts: s.pts.map((p) => [Math.round(p.x), Math.round(p.y)]) })),
  };
}

// ---------- Snow globe ----------
// A little winter scene in a snow globe: a cabin with its window lit, pines on the snowy hills,
// and snow drifting down and settling on them. A click or a tap shakes it (the harder, the nearer
// the bottom), and moving the pointer quickly stirs it: the snow swirls up and slowly settles
// again. Now and then it's given a little shake by itself.
function globe(g, c1, c2) {
  const sky = rgbOf(c1);
  const snow = rgbOf(c2);
  let w = 1;
  let h = 1;
  let back = null;
  let flakes = [];
  let lying = 0; // (snow settled on the ground: what a shake lifts)
  let spin = 0; // (the water swirling round: which way, and how fast)
  let sprites = [];
  let px = null;
  let py = null;
  let pAt = 0;
  let clock = 0;
  let nudgeIn = 6;
  // (The ground, where the snow settles: low hills.)
  const ground = (x) => h * 0.8 + Math.sin((x / w) * Math.PI * 2 + 0.6) * h * 0.035 + Math.sin((x / w) * Math.PI * 5.2) * h * 0.012;
  const flakeSprite = (r) => {
    const k = g.canvas.width / w;
    const S = Math.ceil(r * 2 + 2);
    const c = canvasOf(S * k, S * k);
    const x = c.getContext('2d');
    x.scale(k, k);
    const grad = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, r);
    grad.addColorStop(0, css(snow, 1));
    grad.addColorStop(0.55, css(snow, 0.85));
    grad.addColorStop(1, css(snow, 0));
    x.fillStyle = grad;
    x.fillRect(0, 0, S, S);
    return { pic: c, S };
  };
  const drawScene = () => {
    const k = g.canvas.width / w;
    back = canvasOf(w * k, h * k);
    const b = back.getContext('2d');
    b.scale(k, k);
    // (The sky inside the glass, and a few stars.)
    const air = b.createLinearGradient(0, 0, 0, h);
    air.addColorStop(0, css(shade(sky, -0.35)));
    air.addColorStop(0.7, css(sky));
    air.addColorStop(1, css(shade(sky, 0.25)));
    b.fillStyle = air;
    b.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 9000; i++) {
      b.fillStyle = `rgba(255, 255, 255, ${rand(0.15, 0.6)})`;
      b.fillRect(rand(0, w), rand(0, h * 0.6), rand(0.8, 1.8), rand(0.8, 1.8));
    }
    // (Far hills, blue with distance.)
    b.fillStyle = css(mix(sky, snow, 0.35));
    b.beginPath();
    b.moveTo(0, h);
    const far = (x) => h * 0.7 + Math.sin((x / w) * 7 + 1.3) * h * 0.035 + Math.sin((x / w) * 2.1) * h * 0.04;
    for (let x = 0; x < w; x += 8) b.lineTo(x, far(x));
    b.lineTo(w, far(w));
    b.lineTo(w, h);
    b.fill();
    // (Pines: a dark green, a little snow on them.)
    const pine = (x, base, size) => {
      b.fillStyle = '#3a2a20';
      b.fillRect(x - size * 0.04, base - size * 0.18, size * 0.08, size * 0.18);
      for (let i = 0; i < 3; i++) {
        const bottom = base - size * (0.12 + i * 0.25);
        const top = bottom - size * 0.42;
        const half = size * (0.3 - i * 0.07);
        b.fillStyle = '#1d3b33';
        b.beginPath();
        b.moveTo(x, top);
        b.lineTo(x + half, bottom);
        b.lineTo(x - half, bottom);
        b.closePath();
        b.fill();
        // (Snow on its tip.)
        const cap = 0.3;
        b.fillStyle = css(snow, 0.88);
        b.beginPath();
        b.moveTo(x, top);
        b.lineTo(x + half * cap, top + size * 0.42 * cap);
        b.lineTo(x - half * cap, top + size * 0.42 * cap);
        b.closePath();
        b.fill();
      }
    };
    const s = Math.min(w, h);
    const cabinX = w * 0.38;
    for (const [fx, f] of [[0.08, 0.8], [0.15, 1.1], [0.24, 0.7], [0.55, 1], [0.63, 1.25], [0.72, 0.85], [0.86, 1.05], [0.94, 0.75]]) pine(w * fx, ground(w * fx) + 4, s * 0.16 * f);
    // (The cabin, its roof deep in snow, its window lit.)
    const cw = s * 0.17;
    const ch = cw * 0.6;
    const cy = ground(cabinX) + 2;
    b.fillStyle = '#6b3f2a';
    b.fillRect(cabinX - cw / 2, cy - ch, cw, ch);
    b.fillStyle = '#4e2c1d';
    for (let i = 1; i < 5; i++) b.fillRect(cabinX - cw / 2, cy - ch + (ch / 5) * i, cw, 1.5);
    const glow = b.createRadialGradient(cabinX - cw * 0.18, cy - ch * 0.5, 2, cabinX - cw * 0.18, cy - ch * 0.5, cw * 0.9);
    glow.addColorStop(0, 'rgba(255, 196, 90, 0.5)');
    glow.addColorStop(1, 'rgba(255, 196, 90, 0)');
    b.fillStyle = glow;
    b.fillRect(cabinX - cw * 1.2, cy - ch * 1.6, cw * 2.2, ch * 2.2);
    b.fillStyle = '#ffd27a';
    b.fillRect(cabinX - cw * 0.3, cy - ch * 0.68, cw * 0.24, ch * 0.34);
    b.fillStyle = '#3a2418';
    b.fillRect(cabinX + cw * 0.12, cy - ch * 0.62, cw * 0.2, ch * 0.62);
    b.fillStyle = '#5c3524';
    b.beginPath();
    b.moveTo(cabinX - cw / 2, cy - ch);
    b.lineTo(cabinX, cy - ch - cw * 0.36);
    b.lineTo(cabinX + cw / 2, cy - ch);
    b.closePath();
    b.fill();
    b.fillStyle = '#5a4a44';
    b.fillRect(cabinX + cw * 0.18, cy - ch - cw * 0.4, cw * 0.1, cw * 0.26);
    b.strokeStyle = css(snow);
    b.lineWidth = cw * 0.13;
    b.lineJoin = 'round';
    b.lineCap = 'round';
    b.beginPath();
    b.moveTo(cabinX - cw * 0.6, cy - ch + cw * 0.03);
    b.lineTo(cabinX, cy - ch - cw * 0.38);
    b.lineTo(cabinX + cw * 0.6, cy - ch + cw * 0.03);
    b.stroke();
    // (The snowy ground, in front of it all.)
    const drift = b.createLinearGradient(0, h * 0.75, 0, h);
    drift.addColorStop(0, css(snow));
    drift.addColorStop(1, css(mix(snow, sky, 0.3)));
    b.fillStyle = drift;
    b.beginPath();
    b.moveTo(0, h);
    for (let x = 0; x < w; x += 6) b.lineTo(x, ground(x));
    b.lineTo(w, ground(w));
    b.lineTo(w, h);
    b.fill();
    // (The glass: darker round its edges.)
    const edge = b.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 10, 0.45)');
    b.fillStyle = edge;
    b.fillRect(0, 0, w, h);
  };
  const flake = (x, y, vx, vy) => ({ x, y, vx, vy, kind: Math.floor(Math.random() * 3), sway: rand(0, 6.3) });
  // (Snow off the ground, near x, thrown up.)
  const lift = (n, x0, force) => {
    n = Math.min(n, lying);
    for (let i = 0; i < n; i++) {
      const x = x0 === null ? rand(0, w) : clamp(x0 + rand(-0.35, 0.35) * w, 0, w);
      flakes.push(flake(x, ground(x) - 2, rand(-1, 1) * force * 0.5, -rand(0.4, 1) * force));
    }
    lying -= n;
  };
  const shake = (x, y, how) => {
    const near = clamp(y / h, 0.2, 1); // (the nearer the bottom, the harder)
    lift(Math.round(lying * 0.55 * how * near), x, (380 + 320 * near) * how);
    spin = clamp(spin + (x < w / 2 ? 1 : -1) * 1.2 * how, -2.2, 2.2);
    for (const f of flakes) {
      const d = Math.hypot(f.x - x, f.y - y);
      const push = Math.max(0, 1 - d / 360) * 420 * how;
      if (push > 0) {
        f.vx += ((f.x - x) / (d || 1)) * push + rand(-60, 60);
        f.vy += ((f.y - y) / (d || 1)) * push - rand(0, 80);
      }
    }
  };
  const paint = () => {
    g.drawImage(back, 0, 0, w, h);
    for (const f of flakes) {
      const s = sprites[f.kind];
      g.drawImage(s.pic, f.x - s.S / 2, f.y - s.S / 2, s.S, s.S);
    }
    // (A gleam on the glass, over it all.)
    g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    g.lineWidth = Math.min(w, h) * 0.03;
    g.lineCap = 'round';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.45, h * 0.44, 0, Math.PI * 1.1, Math.PI * 1.3);
    g.stroke();
    g.lineWidth *= 0.45;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.45, h * 0.44, 0, Math.PI * 1.34, Math.PI * 1.38);
    g.stroke();
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      drawScene();
      sprites = [flakeSprite(1.6), flakeSprite(2.4), flakeSprite(3.4)];
      const n = Math.round(clamp((w * h) / 2600, 250, 850));
      // (Most of it settled; some still coming down.)
      lying = Math.round(n * 0.65);
      flakes = Array.from({ length: n - lying }, () => flake(rand(0, w), rand(-h * 0.1, h * 0.8), rand(-10, 10), rand(10, 30)));
    },
    frame(dt) {
      clock += dt;
      nudgeIn -= dt;
      if (nudgeIn <= 0) {
        nudgeIn = rand(14, 24);
        shake(rand(w * 0.2, w * 0.8), h * 0.9, 0.3);
      }
      spin *= Math.exp(-dt * 0.45);
      const cx = w / 2;
      const cy = h * 0.55;
      const r = Math.max(w, h);
      for (const f of flakes) {
        // (Carried round by the water, falling through it slowly, swaying.)
        f.sway += dt * 1.7;
        const flowX = (-(f.y - cy) / r) * spin * 260 + Math.sin(f.sway) * 9;
        const flowY = ((f.x - cx) / r) * spin * 260 + 16 + f.kind * 7;
        const k = Math.min(1, dt * 1.3);
        f.vx += (flowX - f.vx) * k;
        f.vy += (flowY - f.vy) * k;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.x < 0) {
          f.x = 0;
          f.vx = Math.abs(f.vx) * 0.5;
        } else if (f.x > w) {
          f.x = w;
          f.vx = -Math.abs(f.vx) * 0.5;
        }
        if (f.y < 0) {
          f.y = 0;
          f.vy = Math.abs(f.vy) * 0.4;
        }
        // (Settled: it's part of the snow on the ground.)
        if (f.vy > 0 && f.y >= ground(f.x) - 1) f.gone = true;
      }
      const before = flakes.length;
      flakes = flakes.filter((f) => !f.gone);
      lying += before - flakes.length;
      paint();
    },
    point(x, y) {
      // (Moved quickly: a stir, behind it.)
      const now = clock;
      if (x !== null && px !== null && now > pAt) {
        const v = Math.hypot(x - px, y - py) / Math.max(0.016, now - pAt);
        if (v > 700) {
          for (const f of flakes) {
            const d = Math.hypot(f.x - x, f.y - y);
            if (d < 90) {
              f.vx += ((x - px) / Math.max(0.016, now - pAt)) * 0.25 * (1 - d / 90);
              f.vy += ((y - py) / Math.max(0.016, now - pAt)) * 0.25 * (1 - d / 90);
            }
          }
          if (y > ground(x) - 60) lift(4, x, 260);
        }
      }
      px = x;
      py = y;
      pAt = now;
    },
    poke(x, y) {
      shake(x, y, 1);
    },
    still() {
      paint();
    },
    things: () => ({ falling: flakes.length, lying, spin: +spin.toFixed(2) }),
  };
}

// ---------- Constellations ----------
// A night sky, its stars twinkling and slowly drifting. Near the pointer they join up, as on a
// star chart; a click or a tap draws a constellation there, the nearest few joined for a while,
// with its name.
function constellations(g, c1, c2) {
  const night = rgbOf(c1);
  const glint = rgbOf(c2);
  const NAMES = ['The Lantern', 'The Great Kettle', 'The Little Umbrella', 'The Sleepy Cat', 'The Paper Boat', 'The Porch Light', 'The Lost Sock', 'The Teacup',
    'The Wandering Snail', 'The Old Radio', 'The Sleeping Fox', 'The Kite', 'The Raincloud', 'The Bicycle', 'The Moth', 'The Fiddle', 'The Mitten', 'The Watering Can',
    'The Dreaming Toad', 'The Spare Key'];
  const REACH = 170; // (how near the pointer stars join up)
  const LINK = 100; // (and how near each other)
  let w = 1;
  let h = 1;
  let back = null;
  let sprite = null;
  let stars = [];
  let drawn = []; // (constellations: which stars, joined how, called what, and for how long)
  let names = [];
  let px = null;
  let py = null;
  let clock = 0;
  const drawSky = () => {
    const k = g.canvas.width / w;
    back = canvasOf(w * k, h * k);
    const b = back.getContext('2d');
    b.scale(k, k);
    const air = b.createLinearGradient(0, 0, w * 0.2, h);
    air.addColorStop(0, css(shade(night, -0.3)));
    air.addColorStop(1, css(shade(night, 0.12)));
    b.fillStyle = air;
    b.fillRect(0, 0, w, h);
    // (A milky band across it, and the faintest stars, too far to join up.)
    b.save();
    b.translate(w / 2, h / 2);
    b.rotate(-0.42);
    const band = b.createLinearGradient(0, -h * 0.28, 0, h * 0.28);
    band.addColorStop(0, css(glint, 0));
    band.addColorStop(0.5, css(glint, 0.07));
    band.addColorStop(1, css(glint, 0));
    b.fillStyle = band;
    b.fillRect(-w, -h * 0.28, w * 2, h * 0.56);
    b.restore();
    for (let i = 0; i < (w * h) / 1800; i++) {
      b.fillStyle = css(glint, rand(0.08, 0.32));
      b.fillRect(rand(0, w), rand(0, h), rand(0.6, 1.3), rand(0.6, 1.3));
    }
    // (A star's glow, to draw them with.)
    const S = 24;
    sprite = canvasOf(S * k, S * k);
    const s = sprite.getContext('2d');
    s.scale(k, k);
    const grad = s.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.12, css(mix(glint, [255, 255, 255], 0.6), 0.95));
    grad.addColorStop(0.35, css(glint, 0.28));
    grad.addColorStop(1, css(glint, 0));
    s.fillStyle = grad;
    s.fillRect(0, 0, S, S);
  };
  // (The nearest few stars to a spot, joined up the shortest way: a minimum spanning tree.)
  const join = (x, y) => {
    const near = stars.map((s, i) => [Math.hypot(s.x - x, s.y - y), i]).filter(([d]) => d < 280).sort((a, b) => a[0] - b[0]).slice(0, Math.round(rand(5, 8))).map(([, i]) => i);
    if (near.length < 3) return null;
    const inTree = [near[0]];
    const rest = near.slice(1);
    const links = [];
    while (rest.length) {
      let best = null;
      for (const a of inTree) {
        for (const b of rest) {
          const d = Math.hypot(stars[a].x - stars[b].x, stars[a].y - stars[b].y);
          if (!best || d < best[2]) best = [a, b, d];
        }
      }
      links.push([best[0], best[1]]);
      inTree.push(best[1]);
      rest.splice(rest.indexOf(best[1]), 1);
    }
    if (!names.length) names = [...NAMES].sort(() => Math.random() - 0.5);
    return { stars: near, links, name: names.pop(), t: 0, life: 9 };
  };
  const paint = () => {
    g.drawImage(back, 0, 0, w, h);
    const S = 24;
    // (Lines first: the constellations drawn, then the pointer's.)
    g.lineCap = 'round';
    for (const c of drawn) {
      const a = Math.min(1, c.t / 0.6) * Math.min(1, (c.life - c.t) / 2);
      g.strokeStyle = css(glint, 0.55 * a);
      g.lineWidth = 1.4;
      g.beginPath();
      for (const [i, j] of c.links) {
        g.moveTo(stars[i].x, stars[i].y);
        g.lineTo(stars[j].x, stars[j].y);
      }
      g.stroke();
      // (Its name, under it.)
      let lowest = -Infinity;
      let sum = 0;
      for (const i of c.stars) {
        lowest = Math.max(lowest, stars[i].y);
        sum += stars[i].x;
      }
      g.fillStyle = css(glint, 0.75 * a);
      g.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(c.name.toUpperCase().split('').join(String.fromCharCode(8202)), clamp(sum / c.stars.length, 70, w - 70), Math.min(h - 8, lowest + 24));
    }
    if (px !== null) {
      const near = [];
      for (let i = 0; i < stars.length; i++) {
        const d = Math.hypot(stars[i].x - px, stars[i].y - py);
        if (d < REACH) near.push([i, d]);
      }
      g.lineWidth = 1;
      for (let a = 0; a < near.length; a++) {
        for (let b = a + 1; b < near.length; b++) {
          const s1 = stars[near[a][0]];
          const s2 = stars[near[b][0]];
          const d = Math.hypot(s1.x - s2.x, s1.y - s2.y);
          if (d > LINK) continue;
          const k = (1 - d / LINK) * (1 - Math.max(near[a][1], near[b][1]) / REACH);
          g.strokeStyle = css(glint, 0.5 * k);
          g.beginPath();
          g.moveTo(s1.x, s1.y);
          g.lineTo(s2.x, s2.y);
          g.stroke();
        }
      }
    }
    // (The stars: twinkling, brighter near the pointer, or in a constellation.)
    const lit = new Set();
    for (const c of drawn) for (const i of c.stars) lit.add(i);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let a = 0.55 + 0.45 * Math.sin(clock * s.speed + s.phase);
      if (px !== null) a += Math.max(0, 1 - Math.hypot(s.x - px, s.y - py) / REACH) * 0.5;
      if (lit.has(i)) a += 0.4;
      g.globalAlpha = clamp(a, 0.15, 1);
      const size = S * s.r * (lit.has(i) ? 1.25 : 1);
      g.drawImage(sprite, s.x - size / 2, s.y - size / 2, size, size);
    }
    g.globalAlpha = 1;
  };
  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      drawSky();
      const n = Math.round(clamp((w * h) / 4200, 140, 480));
      stars = Array.from({ length: n }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.35, 1) ** 2 * 0.9 + 0.25, phase: rand(0, 6.3), speed: rand(0.6, 2.4), vx: rand(-1.5, 1.5), vy: rand(-0.8, 0.8) }));
      drawn = [];
    },
    frame(dt) {
      clock += dt;
      for (const s of stars) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < -10) s.x += w + 20;
        else if (s.x > w + 10) s.x -= w + 20;
        if (s.y < -10) s.y += h + 20;
        else if (s.y > h + 10) s.y -= h + 20;
      }
      for (const c of drawn) c.t += dt;
      drawn = drawn.filter((c) => c.t < c.life);
      paint();
    },
    point(x, y) {
      px = x;
      py = y;
    },
    poke(x, y) {
      const c = join(x, y);
      if (!c) return;
      if (drawn.length >= 3) drawn.shift();
      drawn.push(c);
    },
    still() {
      const c = join(w * 0.4, h * 0.45);
      if (c) {
        c.t = 1;
        drawn = [c];
      }
      paint();
    },
    things: () => drawn.map((c) => ({ name: c.name, stars: c.stars.length, links: c.links.length })),
  };
}

// ---------- Rain on glass ----------
// Looking out through a rainy window at night: lights beyond it, out of focus, and the glass
// beaded with rain; now and then a drop slides down, gathering the beads in its way and leaving a
// clear trail behind (the beads come back, slowly). The pointer wipes the glass like a finger;
// a click or a tap is a drop landing there, and running down.
function rainglass(g, c1, c2) {
  const night = rgbOf(c1);
  const light = rgbOf(c2);
  const tints = [light, mix(light, [255, 110, 90], 0.5), mix(light, [120, 190, 255], 0.55), mix(light, [255, 255, 255], 0.4)];
  let w = 1;
  let h = 1;
  let k = 1;
  let back = null;
  let glass = null;
  let gx = null;
  let drops = [];
  let px = null;
  let py = null;
  let clock = 0;
  const bead = (x, y, r) => {
    // (A bead on the glass: the light behind it, upside down, small; a dark rim below, a glint above.)
    gx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    gx.beginPath();
    gx.arc(x, y, r, 0, Math.PI * 2);
    gx.fill();
    gx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    gx.lineWidth = Math.max(0.6, r * 0.35);
    gx.beginPath();
    gx.arc(x, y, r * 0.85, 0.15 * Math.PI, 0.85 * Math.PI);
    gx.stroke();
    gx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    gx.beginPath();
    gx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.4, r * 0.24), 0, Math.PI * 2);
    gx.fill();
  };
  const wipe = (x, y, r) => {
    gx.globalCompositeOperation = 'destination-out';
    gx.beginPath();
    gx.arc(x, y, r, 0, Math.PI * 2);
    gx.fill();
    gx.globalCompositeOperation = 'source-over';
  };
  const newDrop = (x, y) => ({ x, y, r: rand(3.8, 6.5), vy: 0, rest: rand(0.2, 1.6), left: 0 });
  const paint = () => {
    g.drawImage(back, 0, 0, w, h);
    g.drawImage(glass, 0, 0, w, h);
    for (const d of drops) {
      const rx = d.r;
      const ry = d.r * 1.22;
      // (The view through it: the lights behind, upside down and small.)
      g.save();
      g.beginPath();
      g.ellipse(d.x, d.y, rx, ry, 0, 0, Math.PI * 2);
      g.clip();
      g.translate(d.x, d.y);
      g.scale(1, -1);
      const span = d.r * 7;
      g.drawImage(back, clamp(d.x - span, 0, w - span * 2) * k, clamp(d.y - span, 0, h - span * 2) * k, span * 2 * k, span * 2 * k, -rx, -ry, rx * 2, ry * 2);
      g.restore();
      g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.ellipse(d.x, d.y, rx, ry, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      g.stroke();
      g.fillStyle = 'rgba(255, 255, 255, 0.7)';
      g.beginPath();
      g.arc(d.x - rx * 0.35, d.y - ry * 0.4, Math.max(0.6, d.r * 0.25), 0, Math.PI * 2);
      g.fill();
    }
  };
  const drawBack = () => {
    back = canvasOf(w * k, h * k);
    const b = back.getContext('2d');
    b.scale(k, k);
    const sky = b.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, css(shade(night, -0.25)));
    sky.addColorStop(1, css(shade(night, 0.12)));
    b.fillStyle = sky;
    b.fillRect(0, 0, w, h);
    // (Lights, out of focus: street lamps, windows, cars far off.)
    for (let i = 0; i < (w * h) / 5200; i++) {
      const r = rand(10, 46);
      const x = rand(-r, w + r);
      const y = h * (0.35 + Math.random() ** 0.7 * 0.65);
      const t = tints[Math.floor(Math.random() * tints.length)];
      const glow = b.createRadialGradient(x, y, 0, x, y, r);
      const a = rand(0.12, 0.42);
      glow.addColorStop(0, css(t, a));
      glow.addColorStop(0.7, css(t, a * 0.75));
      glow.addColorStop(1, css(t, 0));
      b.fillStyle = glow;
      b.beginPath();
      b.arc(x, y, r, 0, Math.PI * 2);
      b.fill();
    }
    // (And the glass misted over a little.)
    b.fillStyle = css(mix(night, [190, 200, 220], 0.4), 0.12);
    b.fillRect(0, 0, w, h);
  };
  const scatter = (n) => {
    for (let i = 0; i < n; i++) bead(rand(0, w), rand(0, h), Math.random() ** 2 * 2.6 + 0.9);
  };
  return {
    fps: 30,
    resize(nw, nh) {
      w = nw;
      h = nh;
      k = g.canvas.width / w;
      drawBack();
      glass = canvasOf(w * k, h * k);
      gx = glass.getContext('2d');
      gx.scale(k, k);
      scatter(Math.round((w * h) / 1100));
      drops = Array.from({ length: Math.round(clamp(w / 45, 8, 30)) }, () => newDrop(rand(0, w), rand(0, h)));
    },
    frame(dt) {
      clock += dt;
      scatter(Math.round((w * h) / 300000 + Math.random() * 0.7)); // (it's still raining: beads come back)
      for (const d of drops) {
        // (A drop sticks, then slides; it slides faster the bigger it gets, gathering beads in its way.)
        if (d.rest > 0) {
          d.rest -= dt;
          continue;
        }
        d.vy = Math.min(d.vy + 260 * dt, 40 + d.r * 22);
        const was = d.y;
        d.y += d.vy * dt;
        d.x += Math.sin(clock * 3 + d.y * 0.05) * 6 * dt;
        wipe(d.x, d.y, d.r * 1.1);
        d.left += d.y - was;
        if (d.left > 9) {
          d.left = 0;
          bead(d.x + rand(-1, 1), d.y - d.r * 1.6, rand(0.6, 1.2)); // (its trail)
        }
        d.r = Math.min(9, d.r + dt * 0.25);
        if (Math.random() < dt * 0.5) {
          d.rest = rand(0.1, 0.9);
          d.vy = 0;
        }
        if (d.y - d.r > h) Object.assign(d, newDrop(rand(0, w), rand(-40, h * 0.5)));
      }
      if (px !== null) wipe(px, py, 16);
      paint();
    },
    point(x, y) {
      px = x;
      py = y;
    },
    poke(x, y) {
      if (drops.length > 40) drops.shift();
      const d = newDrop(x, y);
      d.r = 5;
      d.rest = 0;
      d.vy = 30;
      drops.push(d);
    },
    still() {
      paint();
    },
    things: () => ({ drops: drops.length }),
  };
}

// ---------- City at night ----------
// A skyline after dark, far towers to near ones (moving with the pointer, nearer ones more), their
// windows lit and going out and coming on, lights blinking on the tallest, traffic below. A click
// or a tap in the sky is a firework; on a building, its lights all come on.
function city(g, c1, c2) {
  const sky = rgbOf(c1);
  const lamp = rgbOf(c2);
  let w = 1;
  let h = 1;
  let k = 1;
  let skyPic = null;
  let layers = [];
  let cars = [];
  let sparks = [];
  let blinks = [];
  let px = null;
  let clock = 0;
  let flip = 0;
  const M = 70; // (each row of buildings is this much wider each side, for moving with the pointer)
  const drawSky = () => {
    skyPic = canvasOf(w * k, h * k);
    const b = skyPic.getContext('2d');
    b.scale(k, k);
    const air = b.createLinearGradient(0, 0, 0, h);
    air.addColorStop(0, css(shade(sky, -0.45)));
    air.addColorStop(0.65, css(sky));
    air.addColorStop(1, css(mix(sky, lamp, 0.3)));
    b.fillStyle = air;
    b.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 6000; i++) {
      b.fillStyle = 'rgba(255, 255, 255, ' + rand(0.2, 0.7) + ')';
      b.fillRect(rand(0, w), rand(0, h * 0.5), rand(0.6, 1.4), rand(0.6, 1.4));
    }
    const moon = b.createRadialGradient(w * 0.82, h * 0.16, 0, w * 0.82, h * 0.16, 60);
    moon.addColorStop(0, 'rgba(255, 248, 225, 0.95)');
    moon.addColorStop(0.3, 'rgba(255, 248, 225, 0.9)');
    moon.addColorStop(0.34, 'rgba(255, 240, 200, 0.18)');
    moon.addColorStop(1, 'rgba(255, 240, 200, 0)');
    b.fillStyle = moon;
    b.fillRect(w * 0.82 - 60, h * 0.16 - 60, 120, 120);
  };
  // (A row of buildings: their shapes and windows, drawn once; a window's light changed on its own.)
  const makeLayer = (depth) => {
    const ground = h * (0.9 - depth * 0.08);
    const tone = mix(shade(sky, -0.55), sky, 0.45 - depth * 0.2);
    const pic = canvasOf((w + M * 2) * k, h * k);
    const b = pic.getContext('2d');
    b.scale(k, k);
    const buildings = [];
    const windows = [];
    let x = 0;
    while (x < w + M * 2) {
      const bw = rand(36, 90) * (1 + depth * 0.25);
      const bh = rand(0.18, 0.5) * h * (1 - depth * 0.25) + (Math.random() < 0.12 ? h * 0.15 : 0);
      const top = ground - bh;
      buildings.push({ x, top, w: bw });
      b.fillStyle = css(shade(tone, rand(-0.08, 0.06)));
      b.fillRect(x, top, bw, h - top);
      if (Math.random() < 0.3) b.fillRect(x + bw * 0.4, top - 14, bw * 0.2, 14); // (a roof's top)
      if (bh > h * 0.42 && depth > 0) blinks.push({ layer: depth, x: x + bw / 2, y: top - 16, phase: rand(0, 3) });
      const cw = 6 + depth * 1.5;
      const gap = 5 + depth;
      for (let wy = top + 10; wy < ground - 12; wy += cw + gap) {
        for (let wx = x + 7; wx < x + bw - cw - 4; wx += cw + gap) {
          windows.push({ x: wx, y: wy, s: cw, on: Math.random() < 0.38, warm: Math.random() });
        }
      }
      x += bw + rand(2, 10);
    }
    b.fillStyle = css(shade(tone, -0.1));
    b.fillRect(0, ground, w + M * 2, h - ground);
    const layer = { depth, pic, b, windows, buildings, ground };
    for (const win of windows) drawWindow(layer, win);
    return layer;
  };
  const drawWindow = (layer, win) => {
    const b = layer.b;
    b.fillStyle = win.on ? css(mix(lamp, [255, 255, 255], win.warm * 0.35), 0.9 - layer.depth * 0.15) : css(shade(sky, -0.6), 0.9);
    b.fillRect(win.x, win.y, win.s, win.s * 1.3);
  };
  const shift = (layer) => (px === null ? 0 : ((px / w) - 0.5) * -M * (0.25 + layer.depth * 0.35));
  const paint = () => {
    g.drawImage(skyPic, 0, 0, w, h);
    for (const layer of layers) {
      const sx = shift(layer);
      g.drawImage(layer.pic, -M + sx, 0, w + M * 2, h);
    }
    // (Red lights on the tallest, blinking.)
    for (const bl of blinks) {
      const on = (Math.sin(clock * 2.4 + bl.phase) + 1) / 2;
      g.fillStyle = 'rgba(255, 70, 60, ' + (0.2 + on * 0.8).toFixed(2) + ')';
      g.beginPath();
      g.arc(bl.x - M + shift(layers[bl.layer]), bl.y, 1.8 + on, 0, Math.PI * 2);
      g.fill();
    }
    // (Traffic: headlights one way, tail lights the other.)
    const road = h * 0.955;
    g.fillStyle = 'rgba(10, 10, 16, 0.85)';
    g.fillRect(0, road - 6, w, h - road + 6);
    for (const c of cars) {
      const y = road + (c.dir > 0 ? -2 : 4);
      const streak = g.createLinearGradient(c.x - c.dir * 26, 0, c.x, 0);
      const col = c.dir > 0 ? '255, 245, 220' : '255, 60, 50';
      streak.addColorStop(0, 'rgba(' + col + ', 0)');
      streak.addColorStop(1, 'rgba(' + col + ', 0.9)');
      g.fillStyle = streak;
      g.fillRect(Math.min(c.x, c.x - c.dir * 26), y - 1.2, 26, 2.4);
    }
    g.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      g.globalAlpha = clamp(1 - s.t / s.life, 0, 1);
      g.fillStyle = s.color;
      g.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };
  return {
    fps: 30,
    resize(nw, nh) {
      w = nw;
      h = nh;
      k = g.canvas.width / w;
      blinks = [];
      drawSky();
      layers = [makeLayer(0), makeLayer(1), makeLayer(2)];
      cars = Array.from({ length: Math.round(clamp(w / 90, 4, 16)) }, () => ({ x: rand(0, w), dir: Math.random() < 0.5 ? 1 : -1, v: rand(50, 110) }));
      sparks = [];
    },
    frame(dt) {
      clock += dt;
      flip += dt;
      while (flip > 0.25) {
        flip -= 0.25;
        const layer = layers[1 + Math.floor(Math.random() * 2)];
        const win = layer.windows[Math.floor(Math.random() * layer.windows.length)];
        if (win) {
          win.on = !win.on;
          drawWindow(layer, win);
        }
      }
      for (const c of cars) {
        c.x += c.dir * c.v * dt;
        if (c.x > w + 40) c.x = -40;
        else if (c.x < -40) c.x = w + 40;
      }
      for (const s of sparks) {
        s.t += dt;
        s.vy += 90 * dt;
        s.vx *= Math.exp(-dt * 1.4);
        s.vy *= Math.exp(-dt * 1.4);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      sparks = sparks.filter((s) => s.t < s.life);
      paint();
    },
    point(x) {
      px = x;
    },
    poke(x, y) {
      const near = layers[2];
      const at = x + M - shift(near);
      const hit = near.buildings.find((bd) => at >= bd.x && at <= bd.x + bd.w && y >= bd.top);
      if (hit) {
        for (const win of near.windows) {
          if (win.x >= hit.x && win.x <= hit.x + hit.w) {
            win.on = true;
            drawWindow(near, win);
          }
        }
        return;
      }
      const colors = ['#ffd27a', '#ff7ab8', '#7ad7ff', '#b9ff7a', '#ffffff'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2;
        const v = rand(60, 150);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(1, 1.6), color: c });
      }
      if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
    },
    still() {
      paint();
    },
    things: () => ({ windows: layers.reduce((n, l) => n + l.windows.filter((x) => x.on).length, 0), sparks: sparks.length }),
  };
}

// ---------- Fireplace ----------
// A fire in a stone hearth: flames licking up from the logs, sparks and embers rising, and its
// light flickering on the stones round it. A click or a tap stirs it: it flares, and sparks fly.
function fireplace(g, c1, c2) {
  const stone = rgbOf(c1);
  const flame = rgbOf(c2);
  let w = 1;
  let h = 1;
  let k = 1;
  let wall = null;
  let box = null; // (the fire's opening: x, y, w, h)
  let parts = [];
  let sparks = [];
  let flare = 0;
  let clock = 0;
  let owed = 0;
  const sprites = [];
  const sprite = (inner, outer) => {
    const c = canvasOf(64, 64);
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, outer);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    return c;
  };
  const drawWall = () => {
    wall = canvasOf(w * k, h * k);
    const b = wall.getContext('2d');
    b.scale(k, k);
    b.fillStyle = css(shade(stone, -0.35));
    b.fillRect(0, 0, w, h);
    // (Stones, in rows, each a little different.)
    const rowH = 34;
    for (let y = 0, row = 0; y < h; y += rowH, row++) {
      for (let x = row % 2 ? -30 : 0; x < w; ) {
        const sw = rand(50, 90);
        b.fillStyle = css(shade(stone, rand(-0.18, 0.12)));
        b.beginPath();
        b.roundRect(x + 2, y + 2, sw - 4, rowH - 4, 6);
        b.fill();
        x += sw;
      }
    }
    const bw = Math.min(w * 0.62, 560);
    const bh = Math.min(h * 0.42, 340);
    box = { x: (w - bw) / 2, y: h * 0.9 - bh, w: bw, h: bh };
    // (The mantel, and the hearth's opening: dark, deeper at the back.)
    b.fillStyle = css(shade(stone, -0.55));
    b.fillRect(box.x - 40, box.y - 46, box.w + 80, 22);
    b.fillStyle = css(shade(stone, -0.2));
    b.fillRect(box.x - 40, box.y - 50, box.w + 80, 6);
    const inside = b.createLinearGradient(0, box.y, 0, box.y + box.h);
    inside.addColorStop(0, '#050303');
    inside.addColorStop(1, '#1a0d08');
    b.fillStyle = inside;
    b.beginPath();
    b.roundRect(box.x, box.y, box.w, box.h, [box.w * 0.18, box.w * 0.18, 0, 0]);
    b.fill();
    // (The floor in front.)
    b.fillStyle = css(shade(stone, -0.45));
    b.fillRect(0, h * 0.9, w, h * 0.1);
    // (Logs.)
    const ly = box.y + box.h - 18;
    const log = (x, y, len, tilt) => {
      b.save();
      b.translate(x, y);
      b.rotate(tilt);
      b.fillStyle = '#4a2a18';
      b.beginPath();
      b.roundRect(-len / 2, -10, len, 20, 10);
      b.fill();
      b.fillStyle = '#7a4a2c';
      b.beginPath();
      b.ellipse(len / 2 - 4, 0, 6, 9, 0, 0, Math.PI * 2);
      b.fill();
      b.restore();
    };
    log(w / 2 - box.w * 0.12, ly, box.w * 0.42, -0.12);
    log(w / 2 + box.w * 0.12, ly, box.w * 0.42, 0.14);
    log(w / 2, ly - 10, box.w * 0.34, 0.02);
  };
  const emit = (n, strong = 1) => {
    for (let i = 0; i < n; i++) {
      const spread = box.w * 0.24;
      const off = rand(-1, 1);
      parts.push({ x: w / 2 + off * Math.abs(off) * spread, y: box.y + box.h - 26, vx: rand(-10, 10), vy: -rand(90, 170) * strong, s: rand(42, 78) * strong * (1 - Math.abs(off) * 0.4), t: 0, life: rand(0.45, 0.85) });
    }
  };
  const paint = () => {
    g.drawImage(wall, 0, 0, w, h);
    const flick = 0.8 + Math.sin(clock * 9) * 0.06 + Math.sin(clock * 23) * 0.05 + flare * 0.25;
    // (The fire, inside its opening.)
    g.save();
    g.beginPath();
    g.roundRect(box.x, box.y, box.w, box.h, [box.w * 0.18, box.w * 0.18, 0, 0]);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    // (A glow under the logs, then the flames: each tall and narrow, shrinking as it rises.)
    const bed = g.createRadialGradient(w / 2, box.y + box.h - 22, 0, w / 2, box.y + box.h - 22, box.w * 0.34);
    bed.addColorStop(0, css(mix(flame, [255, 230, 160], 0.5), 0.55 * flick));
    bed.addColorStop(1, css(flame, 0));
    g.fillStyle = bed;
    g.fillRect(box.x, box.y, box.w, box.h);
    for (const p of parts) {
      const a = p.t / p.life;
      const pic = sprites[a < 0.3 ? 0 : a < 0.65 ? 1 : 2];
      const s = p.s * (1 - a * 0.75);
      g.globalAlpha = clamp((1 - a) ** 1.3, 0, 1);
      g.drawImage(pic, p.x - s * 0.36, p.y - s * 0.62, s * 0.72, s * 1.24);
    }
    g.restore();
    // (Sparks, out into the room.)
    g.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      g.globalAlpha = clamp(1 - s.t / s.life, 0, 1);
      g.fillStyle = s.t < s.life * 0.5 ? '#fff1b0' : css(flame);
      g.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    // (Its light on the stones.)
    g.globalAlpha = 1;
    const cx = w / 2;
    const cy = box.y + box.h * 0.7;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    glow.addColorStop(0, css(flame, 0.2 * flick));
    glow.addColorStop(0.5, css(flame, 0.07 * flick));
    glow.addColorStop(1, css(flame, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  };
  const step = (dt) => {
    clock += dt;
    flare = Math.max(0, flare - dt * 0.8);
    owed += dt * (120 + flare * 160);
    const n = Math.floor(owed);
    owed -= n;
    emit(n, 1 + flare * 0.5);
    for (const p of parts) {
      p.t += dt;
      p.vx += Math.sin(clock * 3 + p.y * 0.03) * 30 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x += (w / 2 - p.x) * dt * 1.3; // (drawn in towards the middle as they rise)
    }
    parts = parts.filter((p) => p.t < p.life);
    if (Math.random() < dt * (2 + flare * 20)) {
      sparks.push({ x: w / 2 + rand(-box.w * 0.2, box.w * 0.2), y: box.y + box.h - 30, vx: rand(-30, 30), vy: -rand(80, 200), t: 0, life: rand(1, 2.4) });
    }
    for (const s of sparks) {
      s.t += dt;
      s.vx += Math.sin(clock * 5 + s.y * 0.1) * 40 * dt;
      s.vy += 20 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    sparks = sparks.filter((s) => s.t < s.life);
  };
  return {
    fps: 30,
    resize(nw, nh) {
      w = nw;
      h = nh;
      k = g.canvas.width / w;
      if (!sprites.length) {
        sprites.push(sprite('rgba(255, 250, 220, 1)', css(mix(flame, [255, 230, 150], 0.6), 0.8)));
        sprites.push(sprite(css(mix(flame, [255, 220, 120], 0.4), 0.95), css(flame, 0.6)));
        sprites.push(sprite(css(mix(flame, [200, 40, 20], 0.5), 0.7), css(mix(flame, [120, 20, 10], 0.6), 0.3)));
      }
      drawWall();
      parts = [];
      sparks = [];
      for (let i = 0; i < 40; i++) step(1 / 30);
    },
    frame(dt) {
      step(dt);
      paint();
    },
    point() {},
    poke() {
      flare = 1;
      for (let i = 0; i < 24; i++) sparks.push({ x: w / 2 + rand(-box.w * 0.25, box.w * 0.25), y: box.y + box.h - 30, vx: rand(-90, 90), vy: -rand(120, 300), t: 0, life: rand(0.8, 2) });
    },
    still() {
      paint();
    },
    things: () => ({ flames: parts.length, sparks: sparks.length, flare: +flare.toFixed(2) }),
  };
}

// ---------- An old web browser ----------
// The page in a Rainscape window, as the web was seen around 1996 (Rain95's grey, bevelled) or 2002
// (RainXP's blue and beige): its title ("Rainscape - Bea's homepage"), menus, Back, Forward,
// Reload and Home, the address (a homepage of then's, with a tilde), a status bar, and a throbber
// with rain in it. Its buttons light up under the pointer; one pressed, or the throbber, loads the
// page again (a bar filling along the bottom), as it does now and then by itself. c1: the page;
// c2: the title bar.
function oldBrowser(style) {
  return (g, c1, c2, opts = {}) => {
    const xp = style === 'xp';
    const page = rgbOf(c1);
    const bar = rgbOf(c2);
    const name = String(opts.name || 'my').slice(0, 40);
    const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '') || 'home';
    const address = 'http://www.rainlit.app/~' + slug + '/index.html';
    const title = (name === 'my' ? 'My' : name + "'s") + ' homepage - Rainscape';
    const UI = '11px Tahoma, "MS Sans Serif", Verdana, sans-serif';
    let w = 1;
    let h = 1;
    let k = 1;
    let back = null;
    let L = null; // (where everything is)
    let px = null;
    let py = null;
    let clock = 0;
    let loading = null; // ({ t, of }: a page loading, so far)
    let nextLoad = rand(14, 26);
    // (A picture on its page, once it's come: repeated at its own size, or stretched to fill.)
    let pic = null;
    if (opts.picture && opts.picture.url && typeof Image === 'function') {
      const img = new Image();
      img.onload = () => {
        pic = img;
        if (L) {
          drawChrome();
          paint();
        }
      };
      img.src = opts.picture.url;
    }
    const grey = '#c0c0c0';
    const beige = '#ece9d8';
    const rect = (b, x, y, ww, hh, c) => { b.fillStyle = c; b.fillRect(x, y, ww, hh); };
    // (Rain95's bevels: raised, as a button is, or sunk in, as a field is.)
    const bevel = (b, x, y, ww, hh, up = true) => {
      const [lt, dk, dk2] = up ? ['#ffffff', '#404040', '#808080'] : ['#808080', '#ffffff', '#dfdfdf'];
      rect(b, x, y, ww, 1, lt); rect(b, x, y, 1, hh, lt);
      rect(b, x, y + hh - 1, ww, 1, dk); rect(b, x + ww - 1, y, 1, hh, dk);
      rect(b, x + 1, y + hh - 2, ww - 2, 1, dk2); rect(b, x + ww - 2, y + 1, 1, hh - 2, dk2);
    };
    const text = (b, s, x, y, { font = UI, color = '#000', align = 'left', max = 0 } = {}) => {
      b.font = font;
      b.fillStyle = color;
      b.textAlign = align;
      b.textBaseline = 'middle';
      let t = s;
      if (max > 0 && b.measureText(t).width > max) {
        while (t.length > 1 && b.measureText(t + '...').width > max) t = t.slice(0, -1);
        t += '...';
      }
      b.fillText(t, x, y);
    };
    // (Rainlit's drop.)
    const drop = (b, cx, cy, r, tint = '#4c9bff') => {
      b.beginPath();
      b.moveTo(cx, cy - r * 1.5);
      b.bezierCurveTo(cx + r * 0.2, cy - r * 0.9, cx + r, cy - r * 0.35, cx + r, cy + r * 0.2);
      b.arc(cx, cy + r * 0.2, r, 0, Math.PI);
      b.bezierCurveTo(cx - r, cy - r * 0.35, cx - r * 0.2, cy - r * 0.9, cx, cy - r * 1.5);
      const gr = b.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      gr.addColorStop(0, '#bfe0ff');
      gr.addColorStop(1, tint);
      b.fillStyle = gr;
      b.fill();
    };
    // (A button's little picture: an arrow, two arrows round, or a house.)
    const icon = (b, kind, cx, cy, s, color) => {
      b.fillStyle = color;
      b.strokeStyle = color;
      b.lineWidth = Math.max(2, s * 0.18);
      b.beginPath();
      if (kind === 'back' || kind === 'forward') {
        const d = kind === 'back' ? -1 : 1;
        b.moveTo(cx + d * s * 0.55, cy);
        b.lineTo(cx - d * s * 0.05, cy - s * 0.5);
        b.lineTo(cx - d * s * 0.05, cy - s * 0.2);
        b.lineTo(cx - d * s * 0.55, cy - s * 0.2);
        b.lineTo(cx - d * s * 0.55, cy + s * 0.2);
        b.lineTo(cx - d * s * 0.05, cy + s * 0.2);
        b.lineTo(cx - d * s * 0.05, cy + s * 0.5);
        b.closePath();
        b.fill();
      } else if (kind === 'reload') {
        b.arc(cx, cy, s * 0.4, -Math.PI * 0.3, Math.PI * 1.4);
        b.stroke();
        b.beginPath();
        b.moveTo(cx + s * 0.18, cy - s * 0.62);
        b.lineTo(cx + s * 0.5, cy - s * 0.3);
        b.lineTo(cx + s * 0.08, cy - s * 0.18);
        b.closePath();
        b.fill();
      } else if (kind === 'home') {
        b.moveTo(cx, cy - s * 0.55);
        b.lineTo(cx + s * 0.55, cy - s * 0.02);
        b.lineTo(cx + s * 0.38, cy - s * 0.02);
        b.lineTo(cx + s * 0.38, cy + s * 0.5);
        b.lineTo(cx - s * 0.38, cy + s * 0.5);
        b.lineTo(cx - s * 0.38, cy - s * 0.02);
        b.lineTo(cx - s * 0.55, cy - s * 0.02);
        b.closePath();
        b.fill();
      }
    };
    const BUTTONS = [['back', 'Back'], ['forward', 'Forward'], ['reload', xp ? 'Refresh' : 'Reload'], ['home', 'Home']];
    const lay = () => {
      const top = xp ? 30 : 22;
      const menu = xp ? 22 : 20;
      const tools = xp ? 40 : 44;
      const addr = 26;
      const status = 22;
      const toolsY = top + menu;
      const addrY = toolsY + tools;
      const pageY = addrY + addr + 2;
      const bw = xp ? 74 : 52;
      const buttons = BUTTONS.map(([key, label], i) => ({ key, label, x: 6 + i * (bw + (xp ? 4 : 2)), y: toolsY + 3, w: bw, h: tools - 6 }));
      const throb = xp ? { x: w - 46, y: top + 1, w: 40, h: menu - 2 } : { x: w - 46, y: toolsY + 2, w: 40, h: tools - 4 };
      return { top, menu, tools, addr, status, toolsY, addrY, pageY, buttons, throb };
    };
    const drawChrome = () => {
      back = canvasOf(w * k, h * k);
      const b = back.getContext('2d');
      b.scale(k, k);
      // (The page: its colour, all the way through, and its picture, if it's one; the window round it.)
      rect(b, 0, 0, w, h, css(page));
      if (pic) {
        const top = L.pageY;
        const ph = h - L.status - top;
        b.save();
        b.beginPath();
        b.rect(0, top, w, ph);
        b.clip();
        if (opts.picture.fit === 'stretch') {
          b.drawImage(pic, 0, top, w, ph);
        } else {
          const pat = b.createPattern(pic, 'repeat');
          if (pat) {
            pat.setTransform(new DOMMatrix([1, 0, 0, 1, 0, top]));
            b.fillStyle = pat;
            b.fillRect(0, top, w, ph);
          }
        }
        b.restore();
      }
      const face = xp ? beige : grey;
      // Title bar.
      if (xp) {
        const t = b.createLinearGradient(0, 0, 0, L.top);
        t.addColorStop(0, css(shade(bar, 0.35)));
        t.addColorStop(0.12, css(shade(bar, 0.08)));
        t.addColorStop(0.45, css(bar));
        t.addColorStop(0.85, css(shade(bar, -0.12)));
        t.addColorStop(1, css(shade(bar, -0.3)));
        b.fillStyle = t;
        b.beginPath();
        b.roundRect(0, 0, w, L.top + 6, [8, 8, 0, 0]);
        b.fill();
        drop(b, 16, L.top / 2 + 2, 5, '#9fd0ff');
        text(b, title, 28, L.top / 2 + 1, { font: 'bold 13px "Trebuchet MS", Tahoma, sans-serif', color: '#fff', max: w - 130 });
        [['_', '#2560e8'], ['□', '#2560e8'], ['×', '#d4421f']].forEach(([s, c], i) => {
          const x = w - 26 * (3 - i) - 4;
          b.fillStyle = c;
          b.beginPath();
          b.roundRect(x, 4, 22, 22, 3);
          b.fill();
          b.strokeStyle = '#fff';
          b.lineWidth = 1;
          b.stroke();
          text(b, s, x + 11, 15, { font: 'bold 13px Tahoma, sans-serif', color: '#fff', align: 'center' });
        });
      } else {
        rect(b, 0, 0, w, L.top, face);
        bevel(b, 0, 0, w, h, true);
        const t = b.createLinearGradient(3, 0, w - 3, 0);
        t.addColorStop(0, css(bar));
        t.addColorStop(1, css(mix(bar, [16, 132, 208], 0.75)));
        b.fillStyle = t;
        b.fillRect(3, 3, w - 6, L.top - 4);
        drop(b, 12, L.top / 2 + 1, 4, '#9fd0ff');
        text(b, title, 22, L.top / 2 + 1, { font: 'bold 11px Tahoma, "MS Sans Serif", sans-serif', color: '#fff', max: w - 90 });
        ['_', '□', '×'].forEach((s, i) => {
          const x = w - 3 - (3 - i) * 18 + (i === 2 ? 2 : 0);
          rect(b, x, 5, 16, 14, face);
          bevel(b, x, 5, 16, 14, true);
          text(b, s, x + 8, 12, { font: 'bold 10px Tahoma, sans-serif', align: 'center' });
        });
      }
      // Menus.
      const menuY = L.top;
      rect(b, xp ? 0 : 3, menuY, xp ? w : w - 6, L.menu, face);
      let mx = 10;
      for (const m of xp ? ['File', 'Edit', 'View', 'Favorites', 'Tools', 'Help'] : ['File', 'Edit', 'View', 'Go', 'Bookmarks', 'Help']) {
        text(b, m, mx, menuY + L.menu / 2, { font: UI });
        b.font = UI;
        mx += b.measureText(m).width + 14;
      }
      // Toolbar.
      if (xp) {
        const t = b.createLinearGradient(0, L.toolsY, 0, L.toolsY + L.tools);
        t.addColorStop(0, '#f7f6f0');
        t.addColorStop(1, '#e3dfcf');
        b.fillStyle = t;
        b.fillRect(0, L.toolsY, w, L.tools);
        rect(b, 0, L.toolsY, w, 1, '#d7d2bf');
      } else {
        rect(b, 3, L.toolsY, w - 6, L.tools, face);
        rect(b, 3, L.toolsY, w - 6, 1, '#808080');
        rect(b, 3, L.toolsY + 1, w - 6, 1, '#fff');
      }
      // Address.
      const ay = L.addrY;
      if (xp) {
        rect(b, 0, ay, w, L.addr, beige);
        rect(b, 0, ay, w, 1, '#d7d2bf');
        text(b, 'Address', 8, ay + L.addr / 2, { color: '#5b5b5b' });
        const fx = 58;
        const fw = w - fx - 44;
        rect(b, fx, ay + 3, fw, L.addr - 6, '#fff');
        b.strokeStyle = '#7f9db9';
        b.lineWidth = 1;
        b.strokeRect(fx + 0.5, ay + 3.5, fw - 1, L.addr - 7);
        drop(b, fx + 10, ay + L.addr / 2 + 1, 3.5);
        text(b, address, fx + 20, ay + L.addr / 2, { max: fw - 26 });
        // (Go.)
        b.fillStyle = '#3c9a2e';
        b.beginPath();
        b.roundRect(w - 40, ay + 4, 18, 18, 3);
        b.fill();
        icon(b, 'forward', w - 31, ay + 13, 12, '#fff');
        text(b, 'Go', w - 18, ay + L.addr / 2, { color: '#000' });
      } else {
        rect(b, 3, ay, w - 6, L.addr, face);
        text(b, 'Location:', 10, ay + L.addr / 2);
        const fx = 64;
        const fw = w - fx - 10;
        rect(b, fx, ay + 3, fw, L.addr - 6, '#fff');
        bevel(b, fx, ay + 3, fw, L.addr - 6, false);
        text(b, address, fx + 6, ay + L.addr / 2, { max: fw - 12 });
      }
      // The page's own edge.
      if (xp) {
        rect(b, 0, L.pageY - 2, w, 2, '#7f9db9');
        rect(b, 0, L.pageY, 3, h - L.pageY, css(shade(bar, -0.1)));
        rect(b, w - 3, L.pageY, 3, h - L.pageY, css(shade(bar, -0.1)));
      } else {
        rect(b, 3, L.pageY - 2, w - 6, 2, face);
        bevel(b, 3, L.pageY - 2, w - 6, h - L.pageY - L.status + 2, false);
      }
      // Status bar (its words and its bar are drawn each time: paint).
      const sy = h - L.status;
      if (xp) {
        rect(b, 0, sy, w, L.status, beige);
        rect(b, 0, sy, w, 1, '#d7d2bf');
        rect(b, w - 130, sy + 3, 1, L.status - 6, '#c3bfae');
        b.fillStyle = '#3b82d1';
        b.beginPath();
        b.arc(w - 116, sy + L.status / 2, 6, 0, Math.PI * 2);
        b.fill();
        b.strokeStyle = '#d9ecff';
        b.lineWidth = 1;
        b.beginPath();
        b.ellipse(w - 116, sy + L.status / 2, 3, 6, 0, 0, Math.PI * 2);
        b.moveTo(w - 122, sy + L.status / 2);
        b.lineTo(w - 110, sy + L.status / 2);
        b.stroke();
        text(b, 'Internet', w - 104, sy + L.status / 2);
      } else {
        rect(b, 3, sy, w - 6, L.status - 3, face);
        bevel(b, 5, sy + 2, w - 160, L.status - 6, false);
        bevel(b, w - 152, sy + 2, 120, L.status - 6, false);
        bevel(b, w - 29, sy + 2, 24, L.status - 6, false);
        // (A padlock, open: the web then.)
        b.strokeStyle = '#505050';
        b.lineWidth = 1.5;
        b.beginPath();
        b.arc(w - 17, sy + 8, 3, Math.PI, Math.PI * 1.9);
        b.stroke();
        rect(b, w - 21, sy + 9, 8, 6, '#7a6a2a');
      }
    };
    const paint = () => {
      g.drawImage(back, 0, 0, w, h);
      // Its buttons: lit under the pointer.
      for (const bt of L.buttons) {
        const over = px !== null && px >= bt.x && px < bt.x + bt.w && py >= bt.y && py < bt.y + bt.h;
        if (xp) {
          if (over) {
            g.fillStyle = 'rgba(255, 255, 255, 0.7)';
            g.strokeStyle = '#c1d2ee';
            g.lineWidth = 1;
            g.beginPath();
            g.roundRect(bt.x + 0.5, bt.y + 0.5, bt.w - 1, bt.h - 1, 3);
            g.fill();
            g.stroke();
          }
          const round = bt.key === 'back' || bt.key === 'forward';
          if (round) {
            g.fillStyle = over ? '#4dbb3a' : '#3c9a2e';
            g.beginPath();
            g.arc(bt.x + 15, bt.y + bt.h / 2, 12, 0, Math.PI * 2);
            g.fill();
            icon(g, bt.key, bt.x + 15, bt.y + bt.h / 2, 14, '#fff');
          } else {
            icon(g, bt.key, bt.x + 15, bt.y + bt.h / 2, 16, bt.key === 'reload' ? '#3c9a2e' : '#3a6fc4');
          }
          text(g, bt.label, bt.x + 32, bt.y + bt.h / 2, { color: '#000' });
        } else {
          if (over) bevel(g, bt.x, bt.y, bt.w, bt.h, true);
          icon(g, bt.key, bt.x + bt.w / 2, bt.y + 13, 16, bt.key === 'reload' ? '#2f7d32' : bt.key === 'home' ? '#8a5a16' : '#1f4fa8');
          text(g, bt.label, bt.x + bt.w / 2, bt.y + bt.h - 8, { align: 'center' });
        }
      }
      // The throbber: rain in it while a page is loading, still otherwise.
      const tb = L.throb;
      if (xp) {
        g.fillStyle = '#fff';
        g.fillRect(tb.x, tb.y, tb.w, tb.h);
      } else {
        g.fillStyle = '#000';
        g.fillRect(tb.x, tb.y, tb.w, tb.h);
        bevel(g, tb.x, tb.y, tb.w, tb.h, false);
      }
      g.save();
      g.beginPath();
      g.rect(tb.x + 2, tb.y + 2, tb.w - 4, tb.h - 4);
      g.clip();
      if (loading) {
        g.strokeStyle = xp ? 'rgba(60, 120, 220, 0.8)' : 'rgba(140, 200, 255, 0.9)';
        g.lineWidth = 1.2;
        g.beginPath();
        for (let i = 0; i < 7; i++) {
          const x = tb.x + 4 + ((i * 11 + clock * 9) % (tb.w - 6));
          const y = tb.y + ((i * 7 + clock * 70) % (tb.h + 8)) - 4;
          g.moveTo(x, y);
          g.lineTo(x - 2, y + 6);
        }
        g.stroke();
      }
      drop(g, tb.x + tb.w / 2, tb.y + tb.h / 2 + (xp ? 1 : 2), xp ? 5 : 8 + (loading ? Math.sin(clock * 8) * 1 : 0));
      g.restore();
      // The status bar's words, and a bar filling while it loads.
      const sy = h - L.status;
      const said = loading ? (loading.t < 0.4 ? 'Looking up host: www.rainlit.app...' : 'Transferring data from www.rainlit.app...') : xp ? 'Done' : 'Document: Done';
      text(g, said, xp ? 8 : 10, sy + L.status / 2 - (xp ? 0 : 1), { max: w - 180 });
      if (loading) {
        const k2 = Math.min(1, loading.t / loading.of);
        if (xp) {
          const bx = w - 250;
          g.strokeStyle = '#a5a598';
          g.strokeRect(bx + 0.5, sy + 5.5, 110, L.status - 11);
          for (let i = 0; i < Math.floor(k2 * 13); i++) {
            g.fillStyle = '#3ca83c';
            g.fillRect(bx + 3 + i * 8, sy + 8, 6, L.status - 16);
          }
        } else {
          g.fillStyle = '#000080';
          g.fillRect(w - 150, sy + 4, Math.round(116 * k2), L.status - 10);
        }
      }
    };
    const startLoad = () => {
      if (!loading) loading = { t: 0, of: rand(1.8, 3.2) };
    };
    return {
      fps: 20, // (a frame every 50 ms at most: slower, and its clock would lag)
      resize(nw, nh) {
        w = nw;
        h = nh;
        k = g.canvas.width / w;
        L = lay();
        drawChrome();
      },
      frame(dt) {
        clock += dt;
        if (loading) {
          loading.t += dt;
          if (loading.t > loading.of + 0.3) {
            loading = null;
            nextLoad = rand(18, 40);
          }
        } else if ((nextLoad -= dt) <= 0) startLoad();
        paint();
      },
      point(x, y) {
        px = x;
        py = y;
      },
      poke(x, y) {
        const tb = L.throb;
        const onButton = L.buttons.some((bt) => x >= bt.x && x < bt.x + bt.w && y >= bt.y && y < bt.y + bt.h);
        if (onButton || (x >= tb.x && x < tb.x + tb.w && y >= tb.y && y < tb.y + tb.h)) startLoad();
      },
      still() {
        paint();
      },
      things: () => ({ loading: Boolean(loading), page: L ? L.pageY : 0 }),
    };
  };
}
const browser95 = oldBrowser('95');
const browserxp = oldBrowser('xp');

export const SCENES = { warp, bubbles, bounce, pipes, pond, lava, mystify, globe, constellations, rainglass, city, fireplace, browser95, browserxp };
