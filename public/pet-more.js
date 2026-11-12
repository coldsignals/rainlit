// More for a pet's room, and for it to wear, each got with dew (lib/pets.js says what each costs):
// ice, the backrooms, under the sea, deep space, a workshop, a castle, and some that go anywhere.
// homepage.js takes them in with its own (its ROOM, TINTS and WEAR), given what it draws with.
window.RainlitPetMore = (h) => {
  const { oval } = h;
  // Something drawn: a grid of letters ('.' nothing), with rectangles, discs, lines and stamps put on it.
  const grid = (w, hh, fill = '.') => {
    const g = Array.from({ length: hh }, () => Array(w).fill(fill));
    const api = {
      w, h: hh,
      get: (x, y) => (g[y] && g[y][x]) || null,
      set(x, y, c) {
        x = Math.round(x);
        y = Math.round(y);
        if (y >= 0 && y < hh && x >= 0 && x < w) g[y][x] = c;
        return api;
      },
      rect(x, y, rw, rh, c) {
        for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) api.set(x + i, y + j, c);
        return api;
      },
      disc(cx, cy, r, c, ry = r) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
          for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2 <= 1) api.set(x, y, c);
        }
        return api;
      },
      line(x0, y0, x1, y1, c) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= n; i++) api.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
        return api;
      },
      put(x, y, rows) {
        rows.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') api.set(x + i, y + j, c); }));
        return api;
      },
      // (Only where something's drawn already: `on`, its letters.)
      over(x, y, c, on) {
        if (on.includes(api.get(Math.round(x), Math.round(y)))) api.set(x, y, c);
        return api;
      },
      rows: () => g.map((r) => r.join('')),
    };
    return api;
  };
  const tile = (w, hh, fn) => Array.from({ length: hh }, (_, y) => Array.from({ length: w }, (_, x) => fn(x, y)).join(''));
  const has = (list, x, y) => list.some(([a, b]) => a === x && b === y);
  const dots = (w, hh, list, ch) => tile(w, hh, (x, y) => (has(list, x, y) ? ch : '.'));
  // (A window's sky: 18 by 11.)
  const sky = (fn) => tile(18, 11, fn);
  // (Each frame of something that moves, from how far through it is: `n` of them.)
  const turns = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, i / n));

  const ROOM = { wall: {}, floor: {}, rug: {}, hang: {}, stand: {}, ceiling: {}, sky: {}, light: {} };
  const TINTS = {};
  const WEAR = { head: {}, eyes: {}, neck: {}, body: {} };

  // ---- Walls ----
  Object.assign(ROOM.wall, {
    // (Frost creeping over it, its crystals catching the light.)
    frost: {
      label: 'Frosted', dew: true, twinkle: 's',
      tile: tile(16, 12, (x, y) => (has([[3, 2], [11, 8]], x, y) ? 's' : has([[2, 2], [4, 2], [3, 1], [3, 3], [10, 8], [12, 8], [11, 7], [11, 9], [7, 5], [14, 1], [0, 10]], x, y) ? 'c' : (x + y * 2) % 16 < 2 ? 'b' : 'a')),
      colors: { a: '#6fa3c8', b: '#7db1d4', c: '#a9d6ee', s: '#f2fbff' },
    },
    // (The yellowed paper of rooms that go on for ever.)
    backrooms: {
      label: 'Yellowed wallpaper', dew: true,
      tile: tile(8, 12, (x, y) => (x === 0 ? 'c' : (y % 6 === 1 && x === 4) || (y % 6 === 2 && (x === 3 || x === 5)) || (y % 6 === 3 && (x === 2 || x === 6)) ? 'b' : 'a')),
      colors: { a: '#c4ac4e', b: '#b39b40', c: '#baa246' },
    },
    bubbles: {
      label: 'Deep water', dew: true,
      tile: tile(16, 16, (x, y) => {
        const ring = (cx, cy, r) => Math.abs(Math.hypot(x - cx, y - cy) - r) < 0.6;
        if (has([[3, 3], [11, 10]], x, y)) return 'w';
        if (ring(4, 4, 2.2) || ring(12, 11, 1.6) || has([[9, 2], [1, 12], [14, 5]], x, y)) return 'b';
        return (y + Math.round(Math.sin((x / 16) * 2 * Math.PI) * 1.5) + 16) % 8 === 0 ? 'c' : 'a';
      }),
      colors: { a: '#1d4868', b: '#3f7ea6', c: '#235478', w: '#bfe6ff' },
    },
    hull: {
      label: 'Riveted steel', dew: true,
      tile: tile(16, 12, (x, y) => (x === 15 || y === 11 ? 'c' : x === 0 || y === 0 ? 'b' : has([[2, 2], [13, 2], [2, 9], [13, 9]], x, y) ? 'd' : has([[3, 3], [14, 3], [3, 10], [14, 10]], x, y) ? 'c' : 'a')),
      colors: { a: '#566170', b: '#667282', c: '#414a57', d: '#8793a3' },
    },
    pegboard: {
      label: 'Pegboard', dew: true,
      tile: tile(4, 4, (x, y) => (x === 1 && y === 1 ? 'b' : x === 2 && y === 1 ? 'c' : 'a')),
      colors: { a: '#a8845a', b: '#6e5234', c: '#b8946a' },
    },
    // (Fans of gold line on the dark.)
    deco: {
      label: 'Art deco', dew: true,
      tile: tile(12, 12, (x, y) => {
        const band = Math.floor(y / 6);
        const cy = band * 6 + 5.5;
        const d = Math.min(...(band ? [-0.5, 11.5] : [5.5]).map((cx) => Math.hypot(x - cx, y - cy)));
        return Math.abs(d - 5.6) < 0.45 ? 'g' : Math.abs(d - 3) < 0.5 ? 'b' : d < 0.8 ? 'g' : 'a';
      }),
      colors: { a: '#1f2a44', b: '#2c3a5c', g: '#a8883e' },
    },
    castle: {
      label: 'Castle stone', dew: true,
      tile: tile(16, 12, (x, y) => {
        const row = Math.floor(y / 4);
        const xx = (x + row * 5) % 16;
        if (y % 4 === 3 || xx % 8 === 7) return 'c';
        const block = row * 2 + Math.floor(xx / 8);
        return y % 4 === 0 ? 'b' : block % 3 === 1 ? 'd' : 'a';
      }),
      colors: { a: '#6a6a78', b: '#7a7a88', c: '#45454f', d: '#60606c' },
    },
  });

  // ---- Floors ----
  Object.assign(ROOM.floor, {
    ice: {
      label: 'Ice', dew: true,
      tile: tile(16, 8, (x, y) => (has([[2, 1], [3, 1], [4, 2], [5, 2], [11, 5], [12, 5], [13, 6]], x, y) ? 'w' : has([[9, 1], [10, 2], [10, 3], [11, 3], [1, 5], [2, 6], [3, 6]], x, y) ? 'c' : y === 0 ? 'b' : 'a')),
      colors: { a: '#a8d6ec', b: '#bfe4f4', c: '#86bcd8', w: '#f0fbff' },
    },
    dampcarpet: {
      label: 'Damp carpet', dew: true,
      tile: tile(8, 8, (x, y) => ((x * 3 + y * 5) % 7 === 0 ? 'b' : (x * 5 + y * 3) % 11 === 0 ? 'c' : 'a')),
      colors: { a: '#8f7f4c', b: '#827243', c: '#9a8a56' },
    },
    sand: {
      label: 'Seabed sand', dew: true,
      tile: tile(16, 8, (x, y) => (has([[12, 2]], x, y) ? 'w' : has([[4, 6], [13, 2]], x, y) ? 'c' : (y + Math.round(Math.sin((x / 16) * 2 * Math.PI) * 1.2) + 8) % 4 === 0 ? 'b' : 'a')),
      colors: { a: '#d6c088', b: '#c4ad74', c: '#b0905a', w: '#f6ecd0' },
    },
    moon: {
      label: 'Moon dust', dew: true,
      tile: tile(16, 8, (x, y) => (has([[3, 1], [4, 1], [5, 1], [11, 5], [12, 5]], x, y) ? 'c' : has([[2, 2], [6, 2], [3, 3], [4, 3], [5, 3], [10, 6], [11, 6], [12, 6], [13, 6]], x, y) ? 'b' : has([[8, 0], [14, 3], [0, 6]], x, y) ? 'd' : 'a')),
      colors: { a: '#8c8f9c', b: '#a3a6b2', c: '#6c6f7e', d: '#7e818f' },
    },
    concrete: {
      label: 'Concrete', dew: true,
      tile: tile(16, 8, (x, y) => (x === 15 || y === 7 ? 'c' : has([[3, 2], [9, 5], [12, 1], [6, 6]], x, y) ? 'b' : has([[4, 4], [11, 3]], x, y) ? 'd' : 'a')),
      colors: { a: '#73777f', b: '#7f838b', c: '#5c6068', d: '#696d75' },
    },
    plate: {
      label: 'Tread plate', dew: true,
      tile: tile(8, 8, (x, y) => (has([[1, 1], [2, 2], [5, 5], [6, 6]], x, y) ? 'b' : has([[6, 1], [5, 2], [2, 5], [1, 6]], x, y) ? 'c' : 'a')),
      colors: { a: '#5d6672', b: '#8a95a3', c: '#454d58' },
    },
    flagstone: {
      label: 'Flagstones', dew: true,
      tile: ['aaaaaaacbbbbbbbc', 'aaaaaaacbbbbbbbc', 'aaaaaaacbbbbbbbc', 'cccccccccccccccc', 'bbbcddddddddcaaa', 'bbbcddddddddcaaa', 'bbbcddddddddcaaa', 'cccccccccccccccc'],
      colors: { a: '#77727a', b: '#6a6670', c: '#4a4650', d: '#827d86' },
    },
  });

  // ---- Rugs ----
  // (A starfish: five arms out from its middle, seen from above it on the floor.)
  const starfish = () => tile(30, 10, (x, y) => {
    const dx = (x + 0.5 - 15) / 15;
    const dy = (y + 0.5 - 5.4) / 5.4;
    const d = Math.hypot(dx, dy);
    const edge = 0.3 + 0.7 * Math.abs(Math.cos((Math.atan2(dy, dx) + Math.PI / 2) * 2.5)) ** 1.6;
    if (d > edge) return '.';
    return d < 0.14 ? 'c' : d > edge - 0.16 ? 'b' : (x + y * 3) % 5 === 0 ? 'c' : 'a';
  });
  const hazardMat = () => tile(34, 9, (x, y) => (x < 2 || x > 31 || y < 2 || y > 6 ? ((x + y) % 6 < 3 ? 'y' : 'n') : (x + y) % 4 === 0 ? 'd' : 'r'));
  const tatami = () => tile(34, 9, (x, y) => (y === 0 || y === 8 || x < 2 || x > 31 || x === 16 || x === 17 ? 'g' : y % 2 ? 'a' : 'b'));
  const compassRug = () => {
    const g = grid(36, 10);
    g.put(0, 0, oval(36, 10, 'aaaaaaaba'));
    for (let i = 0; i <= 13; i++) {
      const t = Math.round((1 - i / 13) * 1.6);
      for (let j = -t; j <= t; j++) g.set(17 - i, 4.5 + j, 'w').set(18 + i, 4.5 + j, 'r');
    }
    for (let j = 0; j <= 3; j++) for (let i = -Math.floor((3 - j) / 2); i <= Math.floor((3 - j) / 2) + 1; i++) g.set(17 + i, 3 - j, 'r').set(17 + i, 6 + j, 'w');
    g.rect(17, 4, 2, 2, 'y');
    return g.rows();
  };
  const pond = () => {
    const g = grid(34, 9);
    g.put(0, 0, oval(34, 9, 'aaaaaaab'));
    g.line(6, 4, 13, 2, 'w').line(14, 2, 19, 3, 'w').line(17, 6, 26, 5, 'w').line(9, 6, 13, 6, 'c').line(22, 3, 27, 3, 'c');
    return g.rows();
  };
  Object.assign(ROOM.rug, {
    pond: { label: 'Frozen pond', dew: true, bare: true, rows: pond(), colors: { a: '#a9d8ee', b: '#e6f7ff', w: '#f6fdff', c: '#86bfdc' } },
    starfish: { label: 'Starfish', dew: true, rows: starfish(), colors: { a: '#e8703a', b: '#c9542a', c: '#ffb078' } },
    orbit: { label: 'Orbit rug', dew: true, rows: oval(36, 10, 'ysnnrnnnrnnb'), colors: { n: '#1a1f44', r: '#5a6ad0', y: '#ffd866', s: '#ff9a4a', b: '#3a3f7a' } },
    hazard: { label: 'Hazard mat', dew: true, rows: hazardMat(), colors: { y: '#f2c230', n: '#26262e', r: '#3a3d46', d: '#454852' } },
    tatami: { label: 'Tatami', dew: true, rows: tatami(), colors: { a: '#c9bc7a', b: '#bcae6c', g: '#3d5a40' } },
    compass: { label: 'Compass rose', dew: true, rows: compassRug(), colors: { a: '#22365e', b: '#d9c48a', r: '#c9483a', w: '#f2ecd8', y: '#e3b84a' } },
  });
  Object.assign(TINTS, {
    'rug:starfish': [{ name: 'Rose', a: '#e0607a', b: '#b8405a', c: '#ffa8b8' }, { name: 'Violet', a: '#8a5cd0', b: '#6a3fa8', c: '#c4a8ff' }, { name: 'Sand', a: '#d6b878', b: '#b0905a', c: '#f2e2b8' }],
    'rug:tatami': [{ name: 'Navy edge', g: '#22365e' }, { name: 'Black edge', g: '#26262e' }, { name: 'Plum edge', g: '#5e2f55' }],
    'rug:hazard': [{ name: 'Red', y: '#e0483a' }, { name: 'White', y: '#ececec' }, { name: 'Green', y: '#5ac86a' }],
  });

  // ---- The light ----
  Object.assign(ROOM.light, {
    icy: { label: 'Glacier', dew: true, dim: '#a4c6e6', window: '#f0fbff', glow: '#d8f2ff', reach: 32 },
    hum: { label: 'Fluorescent hum', dew: true, dim: '#d2cf94', window: '#f6f4c8', glow: '#fbf8d0', reach: 34, flicker: true },
    deep: { label: 'Deep sea', dew: true, dim: '#2f5f80', window: '#7fe0e0', glow: '#9ff0e8', reach: 28 },
    starlight: { label: 'Starlight', dew: true, dim: '#3a3a6c', window: '#d8d0ff', glow: '#e8e0ff', reach: 30 },
    ember: { label: 'Embers', dew: true, dim: '#7a3c30', window: '#ffb080', glow: '#ff9a5a', reach: 26, flicker: true },
  });

  // ---- Out of the window ----
  const EARTH = (x, y) => Math.hypot(x - 12.5, y - 4) < 3.3;
  Object.assign(ROOM.sky, {
    blizzard: {
      label: 'Blizzard', dew: true,
      scene: sky((x, y) => (y >= 9 - Math.round(Math.sin(x / 3) + 1) ? 'w' : y >= 7 - Math.round(Math.cos(x / 4) * 1.2) ? 'h' : y < 4 ? 'a' : 'b')),
      colors: { a: '#4a5674', b: '#5d6a88', h: '#8794ae', w: '#dfe8f4' },
      fx: 'snow', tile: dots(12, 12, [[2, 1], [8, 4], [5, 7], [10, 9], [1, 10], [6, 0], [0, 5], [4, 3], [9, 1], [7, 10], [11, 6], [3, 8], [6, 5], [10, 2]], 'w'), tileColors: { w: '#ffffff' },
    },
    // (Rooms, and rooms beyond them, all the same.)
    hallway: {
      label: 'Endless hallway', dew: true,
      scene: sky((x, y) => {
        const ax = Math.abs(x - 8.5) / 9;
        const ay = Math.abs(y - 5) / 5.5;
        const d = Math.max(ax, ay);
        if (d < 0.2) return 'n';
        const ring = Math.floor(d * 5);
        if (ay >= ax) return y < 5 ? (x % 4 === 1 && ring % 2 ? 'l' : 'c') : 'f';
        return ring % 2 ? 'a' : 'b';
      }),
      colors: { a: '#c4ac4e', b: '#b0983e', c: '#d8d2b0', l: '#fffbe0', f: '#8f7f4c', n: '#3a3320' },
    },
    sea: {
      label: 'Under the sea', dew: true,
      scene: sky((x, y) => (y >= 10 - (x % 7 === 3 ? 1 : 0) ? 's' : has([[3, 9], [3, 8], [4, 7], [3, 6], [13, 9], [14, 8], [13, 7], [14, 6], [14, 5]], x, y) ? 'g' : has([[9, 9], [8, 9], [9, 8]], x, y) ? 'r' : (x + y) % 9 === 0 && y < 5 ? 'l' : y < 3 ? 'a' : y < 7 ? 'b' : 'c')),
      colors: { a: '#3f9ad0', b: '#2f7fb8', c: '#236898', l: '#6ab8e6', s: '#d6c088', g: '#3f9e57', r: '#e8607a' },
      fx: 'drift',
      tile: ['........................', '........................', '...o.oo.................', '...ooooO................', '...o.oo.................', '........................', '........................', '................y.yy....', '................yyyY....', '................y.yy....', '........................'],
      tileColors: { o: '#ff9a3d', O: '#2a1f33', y: '#ffe066', Y: '#2a1f33' },
    },
    earthrise: {
      label: 'Earthrise', dew: true,
      scene: sky((x, y) => (y >= 9 - (x > 3 && x < 9 ? 1 : 0) ? (has([[2, 10], [3, 10], [11, 9], [12, 9], [15, 10]], x, y) ? 'D' : 'd') : EARTH(x, y) ? (x - y > 9 ? 'e' : has([[11, 3], [12, 3], [12, 4], [13, 5], [11, 5], [10, 4], [13, 2]], x, y) ? 'g' : (x + y) % 5 === 0 ? 'w' : 'u') : has([[2, 1], [6, 4], [16, 7], [4, 7], [8, 1], [17, 1]], x, y) ? 's' : 'n')),
      colors: { n: '#0a0c1e', s: '#9fb0e8', u: '#3a7bd5', g: '#4fae6a', w: '#eaf4ff', e: '#1d3f78', d: '#8c8f9c', D: '#6c6f7e' },
      fx: 'twinkle', tile: dots(18, 11, [[1, 3], [9, 6], [15, 0], [5, 0]], 't'), tileColors: { t: '#ffffff' },
    },
    dunes: {
      label: 'Dunes', dew: true,
      scene: sky((x, y) => (Math.hypot(x - 13, y - 2.5) < 1.8 ? 'y' : y >= 8 - Math.round(Math.sin((x + 2) / 3.2) * 1.4) ? (y >= 9 - Math.round(Math.sin((x + 8) / 2.6) * 1.2) ? 'D' : 'd') : y < 3 ? 'a' : y < 6 ? 'b' : 'c')),
      colors: { a: '#f2b880', b: '#f6cc98', c: '#fae0b4', y: '#fff6d0', d: '#d99a52', D: '#b87a3a' },
    },
    volcano: {
      label: 'Volcano', dew: true,
      scene: sky((x, y) => {
        const slope = Math.abs(x - 8.5) * 0.85 + 3;
        if (y >= slope) return (x === 8 && y < 7) || (x === 9 && y >= 4 && y < 9) || (x === 10 && y >= 8) ? 'l' : y >= 10 ? 'D' : 'd';
        if (y === 2 && (x === 8 || x === 9)) return 'l';
        if (y < 2 && Math.abs(x - 9 - y) < 2) return 's';
        return y < 4 ? 'a' : y < 7 ? 'b' : 'c';
      }),
      colors: { a: '#2a1420', b: '#4a1c22', c: '#7a2a22', d: '#2e2428', D: '#1f181c', l: '#ff8a2a', s: '#5a4a50' },
      fx: 'snow', tile: dots(12, 12, [[2, 1], [8, 4], [5, 8], [10, 10]], 'e'), tileColors: { e: '#ffb04a' },
    },
  });

  // (Its lit side and its dark: whatever of `from` has nothing to its right or under it goes `to`.)
  const shade = (g, from, to) => {
    const dark = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) === from && (!g.get(x + 1, y) || g.get(x + 1, y) === '.' || !g.get(x, y + 1) || g.get(x, y + 1) === '.')) dark.push([x, y]);
    for (const [x, y] of dark) g.set(x, y, to);
    return g;
  };
  // (Little letters, three wide and five tall, for signs.)
  const FONT = { E: ['www', 'w..', 'ww.', 'w..', 'www'], X: ['w.w', 'w.w', '.w.', 'w.w', 'w.w'], I: ['w', 'w', 'w', 'w', 'w'], T: ['www', '.w.', '.w.', '.w.', '.w.'] };

  // ---- On the wall ----
  const snowflake = () => {
    const g = grid(13, 13);
    g.line(6, 0, 6, 12, 'w').line(0, 6, 12, 6, 'w').line(2, 2, 10, 10, 'w').line(2, 10, 10, 2, 'w');
    for (const [x, y] of [[5, 1], [7, 1], [5, 11], [7, 11], [1, 5], [1, 7], [11, 5], [11, 7], [4, 2], [2, 4], [8, 2], [10, 4], [2, 8], [4, 10], [10, 8], [8, 10]]) g.set(x, y, 'c');
    return g.set(6, 6, 'c').rows();
  };
  const skis = () => {
    const g = grid(15, 15);
    for (const [a, c] of [[1, 'r'], [-1, 'u']]) {
      for (let i = 1; i <= 13; i++) {
        const x = a > 0 ? i : 14 - i;
        g.set(x, 14 - i, c).set(x + a, 14 - i, c);
      }
      g.set(a > 0 ? 14 : 0, 0, c);
    }
    return g.set(7, 7, 'm').set(6, 7, 'm').set(8, 7, 'm').set(7, 6, 'm').set(7, 8, 'm').rows();
  };
  const exitSign = () => {
    const g = grid(17, 9, 'g');
    g.rect(0, 0, 17, 1, 'G').rect(0, 8, 17, 1, 'G').rect(0, 0, 1, 9, 'G').rect(16, 0, 1, 9, 'G');
    g.put(2, 2, FONT.E).put(6, 2, FONT.X).put(10, 2, FONT.I).put(12, 2, FONT.T);
    return g.rows();
  };
  const vent = () => tile(16, 10, (x, y) => (x === 0 || x === 15 || y === 0 || y === 9 ? 'm' : has([[1, 1], [14, 1], [1, 8], [14, 8]], x, y) ? 'M' : x < 2 || x > 13 ? 'm' : y % 2 ? 'd' : 'M'));
  // (A fish going by outside, and bubbles going up: `i` of 8.)
  const porthole = (i) => {
    const g = grid(15, 15);
    g.disc(7, 7, 7.2, 'b').disc(7, 7, 5.6, 'B').disc(7, 7, 4.7, 'a');
    for (const [x, y] of [[7, 0], [7, 14], [0, 7], [14, 7], [2, 2], [12, 2], [2, 12], [12, 12]]) g.set(x, y, 'y');
    for (let x = 3; x <= 11; x++) g.over(x, 4 + ((x + i) % 4 === 0 ? 1 : 0), 'l', 'a');
    const fx = -3 + i * 2.6;
    const fy = 7 + (i % 4 === 1 ? 1 : i % 4 === 3 ? -1 : 0);
    ['o.oo.', 'ooooe', 'o.oo.'].forEach((row, j) => [...row].forEach((c, n) => { if (c !== '.') g.over(fx + n - 4, fy + j - 1, c, 'al'); }));
    g.over(4, 11 - (i % 4) * 2, 'w', 'al').over(10, 10 - ((i + 2) % 4) * 2, 'w', 'al');
    return g.rows();
  };
  const shipWheel = () => {
    const g = grid(17, 17);
    for (let a = 0; a < 8; a++) g.line(8, 8, 8 + Math.cos((a * Math.PI) / 4) * 8, 8 + Math.sin((a * Math.PI) / 4) * 8, 'b');
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) if (Math.abs(Math.hypot(x - 8, y - 8) - 5) < 0.75) g.set(x, y, 'B');
    return g.disc(8, 8, 1.5, 'y').rows();
  };
  const swords = () => {
    const g = grid(15, 15);
    for (const a of [1, -1]) {
      const X = (x) => (a > 0 ? x : 14 - x);
      g.line(X(1), 1, X(10), 10, 's');
      for (let i = 1; i <= 9; i++) g.set(X(i + 1), i, 'S');
      g.line(X(8), 12, X(12), 8, 'y').set(X(11), 11, 'h').set(X(12), 12, 'h').set(X(13), 13, 'y');
    }
    return g.rows();
  };
  const starmap = () => {
    const g = grid(18, 13, 'n');
    g.rect(0, 0, 18, 1, 'f').rect(0, 12, 18, 1, 'f').rect(0, 0, 1, 13, 'f').rect(17, 0, 1, 13, 'f');
    const C = [[3, 3], [6, 2], [8, 5], [12, 4], [14, 7], [10, 9], [5, 9]];
    C.forEach(([x, y], i) => { if (i) g.line(C[i - 1][0], C[i - 1][1], x, y, 'l'); });
    for (const [x, y] of C) g.set(x, y, 's');
    for (const [x, y] of [[2, 7], [15, 2], [13, 10], [8, 10], [3, 10], [10, 2]]) g.set(x, y, 'd');
    return g.rows();
  };
  const banner = () => {
    const g = grid(11, 17);
    g.rect(0, 0, 11, 1, 'p').rect(1, 1, 9, 12, 'r');
    for (let j = 0; j < 4; j++) g.rect(1, 13 + j, 4 - j, 1, 'r').rect(6 + j, 13 + j, 4 - j, 1, 'r');
    g.rect(1, 1, 1, 12, 'R').rect(9, 1, 1, 12, 'R').rect(1, 2, 9, 1, 'y');
    g.put(3, 5, ['y.y.y', 'yyyyy', 'yyyyy', '.yyy.']);
    return g.rows();
  };
  Object.assign(ROOM.hang, {
    snowflake: { label: 'Snowflake', dew: true, rows: snowflake(), colors: { w: '#f2fbff', c: '#a9d6ee' } },
    skis: { label: 'Crossed skis', dew: true, rows: skis(), colors: { r: '#e0483a', u: '#3a7bd5', m: '#8a8fa3' } },
    // (Lit, and not quite steady.)
    exit: { label: 'Exit sign', dew: true, glow: '#7dffa0', flicker: true, rows: exitSign(), colors: { g: '#1f8a4a', G: '#166a38', w: '#eafff0' } },
    vent: { label: 'Air vent', dew: true, rows: vent(), colors: { m: '#9aa0ae', M: '#b8bec9', d: '#3a3d46' } },
    porthole: {
      label: 'Porthole', dew: true, pace: 420, frames: turns(8, (i) => porthole(i)),
      colors: { b: '#b8862e', B: '#e3b84a', y: '#fff0b0', a: '#2f7fb8', l: '#4a9ad0', o: '#ff9a3d', e: '#2a1f33', w: '#d8f2ff' },
    },
    anchor: {
      label: 'Anchor', dew: true,
      rows: ['....mmm....', '....m.m....', '....mmm....', '.....m.....', '..mmmmmmm..', '.....m.....', '.....m.....', '.....m.....', 'M....m....M', 'mM...m...Mm', '.mm..m..mm.', '..mmmmmmm..', '...mmmmm...', '.....m.....'],
      colors: { m: '#5d6672', M: '#8a95a3' },
    },
    wheel: { label: "Ship's wheel", dew: true, rows: shipWheel(), colors: { b: '#8a5c3a', B: '#6b4a32', y: '#e3b84a' } },
    tools: {
      label: 'Tool rack', dew: true,
      rows: ['bbbbbbbbbbbbbbbbbb', 'bcbbbbbbbbbbbbbbcb', 'bbmmmmbbmbmbbbrbbb', 'bbmmmmbbmmmbbbrbbb', 'bbbhbbbbbmbbbbrbbb', 'bbbhbbbbbmbbbbmbbb', 'bbbhbbbbbmbbbbmbbb', 'bbbhbbbbbmbbbbmbbb', 'bbbhbbbbmmmbbbmbbb', 'bcbbbbbbmbmbbbbbcb', 'bbbbbbbbbbbbbbbbbb'],
      colors: { b: '#b8946a', c: '#6e5234', m: '#8a8fa3', h: '#6b4a32', r: '#e0483a' },
    },
    swords: { label: 'Crossed swords', dew: true, rows: swords(), colors: { s: '#c8ced8', S: '#eef2f8', y: '#e3b84a', h: '#6b4a32' } },
    starmap: { label: 'Star chart', dew: true, rows: starmap(), colors: { n: '#141c44', f: '#8a5c3a', l: '#3a4a8a', s: '#fff6c0', d: '#7a8ad0' } },
    banner: { label: 'Banner', dew: true, rows: banner(), colors: { p: '#6b4a32', r: '#b8323a', R: '#8a242c', y: '#e3b84a' } },
  });
  Object.assign(TINTS, {
    'hang:banner': [{ name: 'Royal blue', r: '#2f4fa8', R: '#223a80' }, { name: 'Forest', r: '#2f6a3a', R: '#224f2b' }, { name: 'Black', r: '#2e2e38', R: '#1f1f27', y: '#c8ced8' }],
    'hang:exit': [{ name: 'Red', g: '#b8323a', G: '#8a242c', w: '#ffecec', glow: '#ff8a8a' }, { name: 'Blue', g: '#2f5fc0', G: '#22469a', w: '#eaf2ff', glow: '#8ab4ff' }, { name: 'Amber', g: '#c9861a', G: '#a06a12', w: '#fff6dc', glow: '#ffcf7a' }],
    'hang:snowflake': [{ name: 'Gold', w: '#ffe9a0', c: '#e3b84a' }, { name: 'Rose', w: '#ffe0ec', c: '#f09ab8' }, { name: 'Mint', w: '#e0fff0', c: '#8ad8b0' }],
    'hang:starmap': [{ name: 'Parchment', n: '#e6d8b0', l: '#b0986a', s: '#5a3a2a', d: '#8a6a4a' }, { name: 'Blueprint', n: '#2f5fc0', l: '#6a94e8', s: '#ffffff', d: '#b8d0ff' }, { name: 'Black', n: '#16161e', l: '#3a3a4a', s: '#ffffff', d: '#8a8a9a' }],
  });

  // ---- On the floor ----
  const BED = ['.....pppppppppppp.....', '...ppbbbbbbbbbbbbpp...', '..pbbbbbbbbbbbbbbbbp..', '.pbbbbbbbbbbbbbbbbbbp.', 'ppbbbbbbbbbbbbbbbbbbpp', 'pppbbbbbbbbbbbbbbbbppp', 'PpppppbbbbbbbbbbpppppP', '.PPPppppppppppppppPPP.', '...PPPPPPPPPPPPPPPP...'];
  const snowman = () => {
    const g = grid(15, 19);
    g.disc(7, 14, 4.3, 'w').disc(7, 8.5, 3.2, 'w').disc(7, 4.5, 2.4, 'w');
    shade(g, 'w', 's');
    g.rect(5, 0, 5, 2, 'n').rect(4, 2, 7, 1, 'n').rect(5, 1, 5, 1, 'r');
    g.set(6, 4, 'n').set(8, 4, 'n').set(7, 5, 'o').set(8, 5, 'o');
    g.rect(5, 6, 5, 1, 'r').rect(9, 7, 1, 2, 'r');
    g.set(7, 9, 'n').set(7, 11, 'n').set(7, 14, 'n');
    g.line(3, 9, 0, 7, 't').line(11, 9, 14, 7, 't').set(1, 6, 't').set(13, 6, 't');
    return g.rows();
  };
  // (A light going down its buttons: `i` of 4.)
  const vending = (i) => {
    const g = grid(12, 21, 'r');
    g.rect(0, 0, 12, 1, 'R').rect(1, 1, 7, 14, 'g');
    [2, 5, 8, 11].forEach((y, n) => {
      for (const x of [2, 4, 6]) g.rect(x, y, 1, 2, 'aue'[(n + x / 2) % 3]);
      g.rect(1, y + 2, 7, 1, 'm');
    });
    g.rect(9, 2, 2, 3, 'w');
    for (let n = 0; n < 4; n++) g.set(9, 6 + n * 2, n === i ? 'y' : 'd').set(10, 6 + n * 2, n === (i + 2) % 4 ? 'y' : 'd');
    g.rect(9, 14, 2, 1, 'n').rect(2, 16, 8, 3, 'n').rect(3, 17, 6, 1, 'd');
    g.rect(0, 20, 12, 1, '.').rect(1, 20, 2, 1, 'n').rect(9, 20, 2, 1, 'n');
    return g.rows();
  };
  // (A bubble going up through its bottle: `i` of 4.)
  const cooler = (i) => {
    const g = grid(8, 19);
    g.rect(2, 0, 4, 1, 'a').rect(1, 1, 6, 6, 'a').rect(2, 7, 4, 1, 'a').rect(1, 1, 1, 6, 'A');
    g.rect(1, 1, 6, 1, 'l');
    g.set(3 + (i % 2) * 2, 6 - i * 1.5, 'l');
    if (i > 1) g.set(4, 9 - i * 1.5 + 1, 'l');
    g.rect(0, 8, 8, 10, 'w').rect(0, 8, 8, 1, 'W').rect(7, 9, 1, 9, 'W');
    g.set(2, 10, 'u').set(5, 10, 'r').rect(2, 12, 4, 2, 'd').rect(0, 18, 2, 1, 'd').rect(6, 18, 2, 1, 'd');
    return g.rows();
  };
  // (Its gold catching the light, here and there: `i` of 4.)
  const chest = (i) => {
    const g = grid(16, 13);
    g.rect(1, 0, 14, 4, 'b').rect(1, 0, 14, 1, 'B').rect(2, 1, 12, 3, 'n');
    g.rect(3, 3, 10, 2, 'y').rect(4, 2, 4, 1, 'y').rect(9, 2, 3, 1, 'y').set(6, 1, 'y').set(10, 1, 'y');
    g.rect(0, 5, 16, 8, 'b').rect(0, 5, 16, 1, 'B').rect(0, 12, 16, 1, 'd');
    g.rect(2, 5, 2, 8, 'Y').rect(12, 5, 2, 8, 'Y').rect(7, 7, 2, 3, 'Y').set(7, 8, 'n');
    const [x, y] = [[5, 2], [10, 3], [7, 3], [11, 2]][i];
    g.set(x, y, 'W');
    if (i % 2 === 0) g.set(x, y - 1, 'W').set(x - 1, y, 'W').set(x + 1, y, 'W');
    return g.rows();
  };
  // (Swaying in the water, each stalk after the last: `t`, how far through.)
  const kelp = (t) => {
    const g = grid(13, 21);
    [[3, 19, 0], [6, 16, 1.3], [9, 20, 2.6]].forEach(([bx, len, off]) => {
      for (let n = 0; n < len; n++) {
        const y = 19 - n;
        const x = bx + Math.sin(t * 2 * Math.PI + off + n / 3.2) * (n / len) * 2.2;
        g.set(x, y, n % 4 === 2 ? 'G' : 'g');
        if (n % 4 === 2 && n > 2) g.set(x + (Math.floor(n / 4) % 2 ? 1 : -1), y, 'G');
      }
    });
    return g.rect(1, 19, 11, 2, 's').rect(2, 18, 3, 1, 's').rect(8, 18, 2, 1, 's').rect(1, 20, 11, 1, 'S').rows();
  };
  // (Its planets going round its sun, the near one twice for the far one's once.)
  const orrery = (t) => {
    const g = grid(19, 19);
    g.rect(9, 8, 1, 8, 'm').rect(6, 16, 7, 1, 'b').rect(5, 17, 9, 2, 'B').rect(5, 18, 9, 1, 'b');
    const far = [9 + Math.cos(t * 2 * Math.PI) * 8, 6 + Math.sin(t * 2 * Math.PI) * 3];
    const near = [9 + Math.cos(t * 4 * Math.PI + 2) * 4.4, 6 + Math.sin(t * 4 * Math.PI + 2) * 1.8];
    const front = (p) => p[1] >= 6;
    const planets = () => {
      g.set(near[0], near[1], 'o');
      g.set(far[0], far[1], 'u').set(far[0] + 1, far[1], 'u').set(far[0], far[1] - 1, 'u').set(far[0] + 1, far[1] - 1, 'U');
    };
    g.line(9, 6, near[0], near[1], 'm').line(9, 6, far[0], far[1], 'm');
    if (!front(near) && !front(far)) planets();
    g.disc(9, 6, 1.6, 'y').set(9, 5, 'Y');
    if (front(near) || front(far)) planets();
    return g.rows();
  };
  const workbench = () => {
    const g = grid(22, 14);
    g.rect(0, 4, 22, 2, 'b').rect(0, 4, 22, 1, 'B').rect(1, 6, 2, 8, 'd').rect(19, 6, 2, 8, 'd').rect(3, 11, 16, 1, 'd');
    g.rect(8, 6, 6, 3, 'c').rect(10, 7, 2, 1, 'y');
    g.rect(2, 1, 5, 3, 'm').rect(3, 0, 1, 1, 'm').rect(5, 0, 1, 1, 'm').rect(4, 2, 1, 1, 'M').rect(7, 2, 2, 1, 'M');
    g.rect(15, 2, 3, 2, 'r').rect(18, 2, 1, 1, 'r').rect(11, 3, 3, 1, 'y');
    g.rect(5, 8, 5, 3, 'r').rect(6, 7, 3, 1, 'M').rect(13, 9, 4, 2, 'c');
    return g.rows();
  };
  // (Its pendulum going over and back: `off`, how far to one side.)
  const grandClock = (off) => {
    const g = grid(11, 27);
    g.rect(0, 2, 11, 25, 'b').rect(1, 0, 9, 2, 'B').rect(3, 0, 5, 1, '.').rect(4, 0, 3, 1, 'B').rect(0, 24, 11, 3, 'B').rect(0, 10, 11, 1, 'B');
    g.disc(5, 6, 3.3, 'w').set(5, 6, 'n').set(5, 5, 'n').set(6, 6, 'n');
    g.rect(3, 12, 5, 11, 'g');
    g.line(5, 12, 5 + off, 19, 'y').disc(5 + off, 20, 1, 'y');
    g.rect(1, 3, 1, 21, 'd').rect(9, 3, 1, 21, 'd');
    return g.rows();
  };
  // (Its fire, never the same twice running: `i` of 6.)
  const fireplace = (i) => {
    const g = grid(22, 19);
    g.rect(0, 0, 22, 2, 'b').rect(0, 0, 22, 1, 'B').rect(1, 2, 20, 17, 's');
    for (let y = 2; y < 19; y++) for (let x = 1; x < 21; x++) if (y % 4 === 1 || (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0) g.over(x, y, 'S', 's');
    g.rect(5, 7, 12, 12, 'n').rect(6, 6, 10, 1, 'n');
    g.rect(6, 17, 10, 1, 'd').rect(7, 16, 3, 1, 'd').rect(11, 16, 4, 1, 'D');
    for (let x = 6; x <= 15; x++) {
      const mid = 1 - Math.abs(x - 10.5) / 6;
      const tall = Math.round(mid * 5 + ((x * 7 + i * 5 + ((x * i) % 3)) % 4));
      for (let n = 0; n < tall; n++) g.set(x, 15 - n, n < tall * 0.34 ? 'y' : n < tall * 0.7 ? 'F' : 'f');
    }
    g.set(7 + ((i * 3) % 8), 8 + (i % 3), 'F');
    return g.rows();
  };
  // (Snow on its screen: `i` of 6.)
  const crt = (i) => {
    const g = grid(16, 17);
    g.line(8, 3, 4, 0, 'm').line(8, 3, 12, 0, 'm');
    g.rect(0, 3, 16, 11, 'b').rect(0, 3, 16, 1, 'B').rect(1, 5, 11, 8, 'n');
    for (let y = 5; y < 13; y++) for (let x = 1; x < 12; x++) g.set(x, y, 'sSw'[(x * 7 + y * 13 + i * 11 + ((x * y + i) % 5)) % 3]);
    g.rect(1, 5 + ((i * 3) % 8), 11, 1, 'w');
    g.set(13, 6, 'y').set(14, 6, 'y').set(13, 8, 'm').set(14, 8, 'm').rect(13, 10, 2, 2, 'd');
    g.rect(2, 14, 2, 1, 'd').rect(12, 14, 2, 1, 'd').rect(1, 15, 14, 2, 'c').rect(1, 15, 14, 1, 'C');
    return g.rows();
  };
  // (Its snow coming down, round and round: `i` of 6.)
  const snowglobe = (i) => {
    const g = grid(13, 14);
    g.disc(6, 5.5, 5.6, 'a').rect(1, 9, 11, 2, 'w');
    g.put(5, 4, ['.g.', 'ggg', '.g.', 'ggg', '.t.']);
    for (const [x, y] of [[3, 1], [8, 2], [5, 0], [10, 4], [2, 5], [7, 6]]) g.over(x + (i % 2), 1 + ((y + i * 1.5) % 8), 'W', 'a');
    g.set(3, 3, 'l').set(2, 4, 'l');
    g.rect(1, 11, 11, 1, 'B').rect(0, 12, 13, 2, 'b');
    return g.rows();
  };
  const divingHelmet = () => {
    const g = grid(15, 14);
    g.disc(7, 6, 6.2, 'b').rect(1, 10, 13, 4, 'B').rect(1, 13, 13, 1, 'd').rect(1, 10, 13, 1, 'd');
    g.disc(7, 6, 3.3, 'B').disc(7, 6, 2.4, 'g').set(6, 5, 'w');
    g.rect(0, 5, 2, 3, 'B').rect(13, 5, 2, 3, 'B').set(0, 6, 'g').set(14, 6, 'g').rect(6, 0, 3, 1, 'B');
    for (const x of [3, 7, 11]) g.set(x, 12, 'y');
    return g.rows();
  };
  const cabinet = () => {
    const g = grid(10, 18, 'm');
    g.rect(0, 0, 10, 1, 'M').rect(9, 1, 1, 17, 'd');
    for (const y of [1, 6, 11]) g.rect(1, y, 8, 4, 'M').rect(1, y + 3, 8, 1, 'm').rect(4, y + 1, 2, 1, 'd').set(7, y + 1, 'w');
    return g.rect(0, 17, 10, 1, 'd').rows();
  };
  Object.assign(ROOM.stand, {
    snowman: { label: 'Snowman', dew: true, rows: snowman(), colors: { w: '#f4fbff', s: '#bcd6ea', n: '#2e2e38', r: '#d9483a', o: '#ff9a3d', t: '#6b4a32' } },
    crystal: {
      label: 'Ice crystal', dew: true, glow: '#bfeaff',
      rows: ['.....a.....', '....aAa....', '....aAa....', '.a..aAac...', 'aAa.aAac...', 'aAa.aAac.a.', 'aAa.aAacaAa', 'aAaaaAacaAa', 'aAacaAacaAc', 'aAacaAacaAc', '.ccccccccc.'],
      colors: { a: '#bfeaff', A: '#f2fbff', c: '#7fb8dc' },
    },
    icebed: { label: 'Snowdrift bed', dew: true, nap: true, out: 3, rows: BED, colors: { p: '#bfe0f2', b: '#f4fbff', P: '#8fbcd8' } },
    moonbed: { label: 'Crater bed', dew: true, nap: true, out: 3, rows: BED, colors: { p: '#8c8f9c', b: '#5a5d6c', P: '#6c6f7e' } },
    vending: {
      label: 'Vending machine', dew: true, glow: '#9fd8ff', emit: 'wy', lightY: 0.3, pace: 500, frames: turns(4, (i) => vending(i)),
      colors: { r: '#c9483a', R: '#e0685a', g: '#1f2a3a', a: '#ff9a3d', u: '#4a8ae0', e: '#5ac86a', m: '#8a8fa3', w: '#bfeaff', d: '#5a2a24', y: '#ffe066', n: '#26262e' },
    },
    cooler: {
      label: 'Water cooler', dew: true, pace: 450, frames: turns(4, (i) => cooler(i)),
      colors: { a: '#7fc4ee', A: '#a8dcf8', l: '#d8f2ff', w: '#e8eaf0', W: '#c3c8d2', u: '#4a8ae0', r: '#e0483a', d: '#5d6672' },
    },
    wetfloor: {
      label: 'Wet floor sign', dew: true,
      rows: ['...yyy...', '...yYy...', '..yyyyy..', '..yynyy..', '..yynyy..', '.yyynyyy.', '.yyynyyy.', '.yyyyyyy.', 'yyyynyyyy', 'yyyyyyyyy', 'yy.....yy', 'yy.....yy'],
      colors: { y: '#f2c230', Y: '#c9961a', n: '#26262e' },
    },
    cabinet: { label: 'Filing cabinet', dew: true, rows: cabinet(), colors: { m: '#8a8fa3', M: '#a3a8b8', d: '#5d6272', w: '#f2f2f2' } },
    crt: {
      label: 'Old TV', dew: true, glow: '#cfe0ff', emit: 'sSw', lightY: 0.5, pace: 140, frames: turns(6, (i) => crt(i)),
      colors: { b: '#6b4a32', B: '#8a5f3d', n: '#16161e', s: '#3a3d46', S: '#8a8fa3', w: '#e8eaf0', y: '#e3b84a', m: '#8a8fa3', d: '#3a2a22', c: '#5a4632', C: '#6e583e' },
    },
    chest: {
      label: 'Treasure chest', dew: true, glow: '#ffe066', emit: 'yW', lightY: 0.2, pace: 380, frames: turns(4, (i) => chest(i)),
      colors: { b: '#8a5c3a', B: '#a8744a', d: '#5a3a24', n: '#2a1a12', y: '#ffcf3a', Y: '#d9a13a', W: '#ffffff' },
    },
    coral: {
      label: 'Coral', dew: true,
      rows: ['..p.....p....', '..p..p..p..p.', 'p.pp.p.pp..p.', 'p..p.ppp..pp.', 'pp.pp.p..pp..', '.pp.ppp.pp...', '..ppPpppp....', '...pPPpp.....', '....pPp......', '...ssPsss....', '..sssssssss..'],
      colors: { p: '#ff7a9a', P: '#d9547a', s: '#8a8fa3' },
    },
    kelp: { label: 'Kelp', dew: true, pace: 260, frames: turns(8, (i, t) => kelp(t)), colors: { g: '#3f9e57', G: '#6ad07a', s: '#8a8fa3', S: '#6c7080' } },
    helmet: { label: "Diver's helmet", dew: true, rows: divingHelmet(), colors: { b: '#c9902e', B: '#e3b84a', d: '#8a5c1a', g: '#1f3a5a', w: '#bfe6ff', y: '#fff0b0' } },
    orrery: {
      label: 'Orrery', dew: true, glow: '#ffd866', emit: 'yY', lightY: 0.3, pace: 200, frames: turns(12, (i, t) => orrery(t)),
      colors: { m: '#b8862e', b: '#8a5c1a', B: '#c9902e', y: '#ffd866', Y: '#fff6c0', o: '#ff7a4a', u: '#4a8ae0', U: '#a8d0ff' },
    },
    rocket: {
      label: 'Model rocket', dew: true,
      rows: ['....r....', '...rrr...', '...rrr...', '..wwwww..', '..wwwwW..', '..wuuwW..', '..wuuwW..', '..wwwwW..', '..wwwwW..', '..rrrrr..', '..wwwwW..', '.rwwwwWr.', 'rrwwwwWrr', 'rr.nnn.rr', 'r..nnn..r', '...mmm...', '..mmmmm..'],
      colors: { r: '#e0483a', w: '#f2f2f2', W: '#c3c8d2', u: '#4a8ae0', n: '#3a3d46', m: '#8a8fa3' },
    },
    workbench: { label: 'Workbench', dew: true, rows: workbench(), colors: { b: '#a8744a', B: '#c9955f', d: '#6b4a32', c: '#8a5c3a', y: '#e3b84a', m: '#8a8fa3', M: '#5d6672', r: '#c9483a' } },
    toolbox: {
      label: 'Toolbox', dew: true,
      rows: ['...mmmmmm...', '...m....m...', 'rrrrrrrrrrrr', 'rRRRRRRRRRRr', 'rrrrryyrrrrr', 'rrrrryyrrrrr', 'rrrrrrrrrrrr', 'dddddddddddd'],
      colors: { r: '#c9483a', R: '#e0685a', d: '#8a2a24', y: '#e3b84a', m: '#8a8fa3' },
    },
    anvil: {
      label: 'Anvil', dew: true,
      rows: ['.MMMMMMMMMMMM.', 'mmmmmmmmmmmmmm', '.mmmmmmmmmmm..', '...mmmmmmm....', '....mmmmm.....', '....mmmmm.....', '...mmmmmmm....', '..mmmmmmmmm...', '..ddddddddd...'],
      colors: { m: '#4a4f5a', M: '#7a8290', d: '#2e3038' },
    },
    grandclock: {
      label: 'Grandfather clock', dew: true, pace: 500, frames: [0, 1.6, 0, -1.6].map((off) => grandClock(off)),
      colors: { b: '#6b4a32', B: '#8a5f3d', d: '#4f3523', w: '#fff8ec', n: '#2a1f33', g: '#2a1f22', y: '#e3b84a' },
      hands: { x: 5, y: 6, minute: 2.6, hour: 1.6, ink: 'n', face: 'w' },
    },
    fireplace: {
      label: 'Fireplace', dew: true, glow: '#ff9a4a', emit: 'fFy', lightY: 0.66, pace: 170, frames: turns(6, (i) => fireplace(i)),
      colors: { b: '#6b4a32', B: '#8a5f3d', s: '#77727a', S: '#5a5660', n: '#1f181c', d: '#5a3a24', D: '#6e4a30', f: '#e8504a', F: '#ff9a3d', y: '#ffe066' },
    },
    armor: {
      label: 'Suit of armor', dew: true,
      rows: ['....rr.....', '...rrr.....', '...mmmmm...', '..mMMMMMm..', '..mnnMnnm..', '..mMMMMMm..', '...mmmmm...', '.mmmMMMmmm.', 'mMMmMMMmMMm', 'mMMmMMMmMMm', 'mm.mMMMm.mm', 'mm.mmymm.mm', 'mm.mMMMm.mm', 'nn.mMMMm.nn', '...mm.mm...', '...mM.Mm...', '...mM.Mm...', '...mM.Mm...', '...mm.mm...', '..mmm.mmm..', '.ddddddddd.'],
      colors: { m: '#8a8fa3', M: '#c3c8d2', n: '#3a3d46', r: '#c9483a', y: '#e3b84a', d: '#6b4a32' },
    },
    snowglobe: {
      label: 'Snow globe', dew: true, pace: 300, frames: turns(6, (i) => snowglobe(i)),
      colors: { a: '#7fb8dc', l: '#d8f2ff', w: '#f4fbff', W: '#ffffff', g: '#3f9e57', t: '#6b4a32', b: '#6b4a32', B: '#8a5f3d' },
    },
  });
  Object.assign(TINTS, {
    'stand:vending': [{ name: 'Blue', r: '#2f5fc0', R: '#4a7ae0', d: '#1f3a7a' }, { name: 'Green', r: '#2f8a4a', R: '#4aa868', d: '#1f5a30' }, { name: 'Grey', r: '#5d6672', R: '#7a8290', d: '#3a3f4a' }],
    'stand:coral': [{ name: 'Orange', p: '#ff9a4a', P: '#d9702a' }, { name: 'Violet', p: '#a87aff', P: '#7a4ad0' }, { name: 'Bleached', p: '#f2ecdc', P: '#c8c0a8' }],
    'stand:toolbox': [{ name: 'Blue', r: '#2f5fc0', R: '#4a7ae0', d: '#1f3a7a' }, { name: 'Green', r: '#2f8a4a', R: '#4aa868', d: '#1f5a30' }, { name: 'Yellow', r: '#e3b84a', R: '#f2d47a', d: '#a8802a', y: '#3a3d46' }],
    'stand:crystal': [{ name: 'Amethyst', a: '#c8a8ff', A: '#f0e6ff', c: '#8a5cd0', glow: '#d8c0ff' }, { name: 'Emerald', a: '#8ae8b0', A: '#e0fff0', c: '#3fa870', glow: '#a8ffd0' }, { name: 'Rose', a: '#ffb0c8', A: '#fff0f4', c: '#d9708a', glow: '#ffc8d8' }],
    'stand:rocket': [{ name: 'Blue', r: '#2f5fc0' }, { name: 'Black', r: '#2e2e38', u: '#e3b84a' }, { name: 'Orange', r: '#ff8a2a' }],
    'stand:armor': [{ name: 'Gold', m: '#c9902e', M: '#f2d47a', n: '#6a4a12' }, { name: 'Black', m: '#3a3d46', M: '#5d6272', n: '#16161e' }, { name: 'Blue plume', r: '#3a7bd5' }],
    'stand:kelp': [{ name: 'Red', g: '#b8404a', G: '#e06a6a' }, { name: 'Golden', g: '#a8802a', G: '#e3b84a' }, { name: 'Violet', g: '#6a4ab8', G: '#a88aff' }],
    'stand:grandclock': [{ name: 'Dark', b: '#3a2a22', B: '#4f3a2e', d: '#2a1c16' }, { name: 'White', b: '#e6e0d4', B: '#f6f2ea', d: '#c3bcae' }, { name: 'Cherry', b: '#7a2f2a', B: '#9a4038', d: '#5a201c' }],
    'stand:snowman': [{ name: 'Blue scarf', r: '#3a7bd5' }, { name: 'Green scarf', r: '#3f9e57' }, { name: 'Purple scarf', r: '#8a5cd0' }],
  });

  // ---- From the ceiling ----
  const icicles = () => {
    const g = grid(26, 9);
    const long = [4, 7, 3, 9, 5, 2, 6, 8, 3, 5, 7, 4, 2];
    long.forEach((len, n) => {
      for (let y = 0; y < len; y++) {
        g.set(n * 2, y, y < len - 1 && y < len * 0.6 ? 'a' : 'A');
        if (y < len * 0.5) g.set(n * 2 + 1, y, 'c');
      }
    });
    return g.rect(0, 0, 26, 1, 'A').rows();
  };
  // (Its bell opening and closing as it swims, its arms trailing after: `t`, how far through.)
  const jelly = (t) => {
    const g = grid(13, 16);
    const open = Math.sin(t * 2 * Math.PI);
    const r = 4.6 + open * 1.1;
    const top = 2 - Math.round(open);
    g.disc(6, top + 3.2, r, 'j', 3.4);
    g.rect(0, top + 4, 13, 12, '.');
    for (let x = Math.ceil(6 - r); x <= Math.floor(6 + r); x++) g.set(x, top + 4, x % 2 ? 'J' : 'j');
    g.set(4, top + 1, 'J').set(5, top + 1, 'J').set(4, top + 2, 'J');
    for (const [x, off] of [[3, 0], [5, 1.2], [7, 2.4], [9, 3.6]]) {
      for (let n = 0; n < 8 - (x % 4); n++) g.set(6 + (x - 6) * (r / 4.6) * 0.8 + Math.sin(t * 2 * Math.PI + off + n / 2) * 0.9, top + 5 + n, n % 2 ? 't' : 'J');
    }
    return g.rows();
  };
  // (Hung on threads from a bar, bobbing a little: `i` of 4.)
  const planets = (i) => {
    const g = grid(23, 15);
    g.set(11, 0, 's').rect(1, 1, 21, 1, 't');
    const bob = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]][i];
    const hang = (x, y, art) => {
      for (let yy = 2; yy < y; yy++) g.set(x, yy, 's');
      g.put(x - Math.floor(art[0].length / 2), y, art);
    };
    hang(3, 5 + bob[0], ['.uu.', 'uuUu', 'ugUu', '.uu.']);
    hang(11, 8 + bob[1], ['...yyy...', '..yyyyy..', 'rryyyyyrr', '..yyyrr..', '...yyy...']);
    hang(19, 4 + bob[2], ['.o.', 'oOo', '.o.']);
    return g.rows();
  };
  // (Its blades going round, seen from the side: long, shorter as they turn, long again.)
  const fan = (i) => {
    const g = grid(23, 9);
    g.rect(11, 0, 1, 3, 'm').rect(9, 3, 5, 2, 'm').rect(9, 3, 5, 1, 'M').rect(10, 5, 3, 1, 'y');
    const len = [9, 6, 2, 6][i];
    g.rect(9 - len, 4, len, 1, 'b').rect(14, 4, len, 1, 'b');
    if (i === 1) g.rect(12, 5, 5, 1, 'B');
    if (i === 3) g.rect(6, 5, 5, 1, 'B');
    if (i === 2) g.rect(10, 6, 3, 2, 'B');
    return g.rows();
  };
  const pipes = () => {
    const g = grid(30, 9);
    g.rect(0, 1, 30, 2, 'm').rect(0, 1, 30, 1, 'M');
    for (const x of [4, 14, 24]) g.rect(x, 0, 2, 4, 'd');
    g.rect(19, 3, 2, 3, 'm').rect(17, 6, 6, 1, 'r').rect(19, 7, 2, 1, 'r').set(16, 6, 'R').set(23, 6, 'R');
    g.rect(8, 3, 2, 5, 'm').rect(8, 8, 2, 1, 'd');
    return g.rows();
  };
  Object.assign(ROOM.ceiling, {
    icicles: { label: 'Icicles', dew: true, bare: true, rows: icicles(), colors: { a: '#bfeaff', A: '#f2fbff', c: '#8fc4e4' } },
    tube: {
      label: 'Strip light', dew: true, glow: '#fbf8d0', emit: 'w', flicker: true, lightY: 0.8,
      rows: ['.........mm.........', 'mmmmmmmmmmmmmmmmmmmm', 'mwwwwwwwwwwwwwwwwwwm', '.wwwwwwwwwwwwwwwwww.'],
      colors: { m: '#9aa0ae', w: '#fffde8' },
    },
    jelly: {
      label: 'Jellyfish', dew: true, glow: '#d8b8ff', emit: 'jJ', lightY: 0.3, pace: 240, frames: turns(8, (i, t) => jelly(t)),
      colors: { j: '#c8a0ff', J: '#f0e0ff', t: '#9a70e0' },
    },
    planets: {
      label: 'Planet mobile', dew: true, pace: 600, frames: turns(4, (i) => planets(i)),
      colors: { s: '#d8c8a8', t: '#8a6a4a', u: '#4a8ae0', U: '#a8d0ff', g: '#5ac86a', y: '#f2c86a', r: '#c9a24a', o: '#e0603a', O: '#ff9a6a' },
    },
    fan: { label: 'Ceiling fan', dew: true, pace: 110, frames: turns(4, (i) => fan(i)), colors: { m: '#8a8fa3', M: '#b8bec9', b: '#8a5c3a', B: '#6b4a32', y: '#fff1b8' } },
    bulb: {
      label: 'Bare bulb', dew: true, glow: '#ffe9b0', emit: 'yY', lightY: 0.8,
      rows: ['..n..', '..n..', '..n..', '..n..', '.mmm.', '.mmm.', '.yYy.', 'yYYYy', 'yYYYy', '.yyy.'],
      colors: { n: '#3a3d46', m: '#8a8fa3', y: '#ffe9b0', Y: '#ffffff' },
    },
    pipes: { label: 'Pipes', dew: true, rows: pipes(), colors: { m: '#8a6a4a', M: '#b8906a', d: '#5a4632', r: '#c9483a', R: '#e0685a' } },
  });
  Object.assign(TINTS, {
    'ceiling:icicles': [{ name: 'Cave', a: '#8a7a6a', A: '#a8988a', c: '#6a5c50' }, { name: 'Amethyst', a: '#c8a8ff', A: '#f0e6ff', c: '#8a5cd0' }, { name: 'Slime', a: '#8ae06a', A: '#d0ffb0', c: '#4fa83a' }],
    'ceiling:jelly': [{ name: 'Moon', j: '#a8d8ff', J: '#eaf6ff', t: '#6a9ad8', glow: '#bfe6ff' }, { name: 'Peach', j: '#ffb89a', J: '#fff0e6', t: '#e0806a', glow: '#ffd0b8' }, { name: 'Lime', j: '#a8f08a', J: '#eaffd8', t: '#5ac86a', glow: '#c8ffb0' }],
    'ceiling:pipes': [{ name: 'Steel', m: '#8a8fa3', M: '#b8bec9', d: '#5d6272' }, { name: 'Green', m: '#3f7a5a', M: '#5a9a78', d: '#2a5a40' }, { name: 'Rust', m: '#9a5a3a', M: '#b8744a', d: '#6a3a24' }],
    'ceiling:fan': [{ name: 'White', b: '#e6e0d4', B: '#c3bcae' }, { name: 'Black', b: '#3a3d46', B: '#26262e' }, { name: 'Brass', m: '#c9902e', M: '#e3b84a' }],
  });

  // ---- To wear ----
  // (A glint going along a row of points, then all of it bright: a crown's frames.)
  const glints = (rows, at, lit, all) => [...at.map(([x, y]) => rows.map((r, j) => (j === y ? r.slice(0, x) + lit + r.slice(x + 1) : r))), all];
  const ICE_CROWN = ['I.I.I', 'IiIiI', 'DIDID'];
  Object.assign(WEAR.head, {
    chef: { label: 'Chef hat', rows: ['.WWWWW.', 'WWWWWWW', '.WwWwW.', '.wwwww.'], colors: { W: '#f6f4ee', w: '#d2cec2' } },
    cone: { label: 'Traffic cone', rows: ['..O..', '..W..', '.OOO.', 'OOOOO'], colors: { O: '#f07a2a', W: '#f2f2f2' } },
    hardhat: { label: 'Hard hat', dx: 1, rows: ['..YYY...', '.YYWYY..', 'YYYYYYY.', 'yyyyyyyy'], colors: { Y: '#f2c230', W: '#fff2a8', y: '#b8901a' } },
    ushanka: { label: 'Fur hat', rows: ['.BBBBB.', 'BBBRBBB', 'FFFFFFF', 'FFFFFFF'], colors: { B: '#6a4a3a', F: '#e6dcc8', R: '#d94a4a' } },
    tricorn: { label: 'Pirate hat', rows: ['...KKK...', '..KKWKK..', '.KKKKKKK.', 'GKKKKKKKG'], colors: { K: '#26262e', W: '#f2f2f2', G: '#c9902e' } },
    viking: { label: 'Viking helmet', rows: ['H.....H', 'HHMMMHH', '.MMmMM.', '.GGGGG.'], colors: { H: '#f0e6d0', M: '#9aa0b0', m: '#c8ccd6', G: '#c9902e' } },
    // (Its light on, then fading out, then back.)
    antenna: {
      label: 'Antenna', rows: ['..R..', '..S..', '..S..', '.SSS.'], anim: { n: 4, step: 4 },
      frames: [['..R..', '..S..', '..S..', '.SSS.'], ['..r..', '..S..', '..S..', '.SSS.'], ['..d..', '..S..', '..S..', '.SSS.'], ['..r..', '..S..', '..S..', '.SSS.']],
      colors: { S: '#b8bec9', R: '#ff5a4a', r: '#b03a30', d: '#6a2a24' },
    },
    // (The light going along its points, then all of it catching it.)
    frostcrown: {
      label: 'Ice crown', rows: ICE_CROWN, anim: { n: 4, step: 4 },
      frames: glints(ICE_CROWN, [[0, 0], [2, 0], [4, 0]], 'W', ['I.I.I', 'IWIWI', 'DIDID']),
      colors: { I: '#a8e0ff', i: '#e8f8ff', D: '#6ab8e8', W: '#ffffff' },
    },
  });
  Object.assign(WEAR.eyes, {
    goggles: { label: 'Ski goggles', glasses: 'lens', colors: { F: '#e8e8ee', L: '#ff9a3a', W: '#fff0c0' } },
    welding: { label: 'Welding goggles', glasses: 'lens', colors: { F: '#6a5240', L: '#18241c', W: '#6aff8a' } },
    visor: { label: 'Cyber visor', glasses: 'sun', colors: { L: '#12303a', F: '#12303a', W: '#4dffe0' } },
    patch: { label: 'Eyepatch', glasses: 'patch', colors: { K: '#1c1c24', F: '#1c1c24' } },
    snorkel: { label: 'Snorkel', glasses: 'lens', tube: 6, colors: { F: '#f2c230', L: '#7fd8f0', W: '#ffffff', T: '#f2c230', O: '#e0483a' } },
  });
  Object.assign(WEAR.neck, {
    necktie: { label: 'Necktie', band: 'W', hang: ['.R.', '.r.', '.R.', '.R.'], colors: { W: '#f2f0ea', R: '#b8323a', r: '#8a242c' } },
    lanyard: { label: 'Lanyard', band: 'B', hang: ['.B.', 'WWW', 'WbW', 'WWW'], colors: { B: '#3a7bd5', W: '#f2f2f2', b: '#22253a' } },
    sailor: { label: 'Sailor collar', band: 'WN', hang: ['NNN', '.R.'], colors: { W: '#f2f0ea', N: '#22365e', R: '#d94a4a' } },
    pendant: { label: 'Crystal pendant', band: 'K', hang: ['.K.', 'CcC', '.C.'], colors: { K: '#3a3d46', C: '#7fd8f0', c: '#e8f8ff' } },
    chain: { label: 'Gold chain', band: 'Yy', hang: ['.Y.', 'YWY', '.Y.'], colors: { Y: '#ffcf3a', y: '#b8862a', W: '#fff6c0' } },
  });
  Object.assign(WEAR.body, {
    flannel: {
      label: 'Flannel', reach: 5, paint: (x, y, part) => (part !== 'body' ? 'd' : x % 3 === 0 && y % 3 === 0 ? 'K' : x % 3 === 0 || y % 3 === 0 ? 'd' : 'R'),
      colors: { R: '#c9483a', d: '#7a2a24', K: '#2a1a1a' },
    },
    // (A band that catches the light round its middle.)
    hivis: { label: 'Hi-vis jacket', reach: 4, paint: (x, y, part, at) => (part === 'body' && y === at.my ? 'S' : part === 'body' || part === 'arm' ? 'O' : 'o'), colors: { O: '#f2a020', o: '#c97a14', S: '#e8ecf2' } },
    // (Its zip down its middle.)
    leather: { label: 'Leather jacket', reach: 5, paint: (x, y, part, at) => (part === 'body' && x === at.mx ? 'Z' : part === 'body' || part === 'arm' ? 'K' : 'k'), colors: { K: '#2a2a33', k: '#4a4d58', Z: '#c8ccd6' } },
    // (Fur round its hood, cuffs and hem.)
    parka: { label: 'Parka', reach: 6, hood: 'F', paint: (x, y, part, at) => (part !== 'body' ? 'F' : x === at.mx ? 'z' : 'P'), colors: { P: '#3f6a8a', F: '#ece2cc', z: '#2a4a66' } },
    wetsuit: { label: 'Wetsuit', reach: 6, paint: (x, y, part, at) => (part === 'body' && y === at.my ? 'B' : part === 'body' || part === 'arm' ? 'K' : 'B'), colors: { K: '#22262e', B: '#2ab8d0' } },
    chainmail: { label: 'Chainmail', reach: 5, paint: (x, y, part) => (part === 'body' || part === 'arm' ? ((x + y) % 2 ? 'M' : 'm') : 'G'), colors: { M: '#aab0bf', m: '#7a8091', G: '#c9902e' } },
    // (Two lights on its chest, one then the other.)
    spacesuit: {
      label: 'Space suit', reach: 6, anim: { n: 2, step: 8 },
      paint: (x, y, part, at) => (part === 'collar' || part === 'hem' ? 'G' : part === 'body' && y === at.my && x === at.sx ? (at.f ? 'R' : 'r') : part === 'body' && y === at.my && x === at.sx + 1 ? (at.f ? 'b' : 'B') : 'W'),
      colors: { W: '#eef0f4', G: '#9aa0b0', R: '#ff5a4a', r: '#8a3a34', B: '#5aa8ff', b: '#34508a' },
    },
  });
  return { ROOM, TINTS, WEAR, DROP_NO_NECK: Object.keys(WEAR.neck).filter((k) => WEAR.neck[k].band) };
};
