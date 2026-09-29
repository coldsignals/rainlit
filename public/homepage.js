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
  const EFFECTS = { none: 'Plain', shadow: 'Shadow', outline: 'Outline', glow: 'Glow', rainbow: 'Rainbow', blink: 'Blink', marquee: 'Scrolling', wave: 'Wavy', shimmer: 'Shimmer', lamplight: 'Lamplight' };
  const BOXES = { none: 'None', note: 'Sticky note', label: 'Label', box: 'Box', highlight: 'Highlighter', hazard: 'Caution', bubble: 'Speech bubble' };
  const FRAMES = { none: 'None', photo: 'Photo', rounded: 'Rounded', circle: 'Circle', heart: 'Heart', stamp: 'Stamp', window: 'Window', sticker: 'Sticker', gilded: 'Gilded', neon: 'Neon' };
  const TAPES = { plain: 'Plain', stripes: 'Stripes', dots: 'Dots', checks: 'Checks' };
  const PAPERS = { lined: 'Lined', grid: 'Grid', dotted: 'Dotted', plain: 'Plain', sticky: 'Sticky note', kraft: 'Kraft', torn: 'Torn' };
  const ME_STYLES = { card: 'Card', sticker: 'Sticker', plain: 'Plain' };
  const COUNTERS = { odometer: 'Odometer', led: 'LED', plain: 'Plain' };
  const GUESTBOOKS = { paper: 'Paper', retro: '1999', dark: 'Dark' };
  const ASKS = { paper: 'Paper', retro: '1999', dark: 'Dark' };
  const MUSICS = { tunebox: 'Tunebox', cassette: 'Cassette', plain: 'Plain' };
  const SHELVES = { wood: 'Wood', glass: 'Glass', pixel: 'Pixel', white: 'White' };
  const BUTTONS = { bevel: 'Classic', shiny: 'Shiny', stripes: 'Stripes', dark: 'Dark' };
  const PATTERNS = { dots: 'Polka dots', stripes: 'Stripes', checks: 'Checks', gingham: 'Gingham', grid: 'Grid', hearts: 'Hearts', stars: 'Stars', flowers: 'Flowers', zigzag: 'Zigzag', clouds: 'Clouds' };
  const SKIES = { none: 'Nothing', rain: 'Rain', snow: 'Snow', sparkles: 'Sparkles', hearts: 'Floating hearts', fireflies: 'Fireflies', aurora: 'Aurora', storm: 'Thunderstorm', blossoms: 'Cherry blossoms' };
  // Supporters' extras (lib/homepages.js): anyone can see them on a page, supporters can use them.
  const PERKS = { fx: ['shimmer', 'lamplight'], frame: ['gilded', 'neon'], sky: ['fireflies', 'aurora', 'storm', 'blossoms'] };

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
    inner.style.setProperty('--c3', c3);
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
    const base = rgba(c, 0.6); // (see-through, like washi tape)
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

  // ---------- Old-web touches ----------

  // The visitor counter: how many visits the page has had, like the hit counters of old.
  function counterPiece(node, p, ctx) {
    node.classList.add(`hp-counter-${COUNTERS[p.style] ? p.style : 'odometer'}`);
    node.style.setProperty('--tint', hex(p.color, '#39ff6a'));
    const views = Math.max(0, Number(ctx.views) || 0);
    const digits = document.createElement('span');
    digits.className = 'hp-digits';
    for (const d of String(views).padStart(6, '0')) {
      const s = document.createElement('span');
      s.textContent = d;
      digits.append(s);
    }
    const label = document.createElement('span');
    label.className = 'hp-count-label';
    label.textContent = p.label || '';
    node.append(inside(digits, label));
  }

  // What's in a piece that sizes itself by the piece (see "container" in homepage.css): in a
  // box of its own, since a piece can't size its own spacing that way.
  function inside(...kids) {
    const box = document.createElement('div');
    box.className = 'hp-in';
    box.append(...kids);
    return box;
  }

  // The guestbook: what visitors wrote, newest first, and a way to sign it. (The entries come
  // from the server when the page is shown; see lib/homepages.js.)
  function guestbookPiece(node, p, ctx) {
    node.classList.add(`hp-guestbook-${GUESTBOOKS[p.style] ? p.style : 'paper'}`);
    const c = hex(p.color, '#fffdf6');
    node.style.setProperty('--gb', c);
    node.style.setProperty('--gb-ink', light(c) ? '#2b2233' : '#f6f2fb');
    const f = FONTS[p.font] || FONTS.hand;
    const title = document.createElement('div');
    title.className = 'hp-gb-title';
    title.style.fontFamily = f.css;
    title.textContent = p.title || '';
    const list = document.createElement('ol');
    list.className = 'hp-gb-list';
    const foot = document.createElement('div');
    foot.className = 'hp-gb-foot';
    node.append(title, list, foot);
    if (ctx.edit) {
      const li = document.createElement('li');
      li.className = 'hp-gb-empty';
      li.textContent = 'What visitors write shows up here.';
      list.append(li);
      return;
    }
    loadGuestbook(node, ctx);
  }

  const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

  // The page owner's guestbook or question box, on the server.
  async function ownerCall(ctx, what, method = 'GET', path = '', body) {
    const res = await fetch(`/api/homepages/${encodeURIComponent(ctx.owner.id)}/${what}${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }
  const guestbookCall = (ctx, ...rest) => ownerCall(ctx, 'guestbook', ...rest);
  const questionsCall = (ctx, ...rest) => ownerCall(ctx, 'questions', ...rest);

  async function loadGuestbook(node, ctx, data = null) {
    const list = node.querySelector('.hp-gb-list');
    const foot = node.querySelector('.hp-gb-foot');
    try {
      data = data || (await guestbookCall(ctx));
    } catch {
      return;
    }
    list.replaceChildren(...data.entries.map((e) => {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'hp-gb-who';
      who.append(avatarEl(e.author), document.createTextNode(e.author.displayName));
      const when = document.createElement('time');
      when.dateTime = new Date(e.at).toISOString();
      when.textContent = shortDate(e.at);
      const words = document.createElement('p');
      words.textContent = e.text;
      li.append(who, when, words);
      if (e.canDelete) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'hp-gb-delete';
        x.textContent = '×';
        x.title = 'Delete this';
        x.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!x.dataset.sure) {
            x.dataset.sure = '1';
            x.textContent = 'Delete?';
            return;
          }
          try {
            loadGuestbook(node, ctx, await guestbookCall(ctx, 'DELETE', `/${e.id}`));
          } catch (err) {
            x.textContent = '×';
          }
        });
        li.append(x);
      }
      return li;
    }));
    if (!data.entries.length) {
      const li = document.createElement('li');
      li.className = 'hp-gb-empty';
      li.textContent = 'Nobody has signed it yet.';
      list.append(li);
    }
    foot.replaceChildren();
    if (data.canSign) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hp-gb-sign';
      b.textContent = 'Sign it';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openSign(node, ctx);
      });
      foot.append(b);
    } else if (!data.signedIn) {
      const a = document.createElement('a');
      a.className = 'hp-gb-sign';
      a.href = `/?homepage=${encodeURIComponent(`@${ctx.owner.username}`)}`;
      a.textContent = 'Sign in to sign it';
      foot.append(a);
    }
  }

  // Writing in someone's guestbook.
  function openSign(node, ctx) {
    let d = document.getElementById('hp-sign');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'hp-sign';
      d.className = 'hp-sign';
      const form = document.createElement('form');
      const h = document.createElement('h2');
      const box = document.createElement('textarea');
      box.maxLength = 300;
      box.rows = 4;
      box.required = true;
      box.placeholder = 'say hi!';
      const error = document.createElement('p');
      error.className = 'hp-sign-error';
      error.hidden = true;
      const row = document.createElement('div');
      row.className = 'hp-sign-row';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'hp-sign-cancel';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => d.close());
      const send = document.createElement('button');
      send.type = 'submit';
      send.className = 'hp-sign-send';
      send.textContent = 'Sign it';
      row.append(cancel, send);
      form.append(h, box, error, row);
      d.append(form);
      document.body.append(d);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { node: target, ctx: c } = d.for;
        send.disabled = true;
        try {
          const data = await guestbookCall(c, 'POST', '', { text: box.value });
          d.close();
          loadGuestbook(target, c, data);
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        } finally {
          send.disabled = false;
        }
      });
    }
    d.for = { node, ctx };
    d.querySelector('h2').textContent = `Sign ${ctx.owner.displayName}'s guestbook`;
    d.querySelector('textarea').value = '';
    d.querySelector('.hp-sign-error').hidden = true;
    d.showModal();
    d.querySelector('textarea').focus();
  }

  // The "ask me anything" box: questions visitors asked and the owner's answers, the newest
  // answers first, and a way to ask one. Its owner also sees the questions waiting for an answer
  // (first), to answer, delete or report; whoever asked one sees their own until it's answered.
  // (They come from the server when the page is shown; see lib/homepages.js.)
  function askPiece(node, p, ctx) {
    node.classList.add(`hp-ask-${ASKS[p.style] ? p.style : 'paper'}`);
    const c = hex(p.color, '#fffdf6');
    node.style.setProperty('--gb', c);
    node.style.setProperty('--gb-ink', light(c) ? '#2b2233' : '#f6f2fb');
    const title = document.createElement('div');
    title.className = 'hp-gb-title';
    title.style.fontFamily = (FONTS[p.font] || FONTS.hand).css;
    title.textContent = p.title || '';
    const list = document.createElement('ol');
    list.className = 'hp-gb-list hp-ask-list';
    const foot = document.createElement('div');
    foot.className = 'hp-gb-foot';
    node.append(title, list, foot);
    if (ctx.edit) {
      const li = document.createElement('li');
      li.className = 'hp-gb-empty';
      li.textContent = 'Questions you answer show up here.';
      list.append(li);
      return;
    }
    loadQuestions(node, ctx);
  }

  async function loadQuestions(node, ctx, data = null) {
    const list = node.querySelector('.hp-ask-list');
    const foot = node.querySelector('.hp-gb-foot');
    try {
      data = data || (await questionsCall(ctx));
    } catch {
      return;
    }
    list.replaceChildren(...data.questions.map((q) => questionItem(q, node, ctx, data)));
    if (!data.questions.length) {
      const li = document.createElement('li');
      li.className = 'hp-gb-empty';
      li.textContent = data.mine ? 'No questions yet. When someone asks you one, it shows up here for you to answer.' : 'Nothing answered yet.';
      list.append(li);
    }
    foot.replaceChildren();
    if (data.canAsk) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hp-gb-sign';
      b.textContent = 'Ask something';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openAsk(node, ctx, data);
      });
      foot.append(b);
    } else if (!data.signedIn) {
      const a = document.createElement('a');
      a.className = 'hp-gb-sign';
      a.href = `/?homepage=${encodeURIComponent(`@${ctx.owner.username}`)}`;
      a.textContent = 'Sign in to ask';
      foot.append(a);
    }
  }

  // One question: who asked (or "anonymous"), when, what, and the answer. What you can do with it
  // under it (its owner: answer or change the answer, or report it; whoever asked: see that it's
  // waiting), and a × to delete it.
  function questionItem(q, node, ctx, data) {
    const li = document.createElement('li');
    li.className = `hp-ask-item${q.answeredAt ? '' : ' hp-ask-waiting'}`;
    const who = document.createElement('span');
    who.className = 'hp-gb-who';
    if (q.asker) {
      who.append(avatarEl(q.asker), document.createTextNode(q.yours ? `${q.asker.displayName} (you)` : q.asker.displayName));
    } else {
      const face = document.createElement('span');
      face.className = 'hp-avatar hp-anon';
      face.textContent = '?';
      who.append(face, document.createTextNode(q.yours ? 'you, anonymously' : 'anonymous'));
    }
    const when = document.createElement('time');
    when.dateTime = new Date(q.at).toISOString();
    when.textContent = shortDate(q.at);
    const text = document.createElement('p');
    text.className = 'hp-ask-q';
    text.textContent = q.text;
    li.append(who, when, text);
    if (q.answeredAt) {
      const answer = document.createElement('p');
      answer.className = 'hp-ask-a';
      answer.textContent = q.answer;
      li.append(answer);
    }
    const tools = document.createElement('div');
    tools.className = 'hp-ask-tools';
    const tool = (label, onClick, main = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `hp-ask-tool${main ? ' main' : ''}`;
      b.textContent = label;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick();
      });
      return b;
    };
    if (data.mine) {
      tools.append(tool(q.answeredAt ? 'Change answer' : 'Answer', () => openAnswer(node, ctx, q), !q.answeredAt));
      // (In the app: see "Reporting" in public/app.js.)
      if (!q.answeredAt && ctx.report) {
        tools.append(tool('Report', () => ctx.report({
          questionId: q.id, anonymous: q.anonymous, userId: q.asker ? q.asker.id : null, name: q.asker ? q.asker.displayName : 'whoever asked it',
        })));
      }
    } else if (q.yours && !q.answeredAt) {
      const wait = document.createElement('span');
      wait.className = 'hp-ask-wait';
      wait.textContent = 'Waiting for an answer';
      tools.append(wait);
    }
    if (tools.childNodes.length) li.append(tools);
    if (q.canDelete) li.append(deleteButton(async () => loadQuestions(node, ctx, await questionsCall(ctx, 'DELETE', `/${q.id}`))));
    return li;
  }

  // A × that asks "Delete?" first.
  function deleteButton(onSure) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'hp-gb-delete';
    x.textContent = '×';
    x.title = 'Delete this';
    x.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!x.dataset.sure) {
        x.dataset.sure = '1';
        x.textContent = 'Delete?';
        return;
      }
      try {
        await onSure();
      } catch {
        x.textContent = '×';
        delete x.dataset.sure;
      }
    });
    return x;
  }

  function openAsk(node, ctx, data) {
    const name = ctx.owner.displayName;
    openWrite({
      title: `Ask ${name} something`,
      placeholder: 'what do you want to know?',
      max: 300,
      button: 'Ask',
      check: data.anon ? {
        label: 'Ask anonymously',
        on: `${name} won't find out it was you (if it's reported, whoever runs the server can). It shows on their page if they answer it.`,
        off: `${name} will see it's from you. It shows on their page, with your name, if they answer it.`,
      } : null,
      note: `${name} will see it's from you (they don't take anonymous questions). It shows on their page, with your name, if they answer it.`,
      send: async (text, anonymous) => loadQuestions(node, ctx, await questionsCall(ctx, 'POST', '', { text, anonymous: Boolean(data.anon && anonymous) })),
    });
  }

  function openAnswer(node, ctx, q) {
    openWrite({
      title: q.answeredAt ? 'Change your answer' : 'Answer it',
      quote: q.text,
      placeholder: 'your answer',
      max: 1000,
      rows: 5,
      value: q.answer || '',
      button: q.answeredAt ? 'Save' : 'Answer',
      note: q.answeredAt ? '' : `Your answer shows on your page with the question${q.asker ? ` (and ${q.asker.displayName}'s name)` : ''}, for everyone who can see it.`,
      send: async (text) => loadQuestions(node, ctx, await questionsCall(ctx, 'PUT', `/${q.id}`, { answer: text })),
    });
  }

  // Writing something for a page, in a box over it: a question for someone's box, or its owner's
  // answer. o: { title, quote, placeholder, max, rows, value, button, note, send(text, checked),
  // and check: a tick box (its label, and the note with it ticked and not) or null }.
  function openWrite(o) {
    let d = document.getElementById('hp-write');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'hp-write';
      d.className = 'hp-sign hp-write';
      const form = document.createElement('form');
      const h = document.createElement('h2');
      const quote = document.createElement('blockquote');
      quote.className = 'hp-write-quote';
      const box = document.createElement('textarea');
      box.required = true;
      const check = document.createElement('label');
      check.className = 'hp-write-check';
      const tick = document.createElement('input');
      tick.type = 'checkbox';
      check.append(tick, document.createElement('span'));
      const note = document.createElement('p');
      note.className = 'hp-write-note';
      const error = document.createElement('p');
      error.className = 'hp-sign-error';
      error.hidden = true;
      const row = document.createElement('div');
      row.className = 'hp-sign-row';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'hp-sign-cancel';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => d.close());
      const send = document.createElement('button');
      send.type = 'submit';
      send.className = 'hp-sign-send';
      row.append(cancel, send);
      form.append(h, quote, box, check, note, error, row);
      d.append(form);
      document.body.append(d);
      const noteText = () => {
        const c = d.opts.check;
        note.textContent = c ? (tick.checked ? c.on : c.off) : d.opts.note || '';
        note.hidden = !note.textContent;
      };
      d.noteText = noteText;
      tick.addEventListener('change', noteText);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        send.disabled = true;
        try {
          await d.opts.send(box.value, tick.checked);
          d.close();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        } finally {
          send.disabled = false;
        }
      });
    }
    d.opts = o;
    d.querySelector('h2').textContent = o.title;
    const quote = d.querySelector('.hp-write-quote');
    quote.textContent = o.quote || '';
    quote.hidden = !o.quote;
    const box = d.querySelector('textarea');
    box.maxLength = o.max;
    box.rows = o.rows || 4;
    box.placeholder = o.placeholder || '';
    box.value = o.value || '';
    const check = d.querySelector('.hp-write-check');
    check.hidden = !o.check;
    check.querySelector('input').checked = false;
    check.querySelector('span').textContent = o.check ? o.check.label : '';
    d.noteText();
    d.querySelector('.hp-sign-error').hidden = true;
    d.querySelector('.hp-sign-send').textContent = o.button;
    d.showModal();
    box.focus();
  }

  // The music player: the owner's song, when a visitor presses play (never by itself), over and over.
  // Only one plays at a time.
  function musicPiece(node, p, ctx) {
    node.classList.add(`hp-music-${MUSICS[p.style] ? p.style : 'tunebox'}`);
    node.style.setProperty('--tint', hex(p.color, '#a57bff'));
    const audio = document.createElement('audio');
    audio.preload = 'none';
    audio.loop = true;
    audio.src = ctx.fileUrl(p.file);
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'hp-play';
    play.setAttribute('aria-label', 'Play');
    const title = document.createElement('span');
    title.className = 'hp-song';
    const words = document.createElement('span');
    words.textContent = p.title || 'a song';
    title.append(words);
    const bars = document.createElement('span');
    bars.className = 'hp-bars';
    bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) bars.append(document.createElement('i'));
    if (p.style === 'cassette') {
      const reels = document.createElement('span');
      reels.className = 'hp-reels';
      reels.setAttribute('aria-hidden', 'true');
      reels.append(document.createElement('i'), document.createElement('i'));
      node.append(inside(title, reels, play), audio);
    } else {
      node.append(inside(play, title, bars), audio);
    }
    play.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audio.paused) {
        for (const other of document.querySelectorAll('.hp-music audio')) if (other !== audio) other.pause();
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });
    audio.addEventListener('play', () => {
      node.classList.add('hp-playing');
      play.setAttribute('aria-label', 'Pause');
    });
    audio.addEventListener('pause', () => {
      node.classList.remove('hp-playing');
      play.setAttribute('aria-label', 'Play');
    });
  }

  // A shelf: covers standing on it (each as tall as the shelf lets it be, in its own shape), with
  // their names on tags underneath.
  function shelfPiece(node, p, ctx) {
    node.classList.add(`hp-shelf-${SHELVES[p.style] ? p.style : 'wood'}`);
    node.classList.toggle('hp-no-tags', p.labels === false);
    const row = document.createElement('div');
    row.className = 'hp-shelf-row';
    for (const it of p.items || []) {
      const item = document.createElement(it.href && !ctx.edit ? 'a' : 'span');
      item.className = 'hp-shelf-item';
      if (item.tagName === 'A') {
        item.href = it.href;
        item.target = '_blank';
        item.rel = 'noopener noreferrer nofollow ugc';
      }
      const cover = document.createElement('span');
      cover.className = 'hp-cover';
      const img = document.createElement('img');
      img.src = ctx.fileUrl(it.file);
      img.alt = it.title || '';
      img.draggable = false;
      img.loading = 'lazy';
      cover.append(img);
      const tag = document.createElement('span');
      tag.className = 'hp-tag';
      tag.textContent = it.title || '';
      if (it.title) item.title = it.title;
      item.append(cover, tag);
      row.append(item);
    }
    if (!(p.items || []).length && ctx.edit) {
      const hint = document.createElement('span');
      hint.className = 'hp-shelf-hint';
      hint.textContent = 'Pick the shelf to put things on it';
      row.append(hint);
    }
    const plank = document.createElement('span');
    plank.className = 'hp-plank';
    node.append(inside(row, plank));
  }

  // An 88x31 button, the little badges old sites linked to each other with.
  function buttonPiece(node, p) {
    node.classList.add(`hp-button-${BUTTONS[p.style] ? p.style : 'bevel'}`);
    node.style.setProperty('--b1', hex(p.c1, '#000080'));
    node.style.setProperty('--b2', hex(p.c2, '#ffffff'));
    const kids = [];
    if (p.icon && PIXEL[p.icon]) {
      const img = document.createElement('img');
      img.className = 'hp-pixel';
      img.src = pixelSrc(p.icon);
      img.alt = '';
      img.draggable = false;
      kids.push(img);
    }
    const text = String(p.text || '');
    if (text.trim()) {
      const words = document.createElement('span');
      words.className = `hp-button-words${text.includes('\n') ? ' two' : ''}`;
      words.style.fontFamily = (FONTS[p.font] || FONTS.tiny).css;
      words.textContent = text;
      kids.push(words);
    }
    node.append(inside(...kids));
  }

  // Everything playing on the page stops (it's closing, or being drawn again).
  function hush(page) {
    for (const a of page.querySelectorAll('audio')) a.pause();
  }

  const DRAW = {
    text: textPiece, image: imagePiece, sticker: stickerPiece, tape: tapePiece, paper: paperPiece, me: mePiece,
    counter: counterPiece, guestbook: guestbookPiece, music: musicPiece, shelf: shelfPiece, button: buttonPiece,
    ask: askPiece,
  };

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

  // Draws a page into `page` (an element that scrolls): its background, the weather, and a
  // canvas with its pieces, scaled to fit. Returns { doc, canvas, fit }. (opts: edit, and in the
  // app, report(what), to report a question in your own box.)
  function mount(page, data, opts = {}) {
    const doc = data.doc || starter();
    const ctx = { owner: data.owner || {}, views: data.views || 0, fileUrl: (id) => `/homepage-files/${id}`, edit: Boolean(opts.edit), report: opts.report || null };
    hush(page);
    page.replaceChildren();
    page.classList.add('hp-page');
    Object.assign(page.style, backgroundStyle(doc.bg, ctx.fileUrl));
    // The weather and the pieces, one over the other: the weather stays in view as the page
    // scrolls, over all of it and behind everything on it. Paper and pictures cover it, as they
    // cover the background, and see-through tape shows a bit of both.
    const room = document.createElement('div');
    room.className = 'hp-room';
    const sky = document.createElement('div');
    setSky(sky, doc.bg && doc.bg.sky);
    const stage = document.createElement('div');
    stage.className = 'hp-stage';
    const canvas = document.createElement('div');
    canvas.className = 'hp-canvas';
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${doc.height}px`;
    const turns = new Map();
    for (const p of doc.pieces || []) {
      canvas.append(pieceEl(p, ctx));
      turns.set(p.id, ((p.r || 0) * Math.PI) / 180);
    }
    stage.append(canvas);
    room.append(sky, stage);
    page.append(room);
    // Pieces can reach past the page's 800px (and above or below it). On a screen wide enough,
    // the page is centered as it was made, with those showing around it. On a narrower one,
    // everything is shown: all of it, scaled down to fit. (Times the zoom, from pinching.)
    const reach = () => {
      const b = { left: 0, right: WIDTH, top: 0, bottom: doc.height };
      for (const node of canvas.children) {
        const a = turns.get(node.dataset.id) || 0;
        const w = node.offsetWidth, h = node.offsetHeight;
        const hw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
        const hh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
        const cx = node.offsetLeft + w / 2, cy = node.offsetTop + h / 2;
        b.left = Math.min(b.left, cx - hw);
        b.right = Math.max(b.right, cx + hw);
        b.top = Math.min(b.top, cy - hh);
        b.bottom = Math.max(b.bottom, cy + hh);
      }
      return b;
    };
    // (A page opens at its fitted size.)
    page.hpZoom = 1;
    if (page.hpBack) page.hpBack.hidden = true;
    const fit = () => {
      const b = reach();
      const avail = page.clientWidth || WIDTH;
      const past = Math.max(-b.left, b.right - WIDTH);
      let s = 1, width = WIDTH + 2 * past, left = past;
      if (avail < width) {
        width = b.right - b.left;
        left = -b.left;
        s = Math.min(1, avail / width);
      }
      s *= page.hpZoom || 1;
      canvas.style.transform = `translate(${left * s}px, ${-b.top * s}px) scale(${s})`;
      stage.style.width = `${width * s}px`;
      stage.style.height = `${(b.bottom - b.top) * s}px`;
      sky.style.width = `${page.clientWidth}px`;
      sky.style.height = `${page.clientHeight}px`;
      page.style.setProperty('--hp-scale', String(s));
      page.classList.toggle('hp-zoomed', (page.hpZoom || 1) > 1);
      return s;
    };
    page.hpFit = opts.edit ? null : fit; // (for zooming; not while it's being edited)
    zoomable(page);
    fit();
    return { doc, canvas, ctx, fit };
  }

  // Zooming a page: two fingers (up to 4 times), or a double tap (in, or back out). The
  // browser's own zoom is off in the Android app, and this zooms the page under its bar rather
  // than everything. "Fit" puts it back.
  function zoomable(page) {
    if (page.hpZoomable) return;
    page.hpZoomable = true;
    page.hpZoom = page.hpZoom || 1;
    const frame = page.parentElement;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'hp-unzoom';
    back.textContent = 'Fit';
    back.title = 'Back to the whole page';
    back.hidden = true;
    if (frame) frame.append(back);
    page.hpBack = back;
    const stageOf = () => page.querySelector('.hp-stage');
    // Zooms to z, keeping the spot at (x, y) (in the page's box) where it is.
    const zoomTo = (z, x, y) => {
      const stage = stageOf();
      if (!page.hpFit || !stage) return;
      const s0 = Number(page.style.getPropertyValue('--hp-scale')) || 1;
      const px = (page.scrollLeft + x - stage.offsetLeft) / s0;
      const py = (page.scrollTop + y - stage.offsetTop) / s0;
      page.hpZoom = Math.min(4, Math.max(1, z));
      const s1 = page.hpFit();
      page.scrollLeft = px * s1 + stage.offsetLeft - x;
      page.scrollTop = py * s1 + stage.offsetTop - y;
      back.hidden = page.hpZoom <= 1;
    };
    back.addEventListener('click', () => zoomTo(1, page.clientWidth / 2, page.clientHeight / 2));
    let pinch = null;
    let tap = null;
    const point = (t) => {
      const r = page.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    page.addEventListener('touchstart', (e) => {
      if (!page.hpFit) return;
      if (e.touches.length === 2) {
        const [a, b] = [point(e.touches[0]), point(e.touches[1])];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: page.hpZoom };
        tap = null;
      } else if (e.touches.length === 1) {
        const p = point(e.touches[0]);
        const now = Date.now();
        if (tap && now - tap.at < 300 && Math.hypot(p.x - tap.x, p.y - tap.y) < 30) {
          e.preventDefault();
          zoomTo(page.hpZoom > 1 ? 1 : 2.5, p.x, p.y);
          tap = null;
        } else {
          tap = { ...p, at: now };
        }
      }
    }, { passive: false });
    page.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2 || !page.hpFit) return;
      e.preventDefault();
      const [a, b] = [point(e.touches[0]), point(e.touches[1])];
      zoomTo((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }, { passive: false });
    page.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
    page.addEventListener('touchcancel', () => { pinch = null; });
  }

  // The weather on a page (behind its pieces).
  function setSky(sky, kind) {
    sky.className = `hp-sky hp-sky-${SKIES[kind] ? kind : 'none'}`;
  }

  window.Homepage = {
    WIDTH, FONTS, EFFECTS, BOXES, FRAMES, TAPES, PAPERS, ME_STYLES, PATTERNS, SKIES, PERKS, PIXEL, PIXEL_NAMES,
    COUNTERS, GUESTBOOKS, MUSICS, SHELVES, BUTTONS, ASKS,
    pixelSrc, pixelRatio, backgroundStyle, pieceEl, starter, mount, setSky, light, hush,
    // (someone signed a guestbook, or asked or answered a question, that's showing: read it again)
    reloadGuestbooks: (page, ctx) => { for (const n of page.querySelectorAll('.hp-guestbook')) loadGuestbook(n, ctx); },
    reloadQuestions: (page, ctx) => { for (const n of page.querySelectorAll('.hp-ask')) loadQuestions(n, ctx); },
  };
})();
