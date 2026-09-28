'use strict';

// Homepages (see lib/homepages.js): drawing one. The app uses this (and edits pages with
// homepage-edit.js), and so does the page at rainlit.app/@name (homepage.html).
//
// A page is data: a background, and pieces in the order they're stacked. This turns each piece
// into elements, only ever setting text as text and styles from checked values (the server
// checks them too), so nothing on a page can run or load anything from anywhere else.

(() => {
  const WIDTH = 800; // (a page is this wide, and scales down to fit smaller screens)

  // Everything a piece can be. lib/homepages.js has the same lists.
  const FONTS = {
    rainlit: { label: 'Rainlit', css: '"Bricolage Grotesque", system-ui, sans-serif' },
    times: { label: 'Old web', css: '"Times New Roman", Times, "Liberation Serif", "Noto Serif", serif' },
    comic: { label: 'Comic', css: '"Comic Neue", "Comic Sans MS", cursive' },
    pixel: { label: 'Pixel', css: '"Pixelify Sans", monospace' },
    terminal: { label: 'Terminal', css: 'VT323, monospace', scale: 1.3 },
    tiny: { label: 'Tiny pixel', css: 'Silkscreen, monospace' },
    hand: { label: 'Handwriting', css: 'Caveat, cursive', scale: 1.25 },
    script: { label: 'Script', css: 'Pacifico, cursive' },
    typewriter: { label: 'Typewriter', css: '"Special Elite", monospace' },
    gothic: { label: 'Gothic', css: 'UnifrakturMaguntia, serif', scale: 1.1 },
    neon: { label: 'Neon', css: 'Monoton, sans-serif' },
    bubble: { label: 'Bubble', css: '"Rubik Bubbles", sans-serif' },
    spooky: { label: 'Spooky', css: 'Creepster, sans-serif', scale: 1.1 },
    marker: { label: 'Marker', css: '"Permanent Marker", sans-serif' },
  };
  const EFFECTS = { none: 'Plain', shadow: 'Shadow', outline: 'Outline', glow: 'Glow', rainbow: 'Rainbow', blink: 'Blink', marquee: 'Scrolling', wave: 'Wavy' };
  const BOXES = { none: 'None', note: 'Sticky note', label: 'Label', box: 'Box', highlight: 'Highlighter', hazard: 'Caution', bubble: 'Speech bubble' };
  const FRAMES = { none: 'None', photo: 'Photo', rounded: 'Rounded', circle: 'Circle', heart: 'Heart', stamp: 'Stamp', window: 'Window', sticker: 'Sticker' };
  const TAPES = { plain: 'Plain', stripes: 'Stripes', dots: 'Dots', checks: 'Checks' };
  const PAPERS = { lined: 'Lined', grid: 'Grid', dotted: 'Dotted', plain: 'Plain', sticky: 'Sticky note', kraft: 'Kraft', torn: 'Torn' };
  const ME_STYLES = { card: 'Card', sticker: 'Sticker', plain: 'Plain' };
  const PATTERNS = { dots: 'Polka dots', stripes: 'Stripes', checks: 'Checks', gingham: 'Gingham', grid: 'Grid', hearts: 'Hearts', stars: 'Stars', flowers: 'Flowers', zigzag: 'Zigzag', clouds: 'Clouds' };
  const SKIES = { none: 'Nothing', rain: 'Rain', snow: 'Snow', sparkles: 'Sparkles', hearts: 'Floating hearts' };

  // ---------- Pixel stickers ----------
  // Drawn a letter per pixel (these colors), with their outline. (Made with a little script:
  // each is drawn in its colors, and outlined automatically.)
  const PAL = {
    k: '#2a1f33', w: '#ffffff', W: '#e6e1f2', r: '#ef4d5e', R: '#b3263e', p: '#ff8cc6', P: '#ffd0e6', q: '#e2559a',
    o: '#ff9f43', O: '#d9661f', y: '#ffd84d', Y: '#fff3a8', g: '#6ad07a', G: '#2f9150', c: '#8ae4ff', b: '#4c8dff',
    B: '#2c55c9', v: '#a57bff', V: '#6a45c9', n: '#a86a3d', N: '#6b3f22', s: '#bdb8cc', S: '#7a7590',
  };
  const PIXEL = {
    'heart': ["...kkk....kkk...", "..krrrk..krrrk..", ".krrrrrkkrrrrrk.", "krrwwrrrrrrrrrrk", "krrwrrrrrrrrrrrk", "krrrrrrrrrrrrrrk", "krrrrrrrrrrrrRRk", ".krrrrrrrrrrrRk.", "..krrrrrrrrrRk..", "...krrrrrrrRk...", "....krrrrrRk....", ".....krrrRk.....", "......krRk......", ".......kk......."],
    'heart-pink': ["...kkk....kkk...", "..kpppk..kpppk..", ".kpppppkkpppppk.", "kppwwppppppppppk", "kppwpppppppppppk", "kppppppppppppppk", "kppppppppppppqqk", ".kpppppppppppqk.", "..kpppppppppqk..", "...kpppppppqk...", "....kpppppqk....", ".....kpppqk.....", "......kpqk......", ".......kk......."],
    'star': [".......kk.......", "......kyyk......", "......kyyk......", ".....kyyyyk.....", ".kkkkkyYyykkkkk.", "kyyyyyyYyyyyyyyk", ".kyyyyyyyyyyyyk.", "..kyyyyyyyyyyk..", "...kyyyyyyyyk...", "...kyyyyyyyok...", "..kyyyyyyyyyok..", "..kyyyokkyyyok..", ".kyyokk..kkyyok.", ".kyok......kyok.", "..kk........kk.."],
    'sparkle': [".......k.......", "......kyk......", "......kyk......", ".....kyYyk.....", ".....kyYyk.....", ".kkkkyYwYykkkk.", "kyyyyYwwwYyyyyk", ".kkkkyYwYykkkk.", ".....kyYyk.....", ".....kyYyk.....", "......kyk......", "......kyk......", ".......k......."],
    'moon': ["......kkkk.", "....kkyyyyk", "...kyYyyyk.", "..kyYyyyk..", ".kyYyyyk...", ".kyYyyk....", "kyYyyyk....", "kyYyyk.....", "kyYyyk.....", "kyYyyyk....", ".kyYyyk....", ".kyyyyyk...", "..kyyyyok..", "...kyyyyok.", "....kkyyyok", "......kkkk."],
    'flame': ["......k......", ".....kok.....", "....kook.....", "....koook....", "...koyook....", "...koyyook...", "..kooyyyook..", ".kooyyyyyook.", ".koyyYYyyyok.", "kooyYYYYyyook", "koyyYkYYkyyok", "koyyYYYYYyyok", "kooyyYYYyyook", ".kooyyyyyook.", "..koooooook..", "...kkkkkkk..."],
    'raindrop': [".....k.....", "....kbk....", "....kbk....", "...kbbbk...", "...kbbbk...", "..kbbbbbk..", "..kbcbbbk..", ".kbcbbbbbk.", "kbbcbbbbbbk", "kbcbbbbbbbk", "kbbbbbbbbBk", "kbbbbbbbBBk", ".kbbbbbBBk.", "..kbBBBBk..", "...kkkkk..."],
    'cloud': [".....kkk........", "....kwwwk.kkk...", "...kwwwwwkwwwk..", "..kwwwwwwwwwwwk.", ".kwwwwwwwwwwwwwk", "kwwwwwwwwwwwwwwk", "kwwwwwwwwwwwwwwk", ".kWWwwwwwwwwWWk.", "..kWWWWWWWWWWk..", "...kkkkkkkkkk..."],
    'umbrella': [".......kk.......", ".....kkrrkk.....", "...kkrrrrrrkk...", "..krrrrrrrrrrk..", ".krrwrrrrrrrrrk.", "krrwrrrrrrrrrrrk", "krrrrrrrrrrrrrrk", "krkrrrkrrkrrrkrk", ".k.kkk.knkkkk.k.", ".......knk......", ".......knk......", ".....k.knk......", "....knkknk......", ".....knnk.......", "......kk........"],
    'flower': ["......kk......", "...kkkppkkk...", "..kppkppkppk..", "..kpPppppppk..", ".kkkppyyppkkk.", "kpPppyyyyppppk", "kppppyyoyppppk", ".kkkppyoppkkk.", "..kppppppppk..", "..kppkppkppk..", "...kkkppkkk...", "......kk......"],
    'leaf': ["...........kkk.", "........kkkgggk", "......kkggggggk", ".....kggggggGgk", "....kgggggGgggk", "...kggggGgggggk", "..kgggGggggggk.", "..kggGgggggggk.", ".kggGgggggggk..", ".kgGgggggGgk...", ".kGgggggggk....", "kGkggggkkk.....", "kGkkkkk........", ".k............."],
    'mushroom': ["......kkkk......", "....kkrrrrkk....", "...krrrrrrrrk...", "..krrwwrrrrrrk..", ".krrrwwrrrwwrrk.", ".krrrrrrrrwwrrk.", "krrwwrrrrrrrrrrk", "krrwwrrrwwrrrrrk", "kRRRRRRRRRRRRRRk", ".kkkkwwwwwwkkkk.", "....kwwwwwwk....", "....kwwwwwWk....", "....kWwwwWWk....", ".....kkkkkk....."],
    'cherry': ["...........kk...", "..........kGgk..", ".........kgGk...", "........kgkgk...", ".......kgk.kgk..", "......kgk..kgk..", "...kkkgk...kkgk.", "..krrgk...krrgk.", ".krrrrrk.krrrrrk", "krrwrrrrkrrwrrrk", "krwrrrrrkrwrrrrk", "krrrrrRrkrrrrRrk", ".krrrRRk.krrRRk.", "..kRRRk...kRRk..", "...kkk.....kk..."],
    'ghost': [".....kkkkkk.....", "...kkwwwwwwkk...", "..kwwwwwwwwwwk..", ".kwwwwwwwwwwwwk.", ".kwwwwwwwwwwwwk.", "kwwwkkwwwwkkwwwk", "kwwwkkwwwwkkwwwk", "kwwwwwwwwwwwwwwk", "kwwwwwwkkwwwwwwk", "kwwwwwwwwwwwwwwk", "kwwwwwwwwwwwwwwk", "kwwwwwwwwwwwwWWk", "kwWwwwWWwwwWWwWk", ".kWkkWWkWWWWkWk.", "..k..kk.kkkk.k.."],
    'crown': [".k.....k.....k.", "kyk...kyk...kyk", "kyyk.kyyyk.kyyk", "kyyykkyrykkyyyk", "kyyyykyyykyyyyk", "kyyyyyyyyyyyyyk", "kyyryyybyyyryyk", "kyyyyyyyyyyyyyk", "koooooooooooook", ".kkkkkkkkkkkkk."],
    'bolt': [".......kkkk.", "......kyyyyk", ".....kyyyyk.", "....kyyyyk..", "...kyyyykkk.", "..kyyyyyyyyk", ".kyyyyyyyyk.", "..kkkkyyyk..", "....kyyyk...", "...kyyyk....", "..kyyok.....", ".kyokk......", "kokk........", ".k.........."],
    'gem': ["....kkkkkkk....", "...kccccccck...", "..kcwcccccbck..", ".kcwwcccccbbck.", "kcccccccccbbbck", ".kbbbbbbbbbbbk.", "..kbbcbbbbbBk..", "...kbbcbbbBk...", "....kbbbbBk....", ".....kbbBk.....", "......kBk......", ".......k......."],
    'rainbow': ["......kkkkkk......", "....kkrrrrrrkk....", "...krroooooorrk...", "..krooyyyyyyoork..", ".krooyyggggyyoork.", ".kroyggbbbbggyork.", "kroyygbvvvvbgyyork", "kroygbvvkkvvbgyork", "kroygbvk..kvbgyork", ".kkkkkk....kkkkkk."],
    'eye': ["......kkkkkk......", "....kkwwwwwwkk....", "..kkwwwwwwwwwwkk..", ".kwwwwwbbbbwwwwwk.", "kwwwwwbbkkbbwwwwwk", "kwwwwbbkkkkbbwwwwk", "kwwwwbbkkwkbbwwwwk", ".kwwwwbbkkbbwwwwk.", "..kkwwwbbbbwwwkk..", "....kkwwwwwwkk....", "......kkkkkk......"],
    'smiley': ["......kkkk......", "....kkyyyykk....", "...kyyyyyyyyk...", "..kyyyyyyyyyyk..", ".kyyyyyyyyyyyyk.", ".kyyykyyyykyyyk.", "kyyyykyyyykyyyyk", "kyyyyyyyyyyyyyyk", "kyyyyyyyyyyyyyyk", "kyyykyyyyyykyyyk", ".kypykyyyykypyk.", ".kyyyykkkkyyyyk.", "..kyyyyyyyyyyk..", "...kyyyyyyyyk...", "....kkyyyykk....", "......kkkk......"],
    'bow': ["..kk..........kk..", ".kppk........kppk.", "kppppk......kppppk", "kppPppk.kk.kppPppk", "kppPPppkppkppPPppk", "kpppPPppqqppPPpppk", "kppppPpqqqqpPppppk", "kpppppppqqpppppppk", "kpppppkkppkkpppppk", ".kpppkkppkppkkpppk", "..kkk.kppkkppkkkk.", ".....kppk..kppk...", ".....kpk....kpk...", "......k......k...."],
    'music': ["....kkkkkkk", "....kkkkkkk", "....k.....k", "....k.....k", "....k.....k", "....k.....k", "....k.....k", "....k.....k", ".kkkk..kkkk", "kkkkk.kkkkk", "kkkk..kkkk."],
    'cursor': ["k..........", "kk.........", "kwk........", "kwwk.......", "kwwwk......", "kwwwwk.....", "kwwwwwk....", "kwwwwwwk...", "kwwwwwwwk..", "kwwwwwwwwk.", "kwwwwwkkkkk", "kwwkwwk....", "kwk.kwwk...", "kk..kwwk...", "k....kwwk..", ".....kwwk..", "......kk..."],
    'floppy': [".kkkkkkkkkkkk..", "kbbbbbbbbbbbbk.", "kbbbssssssbbbbk", "kbbbssssSsbbbbk", "kbbbssssSsbbbbk", "kbbbssssssbbbbk", "kbbbbbbbbbbbbbk", "kbbwwwwwwwwwbbk", "kbbwwkkkkkwwbbk", "kbbwwwwwwwwwbbk", "kbbwwkkkkwwwbbk", "kbbwwwwwwwwwbbk", "kbbwwwwwwwwwbbk", ".kkkkkkkkkkkkk."],
  };
  const PIXEL_NAMES = {
    heart: 'Heart', 'heart-pink': 'Pink heart', star: 'Star', sparkle: 'Sparkle', moon: 'Moon', flame: 'Little flame',
    raindrop: 'Raindrop', cloud: 'Cloud', umbrella: 'Umbrella', flower: 'Flower', leaf: 'Leaf', mushroom: 'Mushroom',
    cherry: 'Cherries', ghost: 'Ghost', crown: 'Crown', bolt: 'Lightning', gem: 'Gem', rainbow: 'Rainbow', eye: 'Eye',
    smiley: 'Smiley', bow: 'Bow', music: 'Music', cursor: 'Cursor', floppy: 'Floppy disk',
  };

  const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const pixelCache = new Map();
  // A pixel sticker as a picture (an SVG of its pixels, a rectangle per run of one color).
  function pixelSrc(name) {
    if (pixelCache.has(name)) return pixelCache.get(name);
    const rows = PIXEL[name];
    if (!rows) return null;
    let rects = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const c = row[x];
        let n = 1;
        while (x + n < row.length && row[x + n] === c) n++;
        if (PAL[c]) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PAL[c]}"/>`;
        x += n;
      }
    });
    const src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>`)}`;
    pixelCache.set(name, src);
    return src;
  }
  const pixelRatio = (name) => (PIXEL[name] ? PIXEL[name].length / PIXEL[name][0].length : 1);

  // ---------- Colors and backgrounds ----------

  const HEX = /^#[0-9a-f]{6}$/i;
  const hex = (v, dflt) => (HEX.test(v || '') ? v : dflt);
  function rgba(h, a) {
    const n = parseInt(hex(h, '#000000').slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  // Light or dark? (For text that sits on a color.)
  function light(h) {
    const n = parseInt(hex(h, '#000000').slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
  }

  const TILES = {
    hearts: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="${a}"/><g fill="${b}"><path d="M14 22 7.5 15.6a4 4 0 0 1 6.5-4.6 4 4 0 0 1 6.5 4.6Z"/><path d="M42 50 35.5 43.6a4 4 0 0 1 6.5-4.6 4 4 0 0 1 6.5 4.6Z"/></g></svg>`,
    stars: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${a}"/><g fill="${b}"><path d="M24 14l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M84 70l1.5 4.5 4.5 1.5-4.5 1.5L84 82l-1.5-4.5L78 76l4.5-1.5z"/><circle cx="60" cy="30" r="1.6"/><circle cx="100" cy="18" r="1.1"/><circle cx="14" cy="80" r="1.4"/><circle cx="46" cy="100" r="1"/><circle cx="108" cy="104" r="1.6"/><circle cx="70" cy="52" r="0.9"/><circle cx="36" cy="58" r="1.1" opacity=".7"/><circle cx="94" cy="44" r="0.8" opacity=".7"/></g></svg>`,
    flowers: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${a}"/><g fill="${b}">${[[16, 16], [48, 48]].map(([x, y]) => [0, 72, 144, 216, 288].map((d) => `<circle cx="${x + 5 * Math.cos((d * Math.PI) / 180)}" cy="${y + 5 * Math.sin((d * Math.PI) / 180)}" r="3.6"/>`).join('')).join('')}</g><g fill="${a}" opacity=".85"><circle cx="16" cy="16" r="2.2"/><circle cx="48" cy="48" r="2.2"/></g></svg>`,
    clouds: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="110"><rect width="160" height="110" fill="${a}"/><g fill="${b}"><path d="M20 40a10 10 0 0 1 9-10 13 13 0 0 1 24-3 9 9 0 0 1 13 8 8 8 0 0 1-1 16H28a9 9 0 0 1-8-11z"/><path d="M96 92a8 8 0 0 1 7-8 10 10 0 0 1 19-2 7 7 0 0 1 10 6 6 6 0 0 1-1 12h-29a7 7 0 0 1-6-8z"/></g></svg>`,
  };

  // The background of a whole page, as styles.
  function backgroundStyle(bg, fileUrl) {
    bg = bg || {};
    const a = hex(bg.c1, '#1d2440');
    const b = hex(bg.c2, '#2b3560');
    const s = { backgroundColor: a, backgroundImage: 'none', backgroundSize: 'auto', backgroundPosition: '0 0', backgroundRepeat: 'repeat' };
    if (bg.kind === 'image' && bg.file) {
      s.backgroundImage = `url("${fileUrl(bg.file)}")`;
      if (bg.fit === 'cover') Object.assign(s, { backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' });
      return s;
    }
    if (bg.kind !== 'pattern') return s;
    switch (bg.pattern) {
      case 'dots':
        return { ...s, backgroundImage: `radial-gradient(${b} 22%, transparent 23%), radial-gradient(${b} 22%, transparent 23%)`, backgroundSize: '48px 48px', backgroundPosition: '0 0, 24px 24px' };
      case 'stripes':
        return { ...s, backgroundImage: `repeating-linear-gradient(90deg, ${a} 0 28px, ${b} 28px 56px)` };
      case 'checks':
        return { ...s, backgroundImage: `conic-gradient(${b} 25%, ${a} 0 50%, ${b} 0 75%, ${a} 0)`, backgroundSize: '56px 56px' };
      case 'gingham':
        return { ...s, backgroundImage: `linear-gradient(90deg, ${rgba(b, 0.5)} 50%, transparent 50%), linear-gradient(${rgba(b, 0.5)} 50%, transparent 50%)`, backgroundSize: '36px 36px' };
      case 'grid':
        return { ...s, backgroundImage: `linear-gradient(${b} 1.5px, transparent 1.5px), linear-gradient(90deg, ${b} 1.5px, transparent 1.5px)`, backgroundSize: '28px 28px' };
      case 'zigzag':
        return {
          ...s,
          backgroundImage: `linear-gradient(135deg, ${b} 25%, transparent 25%), linear-gradient(225deg, ${b} 25%, transparent 25%), linear-gradient(315deg, ${b} 25%, transparent 25%), linear-gradient(45deg, ${b} 25%, transparent 25%)`,
          backgroundSize: '40px 40px', backgroundPosition: '-20px 0, -20px 0, 0 0, 0 0',
        };
      default:
        return TILES[bg.pattern] ? { ...s, backgroundImage: uri(TILES[bg.pattern](a, b)) } : s;
    }
  }

  // ---------- Pieces ----------

  // A ragged edge (for tape and torn paper): points along one side, as a clip path.
  function zigzag(w, h, sides) {
    const pts = [];
    const step = 5;
    if (sides.includes('left') || sides.includes('right')) {
      const n = Math.max(2, Math.round(h / step));
      const edge = (x0, dir) => Array.from({ length: n + 1 }, (_, i) => `${x0 + (i % 2 ? dir * 4 : 0)}px ${(h * i) / n}px`);
      pts.push(...edge(0, 1));
      pts.push(...edge(w, -1).reverse());
      return `polygon(${pts.join(', ')})`;
    }
    // (top and bottom, torn)
    const n = Math.max(4, Math.round(w / 9));
    const jag = (i, seed) => ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i <= n; i++) pts.push(`${(w * i) / n}px ${jag(i, 1) * 7}px`);
    for (let i = n; i >= 0; i--) pts.push(`${(w * i) / n}px ${h - jag(i, 7) * 7}px`);
    return `polygon(${pts.join(', ')})`;
  }

  const initial = (name) => (Array.from(String(name || '?').trim())[0] || '?').toUpperCase();
  function faceColor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 45% 45%)`;
  }

  function avatarEl(owner) {
    const face = document.createElement('span');
    face.className = 'hp-avatar';
    face.style.background = faceColor(owner.id || '');
    if (owner.avatar) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = owner.avatar;
      img.draggable = false;
      img.onerror = () => { face.textContent = initial(owner.displayName); };
      face.append(img);
    } else {
      face.textContent = initial(owner.displayName);
    }
    return face;
  }

  // Text: its words in a span (so a label or a highlighter hugs them), in a box that can be a
  // sticky note, a speech bubble... `c2` is the box's color, `c3` the effect's (shadow, glow).
  function textPiece(node, p) {
    const f = FONTS[p.font] || FONTS.rainlit;
    const color = hex(p.color, '#2b2233');
    const c3 = hex(p.c3, '#ff7eb6');
    const inner = document.createElement('div');
    inner.className = `hp-words hp-box-${BOXES[p.box] ? p.box : 'none'} hp-fx-${EFFECTS[p.fx] ? p.fx : 'none'}`;
    Object.assign(inner.style, {
      fontFamily: f.css, fontSize: `${(p.size || 24) * (f.scale || 1)}px`, color, textAlign: p.align || 'left',
      fontWeight: p.bold ? '700' : '400', fontStyle: p.italic ? 'italic' : 'normal',
    });
    inner.style.setProperty('--c2', hex(p.c2, '#fff59d'));
    inner.style.setProperty('--ink', color);
    const ink = document.createElement('span');
    ink.className = 'hp-ink';
    const shadow = {
      shadow: `0.08em 0.08em 0 ${c3}`,
      outline: [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4], [0, 1.4], [-1.4, 0], [1.4, 0]].map(([x, y]) => `${(x * 0.06).toFixed(3)}em ${(y * 0.06).toFixed(3)}em 0 ${c3}`).join(', '),
      glow: `0 0 0.15em ${c3}, 0 0 0.4em ${c3}, 0 0 0.8em ${c3}`,
    }[p.fx];
    if (shadow) ink.style.textShadow = shadow;
    const text = String(p.text || '');
    if (p.fx === 'wave' && text.length <= 300) {
      // Each letter bobs a moment after the one before it.
      let i = 0;
      for (const ch of Array.from(text)) {
        if (ch === '\n') {
          ink.append(document.createElement('br'));
          continue;
        }
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.animationDelay = `${((i++ % 24) * -0.08).toFixed(2)}s`;
        ink.append(s);
      }
    } else {
      ink.textContent = text;
    }
    inner.append(ink);
    node.append(inner);
  }

  function imagePiece(node, p, ctx) {
    const img = document.createElement('img');
    img.alt = p.caption || '';
    img.draggable = false;
    img.src = ctx.fileUrl(p.file);
    img.loading = 'lazy';
    img.decoding = 'async';
    node.classList.add(`hp-frame-${p.frame || 'none'}`);
    if (p.frame === 'window') {
      const bar = document.createElement('div');
      bar.className = 'hp-window-bar';
      const title = document.createElement('span');
      title.textContent = p.caption || 'untitled.gif';
      const knobs = document.createElement('i');
      knobs.setAttribute('aria-hidden', 'true');
      for (const k of ['_', '□', '×']) {
        const b = document.createElement('b');
        b.textContent = k;
        knobs.append(b);
      }
      bar.append(title, knobs);
      const pane = document.createElement('div');
      pane.className = 'hp-window-pane';
      pane.append(img);
      node.append(bar, pane);
      return;
    }
    node.append(img);
    if (p.frame === 'photo' && p.caption) {
      const cap = document.createElement('span');
      cap.className = 'hp-caption';
      cap.textContent = p.caption;
      node.append(cap);
    }
  }

  function stickerPiece(node, p) {
    node.classList.toggle('hp-cut', p.outline !== false);
    if (p.set === 'emoji') {
      const e = document.createElement('span');
      e.className = 'hp-emoji';
      e.textContent = p.emoji;
      e.style.fontSize = `${Math.min(p.w, p.h) * 0.84}px`;
      node.append(e);
      return;
    }
    const img = document.createElement('img');
    img.draggable = false;
    img.alt = p.set === 'custom' ? `:${p.name}:` : PIXEL_NAMES[p.name] || '';
    img.src = p.set === 'custom' ? `/emoji/${p.emoji}` : pixelSrc(p.name) || '';
    if (p.set === 'pixel') img.className = 'hp-pixel';
    img.onerror = () => { node.classList.add('hp-gone'); };
    node.append(img);
  }

  function tapePiece(node, p) {
    const c = hex(p.color, '#f4a9c8');
    node.style.clipPath = zigzag(p.w, p.h, ['left', 'right']);
    const base = rgba(c, 0.78);
    const hi = rgba('#ffffff', 0.35);
    node.style.backgroundColor = base;
    node.style.backgroundImage = {
      plain: `linear-gradient(${rgba('#ffffff', 0.18)}, transparent 40%, ${rgba('#000000', 0.05)})`,
      stripes: `repeating-linear-gradient(135deg, ${hi} 0 6px, transparent 6px 12px)`,
      dots: `radial-gradient(${hi} 28%, transparent 30%)`,
      checks: `conic-gradient(${hi} 25%, transparent 0 50%, ${hi} 0 75%, transparent 0)`,
    }[p.style] || 'none';
    if (p.style === 'dots') node.style.backgroundSize = '12px 12px';
    if (p.style === 'checks') node.style.backgroundSize = '14px 14px';
  }

  function paperPiece(node, p) {
    const c = hex(p.color, '#fffdf6');
    node.classList.add(`hp-paper-${p.style || 'lined'}`);
    node.style.backgroundColor = c;
    const line = light(c) ? rgba('#4a78b5', 0.28) : rgba('#ffffff', 0.25);
    node.style.backgroundImage = {
      lined: `linear-gradient(90deg, transparent 38px, ${rgba('#e2555f', 0.45)} 38px 40px, transparent 40px), repeating-linear-gradient(transparent 0 25px, ${line} 25px 26px)`,
      grid: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      dotted: `radial-gradient(${light(c) ? rgba('#3b3030', 0.28) : rgba('#ffffff', 0.3)} 1.2px, transparent 1.6px)`,
      sticky: `linear-gradient(${rgba('#000000', 0.06)}, transparent 22px)`,
      kraft: `radial-gradient(${rgba('#000000', 0.06)} 1px, transparent 1.5px), radial-gradient(${rgba('#ffffff', 0.08)} 1px, transparent 1.5px)`,
    }[p.style] || 'none';
    node.style.backgroundSize = { grid: '22px 22px', dotted: '18px 18px', kraft: '7px 7px, 11px 11px' }[p.style] || 'auto';
    if (p.style === 'torn') node.style.clipPath = zigzag(p.w, p.h, ['top', 'bottom']);
  }

  function mePiece(node, p, ctx) {
    const owner = ctx.owner || {};
    const f = FONTS[p.font] || FONTS.rainlit;
    node.classList.add(`hp-me-${p.style || 'card'}`);
    const c = hex(p.color, '#ffffff');
    node.style.setProperty('--card', c);
    node.style.setProperty('--card-ink', light(c) ? '#2b2233' : '#f6f2fb');
    const name = document.createElement('strong');
    name.className = 'hp-me-name';
    name.style.fontFamily = f.css;
    name.textContent = owner.displayName || '';
    const handle = document.createElement('span');
    handle.className = 'hp-me-handle';
    handle.textContent = owner.username ? `@${owner.username}` : '';
    const words = document.createElement('div');
    words.className = 'hp-me-words';
    words.append(name, handle);
    if (owner.statusText) {
      const status = document.createElement('span');
      status.className = 'hp-me-status';
      status.textContent = owner.statusText;
      words.append(status);
    }
    // (Inside the piece, so it can size everything by the piece: see .hp-me in homepage.css.)
    const card = document.createElement('div');
    card.className = 'hp-me-in';
    card.append(avatarEl(owner), words);
    node.append(card);
  }

  const DRAW = { text: textPiece, image: imagePiece, sticker: stickerPiece, tape: tapePiece, paper: paperPiece, me: mePiece };

  // One piece, placed and turned. (In the editor, links don't go anywhere.)
  function pieceEl(p, ctx) {
    const link = p.href && !ctx.edit;
    const node = document.createElement(link ? 'a' : 'div');
    node.className = `hp-piece hp-${p.t}`;
    node.dataset.id = p.id;
    Object.assign(node.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, transform: `rotate(${p.r || 0}deg)` });
    if (p.t !== 'text') node.style.height = `${p.h}px`;
    if (link) {
      node.href = p.href;
      node.target = '_blank';
      node.rel = 'noopener noreferrer nofollow ugc';
    }
    if (DRAW[p.t]) DRAW[p.t](node, p, ctx);
    return node;
  }

  // ---------- A whole page ----------

  // The page everyone has before making their own: under construction.
  function starter() {
    return {
      v: 1, title: '', height: 1000,
      bg: { kind: 'pattern', pattern: 'stars', c1: '#1b2140', c2: '#f5d76e', sky: 'rain' },
      pieces: [
        { id: 'tape1', t: 'tape', x: 322, y: 52, w: 150, h: 34, r: -4, style: 'stripes', color: '#8fd3ff' },
        { id: 'me', t: 'me', x: 270, y: 70, w: 260, h: 290, r: -2, style: 'card', color: '#fffaf0', font: 'rainlit' },
        { id: 'flame', t: 'sticker', set: 'pixel', name: 'flame', x: 548, y: 64, w: 78, h: 96, r: 8, outline: true },
        { id: 'drop', t: 'sticker', set: 'pixel', name: 'raindrop', x: 196, y: 262, w: 52, h: 71, r: -10, outline: true },
        { id: 'hi', t: 'text', x: 110, y: 396, w: 580, h: 80, r: 0, text: 'welcome to my homepage!', font: 'script', size: 44, color: '#ffe9a8', c2: '#fff59d', c3: '#ff7eb6', fx: 'glow', box: 'none', align: 'center' },
        { id: 'sparkle', t: 'sticker', set: 'pixel', name: 'sparkle', x: 640, y: 380, w: 45, h: 39, r: 0, outline: true },
        { id: 'uc', t: 'text', x: 235, y: 500, w: 330, h: 60, r: -3, text: 'UNDER CONSTRUCTION', font: 'tiny', size: 22, color: '#1a1a1a', c2: '#ffd23f', c3: '#ffffff', fx: 'none', box: 'hazard', align: 'center', bold: true },
        { id: 'note', t: 'text', x: 280, y: 610, w: 240, h: 110, r: 3, text: 'this page is still being built.\ncome back soon!', font: 'hand', size: 26, color: '#3a2e2a', c2: '#fff59d', c3: '#ffffff', fx: 'none', box: 'note', align: 'center' },
      ],
    };
  }

  // Draws a page into `page` (an element that scrolls): its background, and a canvas with its
  // pieces, scaled to fit. Returns { doc, canvas, fit }.
  function mount(page, data, opts = {}) {
    const doc = data.doc || starter();
    const ctx = { owner: data.owner || {}, fileUrl: (id) => `/homepage-files/${id}`, edit: Boolean(opts.edit) };
    page.replaceChildren();
    page.classList.add('hp-page');
    Object.assign(page.style, backgroundStyle(doc.bg, ctx.fileUrl));
    const stage = document.createElement('div');
    stage.className = 'hp-stage';
    const canvas = document.createElement('div');
    canvas.className = 'hp-canvas';
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${doc.height}px`;
    for (const p of doc.pieces || []) canvas.append(pieceEl(p, ctx));
    stage.append(canvas);
    page.append(stage);
    const fit = () => {
      const s = Math.min(1, (page.clientWidth || WIDTH) / WIDTH);
      canvas.style.transform = `scale(${s})`;
      stage.style.width = `${WIDTH * s}px`;
      stage.style.height = `${doc.height * s}px`;
      page.style.setProperty('--hp-scale', String(s));
      return s;
    };
    fit();
    return { doc, canvas, ctx, fit };
  }

  // Weather over the page (it stays put while the page scrolls under it).
  function setSky(sky, kind) {
    sky.className = `hp-sky hp-sky-${SKIES[kind] ? kind : 'none'}`;
  }

  window.Homepage = {
    WIDTH, FONTS, EFFECTS, BOXES, FRAMES, TAPES, PAPERS, ME_STYLES, PATTERNS, SKIES, PIXEL, PIXEL_NAMES,
    pixelSrc, pixelRatio, backgroundStyle, pieceEl, starter, mount, setSky, light,
  };
})();
