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
  const PATTERNS = {
    dots: 'Polka dots', stripes: 'Stripes', checks: 'Checks', gingham: 'Gingham', grid: 'Grid', hearts: 'Hearts', stars: 'Stars', flowers: 'Flowers', zigzag: 'Zigzag', clouds: 'Clouds',
    starfield: 'Starfield', bokeh: 'Bokeh', holo: 'Holo', waves: 'Waves',
  };
  const SKIES = { none: 'Nothing', rain: 'Rain', snow: 'Snow', sparkles: 'Sparkles', hearts: 'Floating hearts', fireflies: 'Fireflies', aurora: 'Aurora', storm: 'Thunderstorm', blossoms: 'Cherry blossoms' };
  const TRAILS = { none: 'Nothing', sparkles: 'Sparkles', hearts: 'Hearts', stars: 'Stars', bubbles: 'Bubbles', raindrops: 'Raindrops' };
  const CLICKS = { none: 'Nothing', confetti: 'Confetti', hearts: 'Hearts', stars: 'Stars', ripples: 'Ripples' };
  // Glow's extras (lib/homepages.js): anyone can see them on a page, people with Glow can use them.
  const PERKS = {
    fx: ['shimmer', 'lamplight'], frame: ['gilded', 'neon'], sky: ['fireflies', 'aurora', 'storm', 'blossoms'],
    pattern: ['starfield', 'bokeh', 'holo', 'waves'], trail: ['sparkles', 'hearts', 'stars', 'bubbles', 'raindrops'],
    click: ['confetti', 'hearts', 'stars', 'ripples'], pet: ['cloud', 'dragon', 'fox'], piece: ['fortune'],
  };

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

  // Glow's patterns move, in the page's two colours: stars drifting past (the brightest
  // twinkling), soft lights rising, a sheen like a hologram's, and waves. Each is a few layers
  // (these), that slide over each other behind the page (patternLayer, and homepage.css).
  const tile = (w, h, inner) => uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`);
  const soft = (id, c, a = 1) => `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${a}"/><stop offset=".45" stop-color="${c}" stop-opacity="${a * 0.55}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`;
  const spark = (x, y, r) => `<path d="M${x} ${y - r}Q${x + r * 0.14} ${y - r * 0.14} ${x + r} ${y}Q${x + r * 0.14} ${y + r * 0.14} ${x} ${y + r}Q${x - r * 0.14} ${y + r * 0.14} ${x - r} ${y}Q${x - r * 0.14} ${y - r * 0.14} ${x} ${y - r}Z"/>`;
  // (A colour some of the way to white, for the brightest lights.)
  function whiter(h, k) {
    const n = parseInt(hex(h, '#000000').slice(1), 16);
    const m = (v) => Math.round(v + (255 - v) * k);
    return `rgb(${m(n >> 16)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
  }
  const MOVING = {
    starfield: (a, b) => [
      tile(240, 240, `<g fill="${b}">${[[18, 30, 1.3, 1], [64, 12, 0.8, 0.7], [110, 52, 1.1, 0.9], [168, 20, 1.5, 1], [214, 66, 0.9, 0.6], [36, 96, 0.8, 0.8], [92, 130, 1.6, 1], [150, 104, 0.9, 0.7], [200, 150, 1.2, 0.9], [20, 170, 1.4, 1], [70, 208, 0.9, 0.6], [128, 188, 1.1, 0.8], [182, 222, 0.8, 0.7], [226, 200, 1.3, 1]].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}"/>`).join('')}</g>`),
      tile(330, 330, `${soft('g', whiter(b, 0.45))}${[[40, 50, 7], [146, 214, 8], [262, 92, 6], [300, 286, 7], [96, 312, 5], [210, 20, 5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#g)"/><circle cx="${x}" cy="${y}" r="${r / 5}" fill="${whiter(b, 0.8)}"/>`).join('')}`),
      tile(380, 380, `<g fill="${whiter(b, 0.4)}">${spark(60, 80, 7)}${spark(250, 300, 9)}${spark(314, 64, 5)}${spark(120, 250, 5)}</g>`),
    ],
    bokeh: (a, b) => [
      tile(320, 320, `${soft('a', b, 0.42)}<g fill="url(#a)"><circle cx="60" cy="70" r="48"/><circle cx="222" cy="40" r="32"/><circle cx="250" cy="222" r="60"/><circle cx="108" cy="252" r="36"/></g>`),
      tile(240, 240, `${soft('b', whiter(b, 0.35), 0.38)}<g fill="url(#b)"><circle cx="40" cy="190" r="24"/><circle cx="150" cy="80" r="30"/><circle cx="204" cy="172" r="17"/><circle cx="88" cy="30" r="15"/></g>`),
      tile(200, 200, `${soft('c', whiter(b, 0.7), 0.9)}<g fill="url(#c)"><circle cx="30" cy="60" r="8"/><circle cx="142" cy="30" r="6"/><circle cx="170" cy="150" r="9"/><circle cx="80" cy="172" r="6"/></g>`),
    ],
    holo: (a, b) => [
      `linear-gradient(115deg, ${a} 0%, ${b} 12%, #ffc7ef 24%, #b9f2ff 36%, #fff3c4 48%, ${b} 60%, #d3bdff 72%, #b9f2ff 84%, ${a} 100%)`,
      'repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0 1px, transparent 1px 7px)',
      tile(200, 200, `<g fill="#ffffff">${spark(40, 60, 7)}${spark(150, 30, 5)}${spark(122, 152, 9)}</g>`),
    ],
    waves: (a, b) => [
      tile(240, 64, `<path d="M0 32Q30 14 60 32T120 32T180 32T240 32" fill="none" stroke="${b}" stroke-width="3" opacity=".75"/>`),
      tile(320, 64, `<path d="M0 32Q40 20 80 32T160 32T240 32T320 32" fill="none" stroke="${whiter(b, 0.3)}" stroke-width="2" opacity=".45"/>`),
    ],
  };

  // A moving pattern's layers, to go behind a page (or in a swatch of it). Null for the rest.
  function patternLayer(bg) {
    if (!bg || bg.kind !== 'pattern' || !MOVING[bg.pattern]) return null;
    const layer = document.createElement('div');
    layer.className = `hp-backdrop hp-bd-${bg.pattern}`;
    layer.setAttribute('aria-hidden', 'true');
    for (const image of MOVING[bg.pattern](hex(bg.c1, '#1d2440'), hex(bg.c2, '#2b3560'))) {
      const i = document.createElement('i');
      i.style.backgroundImage = image;
      layer.append(i);
    }
    return layer;
  }

  // A pattern as a swatch (moving, if it's one of those).
  function patternSwatch(pattern, c1, c2) {
    const bg = { kind: 'pattern', pattern, c1, c2 };
    const s = document.createElement('span');
    s.className = 'hp-pattern-swatch';
    Object.assign(s.style, backgroundStyle(bg));
    const layer = patternLayer(bg);
    if (layer) {
      s.style.backgroundImage = 'none';
      s.append(layer);
    }
    return s;
  }

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
        // (A moving one, standing still: its first layer.)
        if (MOVING[bg.pattern]) return { ...s, backgroundImage: MOVING[bg.pattern](a, b)[0] };
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

  // A fortune ball (one of Glow's): ask it something and click it, and an answer comes up out of
  // the mist. Its owner's answers, if they wrote some, or a forecast.
  const FORTUNES = [
    'The clouds say yes.', 'Clear skies: yes!', 'Absolutely.', 'The stars agree.', 'Yes, but bring an umbrella.',
    "It's looking bright.", 'All signs say go.', 'Probably!', 'Foggy... ask again.', 'The mist is thick. Try later.',
    'Ask me after the rain.', 'Hmm. Maybe.', "Can't see through the clouds.", 'Storm clouds say no.', 'Not today.',
    'Unlikely.', 'The winds say no.', 'Nope.', 'Definitely not.', 'Only if you believe.',
  ];
  function fortunePiece(node, p, ctx) {
    node.style.setProperty('--tint', hex(p.color, '#b98bff'));
    const ball = document.createElement('div');
    ball.className = 'hp-ball';
    const mist = document.createElement('span');
    mist.className = 'hp-ball-mist';
    const answer = document.createElement('span');
    answer.className = 'hp-ball-answer';
    answer.setAttribute('aria-live', 'polite');
    const shine = document.createElement('span');
    shine.className = 'hp-ball-shine';
    ball.append(mist, answer, shine);
    const stand = document.createElement('span');
    stand.className = 'hp-ball-stand';
    const label = document.createElement('span');
    label.className = 'hp-ball-label';
    label.textContent = p.label || '';
    node.append(inside(ball, stand, label));
    if (ctx.edit) return;
    const answers = p.answers && p.answers.length ? p.answers : FORTUNES;
    let last = -1;
    let timer = 0;
    ball.tabIndex = 0;
    ball.setAttribute('role', 'button');
    ball.setAttribute('aria-label', 'Ask the fortune ball');
    const ask = () => {
      clearTimeout(timer);
      answer.classList.remove('on');
      node.classList.remove('hp-asking');
      void node.offsetWidth; // (so it shakes again)
      node.classList.add('hp-asking');
      let i = Math.floor(Math.random() * answers.length);
      if (answers.length > 1 && i === last) i = (i + 1) % answers.length;
      last = i;
      timer = setTimeout(() => {
        node.classList.remove('hp-asking');
        answer.textContent = answers[i];
        answer.classList.add('on');
        timer = setTimeout(() => answer.classList.remove('on'), 9000);
      }, 950);
    };
    ball.addEventListener('click', (e) => {
      e.stopPropagation();
      ask();
    });
    ball.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ask();
      }
    });
  }

  // Everything playing on the page stops (it's closing, or being drawn again): its songs, its pet,
  // and its effects.
  function hush(page) {
    for (const a of page.querySelectorAll('audio')) a.pause();
    if (page.hpPet) page.hpPet.stop();
    if (page.hpFx) page.hpFx.stop();
  }

  const DRAW = {
    text: textPiece, image: imagePiece, sticker: stickerPiece, tape: tapePiece, paper: paperPiece, me: mePiece,
    counter: counterPiece, guestbook: guestbookPiece, music: musicPiece, shelf: shelfPiece, button: buttonPiece,
    ask: askPiece, fortune: fortunePiece,
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

  // ---------- Pets ----------
  // A page can have a pet living on it (lib/homepages.js keeps how fed and happy it is). It wanders
  // about the part of the page that's showing (and comes along when it's scrolled), sits, naps,
  // and comes over to see what the pointer's up to; petted, it hops and hearts come up. Its owner
  // looks after it: hungry, it mopes about (slowly, thinking of food) until they feed it, and
  // playing with it makes it happy. It never gets ill or runs away. Everyone has three kinds to
  // pick from, and Glow three more, each in a few colours.

  const PETS = {
    cat: {
      label: 'Cat', name: 'Mochi', food: 'fish', speed: 52,
      coats: {
        ginger: { label: 'Ginger', p1: '#f6a95c', p2: '#fff1dc', p3: '#e07f35', p5: '#d98b46' },
        grey: { label: 'Grey', p1: '#a8b0c2', p2: '#eef0f6', p3: '#7f889c', p5: '#8e96aa' },
        black: { label: 'Black', p1: '#3d3548', p2: '#5a526c', p3: '#4d455c', p4: '#ff9fbd', p5: '#2f2939', pe: '#ffd84d' },
        snowy: { label: 'Snowy', p1: '#fffaf2', p2: '#ffffff', p3: '#f1dcc0', p5: '#e9dfcf' },
      },
    },
    pup: {
      label: 'Pup', name: 'Biscuit', food: 'bone', speed: 62,
      coats: {
        tan: { label: 'Tan', p1: '#e2ad74', p2: '#fff3e2', p3: '#a8693c', p5: '#c8925a' },
        brown: { label: 'Brown', p1: '#a06c49', p2: '#efd6b8', p3: '#5e3a24', p5: '#855638' },
        spotty: { label: 'Spotty', p1: '#fbf8f3', p2: '#ffffff', p3: '#3d3548', p5: '#e3dbcf' },
        smoky: { label: 'Smoky', p1: '#959cae', p2: '#eceef4', p3: '#565d70', p5: '#7d8497' },
      },
    },
    frog: {
      label: 'Frog', name: 'Puddle', food: 'fly', speed: 0, hops: true,
      coats: {
        green: { label: 'Green', p1: '#83d672', p2: '#effab9', p3: '#58ad50', p5: '#6cbf5f' },
        blue: { label: 'Blue', p1: '#7ccaf6', p2: '#e4f6ff', p3: '#4094d0', p5: '#62b2e2' },
        pink: { label: 'Pink', p1: '#ffaad1', p2: '#ffeaf4', p3: '#e768a7', p5: '#ef8fbd' },
        gold: { label: 'Gold', p1: '#ffd555', p2: '#fff7cc', p3: '#e3a621', p5: '#efbf3b' },
      },
    },
    cloud: {
      label: 'Cloudlet', name: 'Nimbus', food: 'drop', speed: 34, floats: true, glow: true,
      coats: {
        day: { label: 'Fair', p1: '#ffffff', p2: '#d6e4fb', p3: '#7fd0ff', pg: '#bfe6ff' },
        dusk: { label: 'Dusk', p1: '#efe6ff', p2: '#cdbaf4', p3: '#b99bff', pg: '#d9c7ff' },
        storm: { label: 'Stormy', p1: '#bcc3d4', p2: '#8f99b0', p3: '#7aa2ff', pg: '#a5bcff' },
        candy: { label: 'Candy', p1: '#ffe0ee', p2: '#ffb9d9', p3: '#ff8cc6', pg: '#ffc6e3' },
      },
    },
    dragon: {
      label: 'Dragon', name: 'Ember', food: 'coal', speed: 46, glow: true,
      coats: {
        jade: { label: 'Jade', p1: '#63d6ab', p2: '#fff1b8', p3: '#35a582', p4: '#fff6dc', p5: '#4fbf95', pg: '#8dffd2' },
        violet: { label: 'Violet', p1: '#ab85ff', p2: '#ffe2f2', p3: '#7a50dc', p4: '#fff3d6', p5: '#9570eb', pg: '#d0b0ff' },
        ruby: { label: 'Ruby', p1: '#f25869', p2: '#ffdba6', p3: '#b32b43', p4: '#fff1d6', p5: '#d8475a', pg: '#ffa0ab' },
        gold: { label: 'Gold', p1: '#ffcb52', p2: '#fff6d4', p3: '#df9420', p4: '#fffbeb', p5: '#efb33d', pg: '#ffe38f' },
      },
    },
    fox: {
      label: 'Spirit fox', name: 'Wisp', food: 'berry', speed: 66, glow: true,
      coats: {
        snow: { label: 'Snow', p1: '#f7f4ff', p2: '#ffffff', p3: '#cfc6ee', p4: '#ffc2da', p5: '#e2dcf5', pg: '#8fd8ff' },
        ember: { label: 'Ember', p1: '#ff9552', p2: '#fff2e4', p3: '#d9602a', p4: '#ffc4a8', p5: '#e8803f', pg: '#ffd84d' },
        twilight: { label: 'Twilight', p1: '#9689ff', p2: '#eeeaff', p3: '#6b5be0', p4: '#ffc8ee', p5: '#8274ec', pg: '#ff9ce8' },
        frost: { label: 'Frost', p1: '#c6edff', p2: '#ffffff', p3: '#8ecbe9', p4: '#ffd0e4', p5: '#a9dbf2', pg: '#7efaff' },
      },
    },
  };
  const PET_INK = { pk: '#2a1f33', pe: '#2a1f33', p4: '#ffb3c6', p5: '#cccccc', pg: '#ffffff' };

  // The pets, drawn facing right in a box 120 wide and 100 tall, their feet at its bottom. Parts
  // that move have names (see "Pets" in homepage.css): legs (the a pair steps as the b pair
  // lifts), the tail, the head, and eyes open (.pt-eyes), shut (.pt-shut) and smiling (.pt-joy).
  // .pt-up is everything above the legs, which comes down when it lies down.
  const face = (x, y, apart, eye = 4.4) => {
    const l = x - apart / 2;
    const r = x + apart / 2;
    const open = (cx) => `<ellipse class="fe" cx="${cx}" cy="${y}" rx="${(eye * 0.8).toFixed(2)}" ry="${eye}"/><circle class="fw" cx="${(cx + eye * 0.32).toFixed(2)}" cy="${(y - eye * 0.36).toFixed(2)}" r="${(eye * 0.34).toFixed(2)}"/>`;
    return `<g class="pt-eyes">${open(l)}${open(r)}</g>`
      + `<g class="pt-shut"><path class="ln" d="M${l - 4} ${y + 0.5}q4 3.2 8 0M${r - 4} ${y + 0.5}q4 3.2 8 0"/></g>`
      + `<g class="pt-joy"><path class="ln" d="M${l - 4} ${y + 1.8}q4-5 8 0M${r - 4} ${y + 1.8}q4-5 8 0"/></g>`
      + `<ellipse class="fb" cx="${l - 5}" cy="${y + 7}" rx="4.2" ry="2.5"/><ellipse class="fb" cx="${r + 5}" cy="${y + 7}" rx="4.2" ry="2.5"/>`;
  };
  // Four legs: the far pair (in shadow) and the near pair.
  const legs = ([fb, ff], [nb, nf], y, h, fw, nw) => [[fb, 'b', 'fs', fw, 0], [ff, 'a', 'fs', fw, 0], [nb, 'a', 'f1', nw, 1], [nf, 'b', 'f1', nw, 1]]
    .map(([x, pair, fill, w, down]) => `<g class="leg ${pair}"><rect class="o ${fill}" x="${x}" y="${y + down}" width="${w}" height="${h}" rx="${w / 2}"/></g>`).join('');
  const tailOf = (d, ox, oy) => `<g class="pt-tail" style="transform-origin:${ox}px ${oy}px"><path class="tl-o" d="${d}"/><path class="tl-i" d="${d}"/></g>`;
  const PET_ART = {
    cat: () => `<g class="pt-up">${tailOf('M37 70C20 67 12 52 18 34', 37, 70)}</g>${legs([40, 74], [47, 81], 70, 25, 11, 12)}
<g class="pt-up pt-breathe"><ellipse class="o f1" cx="60" cy="66" rx="31" ry="19"/><ellipse class="f2" cx="64" cy="75" rx="18" ry="7"/><path class="st" d="M42 51q3 5 1 10M51 48.5q3 5 1 10M60 48q3 5 1 10"/>
<g class="pt-head"><path class="o f1" d="M67 33L69 10L85 24Z"/><path class="f4" d="M70.5 28.5L71.5 16.5L80 24Z"/><path class="o f1" d="M91 24L105 10L107 34Z"/><path class="f4" d="M95.5 24.5L102.5 17L103.5 29Z"/>
<ellipse class="o f1" cx="87" cy="45" rx="25" ry="21"/><path class="st" d="M87 25.5v6M80.5 27l1 5M93.5 27l-1 5"/>${face(87, 45, 18)}
<path class="fn" d="M85 50.5h4l-2 2.6z"/><path class="ln" d="M83.5 54.2q1.75 2.2 3.5 0q1.75 2.2 3.5 0"/><path class="wh" d="M63 49h-9M63.5 53.5l-8 2.5M111 49h9M110.5 53.5l8 2.5"/></g></g>`,
    pup: () => `<g class="pt-up">${tailOf('M36 62C26 58 22 49 25 40', 36, 62)}</g>${legs([39, 73], [46, 80], 70, 25, 12, 13)}
<g class="pt-up pt-breathe"><ellipse class="o f1" cx="60" cy="66" rx="31" ry="19"/><ellipse class="f2" cx="64" cy="76" rx="18" ry="6.5"/><ellipse class="f3" cx="46" cy="58" rx="9" ry="6.5"/>
<g class="pt-head"><ellipse class="o f1" cx="87" cy="45" rx="24" ry="21"/><ellipse class="f2" cx="88" cy="56" rx="12" ry="8.5"/>
<path class="o f3 pt-ear" d="M69 29C58 30 55 45 58 57C61 62 68 58 71 47Z"/><path class="o f3 pt-ear" d="M105 29C116 30 119 45 116 57C113 62 106 58 103 47Z"/>${face(87, 44, 18)}
<ellipse class="fk" cx="88" cy="51.5" rx="3.8" ry="2.7"/><path class="ln" d="M84.5 55.6q1.75 2.2 3.5 0q1.75 2.2 3.5 0"/><path class="o fn pt-tongue" d="M86.4 57q2.1 7.5 4.2 0z"/></g></g>`,
    frog: () => `<g class="leg-back"><path class="o fs" d="M44 84C28 88 20 78 28 69C34 63 46 68 50 78Z"/><path class="o fs" d="M22 94c-1-4 3-6 8-6h14c3 0 5 3 3 6Z"/></g>
<g class="pt-up pt-breathe"><ellipse class="o f1" cx="64" cy="71" rx="35" ry="23"/><ellipse class="f2 pt-throat" cx="72" cy="80" rx="21" ry="11"/>
<circle class="f3" cx="42" cy="62" r="4"/><circle class="f3" cx="50" cy="55" r="2.6"/><circle class="f3" cx="37" cy="73" r="2.4"/>
<g class="pt-head"><circle class="o f1" cx="59" cy="48" r="12.5"/><circle class="o f1" cx="87" cy="48" r="12.5"/>
<g class="pt-eyes"><circle class="fw" cx="59" cy="48" r="8.4"/><circle class="fe" cx="60.6" cy="49" r="4.8"/><circle class="fw" cx="62.2" cy="47" r="1.6"/><circle class="fw" cx="87" cy="48" r="8.4"/><circle class="fe" cx="88.6" cy="49" r="4.8"/><circle class="fw" cx="90.2" cy="47" r="1.6"/></g>
<g class="pt-shut"><path class="ln" d="M53 49q6 4 12 0M81 49q6 4 12 0"/></g><g class="pt-joy"><path class="ln" d="M53 51q6-6 12 0M81 51q6-6 12 0"/></g>
<ellipse class="fb" cx="54" cy="65" rx="4.4" ry="2.6"/><ellipse class="fb" cx="93" cy="65" rx="4.4" ry="2.6"/><path class="ln" d="M63 64q10.5 7.5 21 0"/></g></g>
<g class="leg a"><ellipse class="o f1" cx="74" cy="93" rx="8.5" ry="4"/></g><g class="leg b"><ellipse class="o f1" cx="93" cy="92.5" rx="8.5" ry="4"/></g>`,
    cloud: () => {
      const puffs = [[36, 64, 15], [54, 50, 20], [77, 50, 18], [93, 63, 14], [63, 70, 21], [44, 75, 12], [84, 74, 12]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
      return `<g class="pt-drops"><path d="M46 84q3 5 0 7q-3-2 0-7Z"/><path d="M63 88q3 5 0 7q-3-2 0-7Z"/><path d="M80 84q3 5 0 7q-3-2 0-7Z"/></g>
<g class="pt-bow"><path d="M14 66a50 50 0 0 1 100 0" stroke="#ff8fa8"/><path d="M20 66a44 44 0 0 1 88 0" stroke="#ffc36b"/><path d="M26 66a38 38 0 0 1 76 0" stroke="#fff08a"/><path d="M32 66a32 32 0 0 1 64 0" stroke="#90e59b"/><path d="M38 66a26 26 0 0 1 52 0" stroke="#8ad7ff"/></g>
<g class="pt-up pt-breathe"><g class="cl-o">${puffs}</g><g class="cl-f">${puffs}</g><path class="cl-s" d="M30 73q34 15 68 0"/>
<g class="pt-head">${face(65, 60, 17)}<path class="ln" d="M61.5 66q3.5 3 7 0"/></g></g>`;
    },
    dragon: () => `<g class="pt-up">${tailOf('M37 72C22 78 12 73 10 61', 37, 72).replace('</g>', '<path class="o f3" d="M10 64l-7-9 12 1z"/></g>')}
<g class="pt-wing" style="transform-origin:60px 56px"><path class="o f3" d="M60 56C54 37 40 30 28 34C35 38 36 45 33 50C40 48 45 51 46 56C51 54 56 56 60 59Z"/></g></g>${legs([40, 72], [47, 79], 72, 23, 12, 13)}
<g class="pt-up pt-breathe"><path class="o f3" d="M37 55l3-10 6 7ZM47 51l4-10 6 7ZM58 50l4-10 6 7Z"/><ellipse class="o f1" cx="60" cy="68" rx="30" ry="19"/><path class="f2" d="M45 75q16 9 33 0q-2 10-16 11q-15-1-17-11Z"/><path class="bl" d="M49 80q13 4 25 0"/>
<g class="pt-head"><path class="o f4" d="M76 31q-6-12 2-18q0 9 6 15Z"/><path class="o f4" d="M95 29q1-13 10-15q-3 9-2 16Z"/><ellipse class="o f1" cx="86" cy="46" rx="22" ry="19"/>
<ellipse class="o f1" cx="102" cy="55" rx="12" ry="8.5"/><circle class="fk" cx="107" cy="52.5" r="1.3"/><circle class="fk" cx="101" cy="52.5" r="1.3"/>${face(83, 44, 16)}<path class="ln" d="M96 60q5 3 10-1"/>
<g class="pt-flame"><path d="M113 55c7-6 15-4 19 1c-5 0-7 2-8 4c5 1 6 5 4 8c-6-3-11-6-15-13Z"/></g></g></g>`,
    fox: () => {
      const tail = (a) => `<g transform="rotate(${a} 38 64)"><path class="o f1" d="M38 64C24 60 11 50 13 34C21 36 31 46 40 58Z"/><path class="tip" d="M13 34C13.5 41 17 46 22.5 47.5C18.5 43 15.5 38.5 13 34Z"/></g>`;
      return `<g class="pt-up"><g class="pt-tail" style="transform-origin:38px 64px">${tail(-30)}${tail(-6)}${tail(20)}</g></g>${legs([43, 74], [49, 80], 71, 25, 10, 11)}
<g class="pt-up pt-breathe"><ellipse class="o f1" cx="61" cy="66" rx="28" ry="17"/><ellipse class="f2" cx="78" cy="70" rx="9" ry="9.5"/>
<g class="pt-head"><path class="o f1" d="M68 33L69 6L86 24Z"/><path class="f4" d="M71.5 28L72.2 13.5L81 23.5Z"/><path class="o f1" d="M91 24L108 6L108 33Z"/><path class="f4" d="M96 23.5L104.8 13.5L105.2 28Z"/>
<path class="o f1" d="M64 42C64 30 75 23 88 23C101 23 112 30 112 42C112 51 104 58 96 61L88 67L80 61C72 58 64 51 64 42Z"/><path class="f2" d="M67 47c5 6 12 9 21 19c9-10 16-13 21-19c-7 3-14 3-21 8c-7-5-14-5-21-8Z"/>
<path class="tip" d="M88 27.5l3 4.5-3 4.5-3-4.5Z"/>${face(88, 43, 19)}<ellipse class="fk" cx="88" cy="57" rx="3" ry="2.2"/><path class="ln" d="M85 60.3q1.5 1.8 3 0q1.5 1.8 3 0"/></g>
<g class="pt-wisps"><circle class="wisp" cx="34" cy="26" r="3.6"/><circle class="wisp w2" cx="110" cy="10" r="2.8"/></g></g>`;
    },
  };
  const petArt = new Map();
  const artOf = (kind) => {
    if (!petArt.has(kind)) petArt.set(kind, `<svg class="hp-pet-svg" viewBox="0 0 120 100" aria-hidden="true" focusable="false">${PET_ART[kind]().replace(/\n/g, '')}</svg>`);
    return petArt.get(kind);
  };

  // What each eats: for its thought bubble when it's hungry, and its bowl.
  const FOOD = {
    fish: '<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0Z" fill="#8ad7ff"/><path d="M18 12l4-4v8Z" fill="#8ad7ff"/><circle cx="7.5" cy="11" r="1.2" fill="#2a1f33" stroke="none"/>',
    bone: '<g fill="#fff8ec"><circle cx="5.5" cy="9" r="2.8"/><circle cx="5.5" cy="15" r="2.8"/><circle cx="18.5" cy="9" r="2.8"/><circle cx="18.5" cy="15" r="2.8"/></g><rect x="5.5" y="9.5" width="13" height="5" fill="#fff8ec" stroke="none"/><path d="M6.5 9.5h11M6.5 14.5h11" fill="none"/>',
    fly: '<ellipse cx="8.5" cy="9" rx="4" ry="2.6" fill="#dff4ff" transform="rotate(-35 8.5 9)"/><ellipse cx="15.5" cy="9" rx="4" ry="2.6" fill="#dff4ff" transform="rotate(35 15.5 9)"/><ellipse cx="12" cy="14.5" rx="3.6" ry="4.6" fill="#3d3548"/>',
    drop: '<path d="M12 3c3 5 6.5 8 6.5 12a6.5 6.5 0 0 1-13 0c0-4 3.5-7 6.5-12Z" fill="#8ad7ff"/><path d="M9 14a3 3 0 0 0 2 3" fill="none" stroke="#fff"/>',
    coal: '<path d="M4 16c0-5 4-9 9-9s7 4 7 8-3 6-8 6-8-1-8-5Z" fill="#4a3c46"/><path d="M8 15l3-3 2 3 3-2" fill="none" stroke="#ffb347" stroke-width="1.8"/>',
    berry: '<circle cx="8.5" cy="15" r="4" fill="#e2445e"/><circle cx="15.5" cy="15" r="4" fill="#c73a7a"/><circle cx="12" cy="10.5" r="4" fill="#ef4d5e"/><path d="M12 6.5c1-2 3-3 5-2.5" fill="none" stroke="#2f9150" stroke-width="1.8"/>',
  };
  const foodSvg = (food) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g stroke="#2a1f33" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${FOOD[food] || FOOD.fish}</g></svg>`;
  const bowlSvg = (food) => `<svg viewBox="0 0 40 30" aria-hidden="true" focusable="false"><g stroke="#2a1f33" stroke-width="1.8" stroke-linejoin="round"><g transform="translate(8 -1) scale(1)">${FOOD[food] || FOOD.fish}</g><path d="M3 17h34c0 7-7 11-17 11S3 24 3 17Z" fill="#ff8fb1"/><path d="M3 17h34" fill="none"/></g></svg>`;

  // A pet, as it looks: standing still, unless it's given something to do (the classes below).
  function petEl(kind, coat) {
    const k = PETS[kind] ? kind : 'cat';
    const coats = PETS[k].coats;
    const c = coats[coat] || Object.values(coats)[0];
    const node = document.createElement('div');
    node.className = `hp-pet hp-pet-${k}${PETS[k].glow ? ' hp-pet-glowy' : ''}`;
    for (const [v, value] of Object.entries({ ...PET_INK, ...c })) if (v !== 'label') node.style.setProperty(`--${v}`, value);
    node.style.setProperty('--blink', `${(-Math.random() * 5).toFixed(2)}s`);
    node.innerHTML = `<span class="hp-pet-shadow"></span><span class="hp-pet-lift"><span class="hp-pet-bounce"><span class="hp-pet-in">${artOf(k)}</span></span></span>`;
    return node;
  }

  // How full and how happy, in words.
  const fullWords = (v) => (v >= 0.7 ? 'Full' : v >= 0.4 ? 'Peckish' : v >= 0.2 ? 'Hungry' : 'Very hungry');
  const happyWords = (v) => (v >= 0.7 ? 'Happy' : v >= 0.4 ? 'Content' : v >= 0.2 ? 'Bored' : 'Lonely');
  // Its meters (for its owner): how full, and how happy.
  function petMeters(info) {
    const meter = (label, v, kind, words) => {
      const row = document.createElement('div');
      row.className = `hp-pet-meter ${kind}`;
      const name = document.createElement('span');
      name.textContent = label;
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(Math.max(0.03, v) * 100)}%`;
      bar.append(fill);
      const say = document.createElement('em');
      say.textContent = words;
      row.append(name, bar, say);
      return row;
    };
    return [meter('Food', info.full, 'full', fullWords(info.full)), meter('Mood', info.happy, 'happy', happyWords(info.happy))];
  }

  const PET_W = 100; // (how wide a pet is on a page; never less than 46px on the screen)
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // A page's pet, on it (`canvas`: where the pieces are). The same pet carries on when the page
  // is drawn again (the editor does, with every change).
  function petOn(page, canvas, doc, ctx) {
    const pet = doc.pet;
    const key = [ctx.owner.id || '', pet.kind, pet.coat, pet.name].join('|');
    if (!page.hpPet || page.hpPet.key !== key) {
      if (page.hpPet) page.hpPet.stop();
      page.hpPet = petLife(page, pet, key);
    }
    page.hpPet.attach(canvas, doc, ctx);
    // (Where the pointer is: it comes to see.)
    if (!page.hpPetWatch) {
      page.hpPetWatch = true;
      page.addEventListener('pointermove', (e) => { if (page.hpPet) page.hpPet.saw(e, false); }, { passive: true });
      page.addEventListener('pointerdown', (e) => { if (page.hpPet) page.hpPet.saw(e, true); }, { passive: true });
    }
  }

  function petLife(page, pet, key) {
    const kind = PETS[pet.kind] ? pet.kind : 'cat';
    const K = PETS[kind];
    const name = pet.name || K.label;
    const node = petEl(kind, pet.coat);
    node.classList.add('hp-pet-live');
    const lift = node.querySelector('.hp-pet-lift');
    const inner = node.querySelector('.hp-pet-in');
    const shadow = node.querySelector('.hp-pet-shadow');
    const tag = document.createElement('span');
    tag.className = 'hp-pet-tag';
    const tagName = document.createElement('b');
    tagName.textContent = name;
    const tagLine = document.createElement('span');
    tag.append(tagName, tagLine);
    const think = document.createElement('span');
    think.className = 'hp-pet-think';
    think.innerHTML = foodSvg(K.food);
    const bits = document.createElement('span');
    bits.className = 'hp-pet-bits';
    node.append(tag, think, bits);
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Pet ${name}`);
    const still = Boolean(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const me = {
      canvas: null, doc: null, ctx: null, raf: 0, t: 0, born: 0, v: null,
      x: NaN, y: NaN, z: 0, dir: Math.random() < 0.5 ? -1 : 1, w: 0,
      mode: 'idle', until: 0, tx: 0, ty: 0, hopAt: 0, plan: [], arrive: null, pointer: null, sawAt: 0,
      info: { full: 0.9, happy: 0.7, pets: 0 }, tagUntil: 0, thinkUntil: 0, nextThink: 0, nextZ: 0, props: [],
    };

    const hungry = () => me.info.full < 0.2;
    const glad = () => me.info.happy >= 0.7 && !hungry();
    const LOOKS = { walk: ['walk'], run: ['walk', 'run'], chase: ['walk', 'run'], rest: ['rest'], sleep: ['rest', 'sleep'], eat: ['rest', 'eat'], joy: ['joy'] };
    function mode(m, secs = Infinity) {
      me.mode = m;
      me.until = me.t + secs;
      node.classList.remove('walk', 'run', 'rest', 'sleep', 'eat', 'joy', 'air');
      node.classList.add(...(LOOKS[m] || []));
      if (m !== 'walk' && m !== 'run' && m !== 'chase' && !K.floats) me.z = 0;
      updateTag();
    }
    function updateTag() {
      const n = Number(me.info.pets) || 0;
      tagLine.textContent = me.mode === 'sleep' ? 'asleep' : hungry() ? 'hungry' : n ? `petted ${n.toLocaleString()} ${n === 1 ? 'time' : 'times'}` : 'pet me!';
    }
    function mood() {
      node.classList.toggle('sad', hungry());
      updateTag();
    }
    // Hearts, z's and sparkles, coming up from its head.
    function bit(kind, text = '') {
      const b = document.createElement('i');
      b.className = `hp-pet-bit hp-pet-${kind}`;
      if (text) b.textContent = text;
      b.style.left = `${(me.dir > 0 ? 70 : 30) + rand(-10, 10)}%`;
      b.style.setProperty('--drift', `${rand(-0.25, 0.25).toFixed(2)}`);
      b.addEventListener('animationend', () => b.remove());
      setTimeout(() => b.remove(), 2500); // (in case it doesn't move at all)
      bits.append(b);
    }
    const hearts = (n) => {
      for (let i = 0; i < n; i++) setTimeout(() => bit('heart'), i * 150);
      if (K.glow) for (let i = 0; i < n; i++) setTimeout(() => bit('spark'), 70 + i * 170);
    };

    // The part of the page that's showing, in the page's own units, and how big it is there.
    function view() {
      const cr = me.canvas.getBoundingClientRect();
      const pr = page.getBoundingClientRect();
      const s = cr.width / (parseFloat(me.canvas.style.width) || WIDTH) || 1;
      const w = Math.max(PET_W, 46 / s);
      const h = w * 0.84;
      const top = (pr.top - cr.top) / s;
      const bottom = (pr.bottom - cr.top) / s;
      const x0 = Math.max(w / 2 + 4, (pr.left - cr.left) / s + w / 2 + 4);
      const x1 = Math.min(WIDTH - w / 2 - 4, (pr.right - cr.left) / s - w / 2 - 4);
      const y0 = Math.max(h + 6, top + h + 12);
      const y1 = Math.min((me.doc.height || 1000) - 6, bottom - 10);
      return { s, w, h, top, bottom, x0, x1: Math.max(x0, x1), y0, y1: Math.max(y0, y1), cr };
    }
    function walkTo(x, y, how = 'walk') {
      me.tx = clampTo(x, me.v.x0, me.v.x1);
      me.ty = clampTo(y, me.v.y0, me.v.y1);
      me.hopAt = me.t;
      mode(how);
    }

    // What next: whatever it's been asked to (plan), or back into view, or something of its own.
    function decide() {
      const v = (me.v = view());
      if (v.w !== me.w) {
        me.w = v.w;
        node.style.width = `${v.w}px`;
        node.style.height = `${v.h}px`;
        node.style.setProperty('--pw', `${v.w}px`);
      }
      const next = me.plan.shift();
      if (next) return next();
      if (Number.isNaN(me.x)) {
        me.x = rand(v.x0, v.x1);
        me.y = rand(v.y0, v.y1);
        return mode(still ? 'rest' : 'idle', rand(0.6, 1.6));
      }
      if (still) return mode('rest', 5);
      // (Scrolled out of sight: it comes along, from just past the nearest edge.)
      if (me.y < v.top - 40 || me.y > v.bottom + v.h + 40 || me.x < v.x0 - 80 || me.x > v.x1 + 80) {
        me.y = me.y < v.top ? v.top - 4 : v.bottom + v.h + 4;
        me.x = clampTo(me.x, v.x0, v.x1);
        return walkTo(rand(v.x0, v.x1), me.y < v.top ? v.y0 + rand(0, 90) : v.y1 - rand(0, 90), 'run');
      }
      const r = Math.random();
      const lazy = hungry() ? 2.2 : 1;
      const p = me.pointer;
      if (p && me.t - p.at < 5 && r < 0.3 && Math.hypot(p.x - me.x, p.y - me.y) > v.w) {
        // (Coming to see what the pointer's doing, and sitting by it.)
        walkTo(p.x - Math.sign(p.x - me.x) * v.w * 0.7, p.y + v.h * 0.45);
        me.arrive = () => mode('idle', rand(2.5, 4.5));
        return;
      }
      if (r < 0.12 * lazy) return mode('rest', rand(3, 8));
      if (r < 0.18 * lazy && me.t - me.born > 15) return mode('sleep', rand(8, 16));
      if (glad() && r > 0.9) return walkTo(me.x + rand(-1, 1) * 360, me.y + rand(-1, 1) * 160, 'run');
      walkTo(me.x + rand(-1, 1) * 240, me.y + rand(-1, 1) * 140);
    }
    function arrived() {
      if (!K.floats) me.z = 0;
      node.classList.remove('air');
      const then = me.arrive;
      me.arrive = null;
      if (then) return then();
      mode('idle', rand(1.2, 3.6));
    }

    function step(dt, t) {
      const moving = me.mode === 'walk' || me.mode === 'run' || me.mode === 'chase';
      if (moving) {
        const dx = me.tx - me.x;
        const dy = me.ty - me.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 1.5) me.dir = dx > 0 ? 1 : -1;
        const fast = me.mode === 'walk' ? 1 : 2.1;
        if (K.hops) {
          // (A frog gets about in hops: up and over, then a moment's rest.)
          const k = (t - me.hopAt) / 0.42;
          if (k < 1) {
            const go = Math.min(d, (48 / 0.42) * (fast > 1 ? 1.35 : 1) * (hungry() ? 0.7 : 1) * dt);
            if (d > 0.01) {
              me.x += (dx / d) * go;
              me.y += (dy / d) * go;
            }
            me.z = Math.sin(Math.PI * k) * (fast > 1 ? 24 : 17);
            node.classList.add('air');
          } else {
            me.z = 0;
            node.classList.remove('air');
            if (d < 1.5) return arrived();
            if (t - me.hopAt > 0.42 + (fast > 1 ? 0.1 : 0.3)) me.hopAt = t;
          }
        } else {
          const go = K.speed * fast * (hungry() ? 0.6 : 1) * dt;
          if (d <= go) {
            me.x = me.tx;
            me.y = me.ty;
            return arrived();
          }
          me.x += (dx / d) * go;
          me.y += (dy / d) * go;
        }
      } else if (me.pointer && me.mode === 'idle' && t - me.pointer.at < 3 && Math.abs(me.pointer.x - me.x) > 24) {
        me.dir = me.pointer.x > me.x ? 1 : -1; // (standing about, it looks at the pointer)
      }
      if (K.floats) {
        const base = me.mode === 'sleep' ? 4 : me.mode === 'rest' || me.mode === 'eat' ? 7 : 13;
        me.z += (base + Math.sin(t * 2.1) * 3 - me.z) * Math.min(1, dt * 4);
      }
      if (me.mode === 'sleep' && t > me.nextZ) {
        me.nextZ = t + 1.4;
        bit('z', 'z');
      }
      if (hungry() && me.mode === 'idle' && t > me.nextThink) {
        me.nextThink = t + rand(9, 16);
        me.thinkUntil = t + 3.2;
        think.classList.add('on');
      }
      if (me.thinkUntil && t > me.thinkUntil) {
        me.thinkUntil = 0;
        think.classList.remove('on');
      }
      if (me.tagUntil && t > me.tagUntil) {
        me.tagUntil = 0;
        node.classList.remove('tagged');
      }
    }

    function render() {
      node.style.transform = `translate(${(me.x - me.w / 2).toFixed(1)}px, ${(me.y - me.w * 0.84).toFixed(1)}px)`;
      const tilt = K.floats && (me.mode === 'walk' || me.mode === 'run' || me.mode === 'chase') ? ` rotate(${me.dir * 4}deg)` : '';
      lift.style.transform = me.z || tilt ? `translateY(${(-me.z).toFixed(1)}px)${tilt}` : '';
      inner.classList.toggle('left', me.dir < 0);
      node.classList.toggle('lf', me.dir < 0);
      const k = Math.min(0.5, me.z / 60);
      shadow.style.transform = k ? `scale(${(1 - k).toFixed(3)})` : '';
      shadow.style.opacity = k ? String(1 - k) : '';
    }

    function frame(ms) {
      me.raf = 0;
      if (!node.isConnected || !me.canvas) return;
      const t = ms / 1000;
      const dt = me.t ? Math.min(0.1, t - me.t) : 0;
      me.t = t;
      if (!me.born) me.born = t;
      if (t >= me.until) decide();
      step(dt, t);
      if (!Number.isNaN(me.x)) render();
      me.raf = requestAnimationFrame(frame);
    }

    // Petted: it hops, hearts come up, and it's counted. (Its owner gets its care card too.) Busy
    // eating or chasing its ball, it carries on.
    function petted() {
      if (!me.ctx || me.ctx.edit) return;
      if (!me.plan.length && !me.arrive && me.mode !== 'eat') mode('joy', 1.3);
      hearts(3);
      showTag(3);
      ownerCall(me.ctx, 'pet', 'POST').then((d) => {
        if (d && d.pet) {
          me.info = d.pet;
          mood();
          const card = me.caring && page.parentElement.querySelector('.hp-pet-care');
          if (card && card.life === life) fillCare(card);
        }
      }).catch(() => {});
      if (me.ctx.mine) care();
    }
    function showTag(secs) {
      updateTag();
      node.classList.add('tagged');
      me.tagUntil = me.t + secs;
    }
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      petted();
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        petted();
      }
    });
    node.addEventListener('pointerenter', updateTag);

    // Its owner's care card: how it's doing, and feeding it or playing with it.
    function care() {
      const box = page.parentElement;
      if (!box) return;
      let card = box.querySelector('.hp-pet-care');
      if (!card) {
        card = document.createElement('div');
        card.className = 'hp-pet-care';
        card.setAttribute('role', 'dialog');
        card.innerHTML = '<button class="hp-pet-x" type="button" aria-label="Close">×</button><strong></strong><div class="hp-pet-meters"></div><p class="hp-pet-sub"></p><div class="hp-pet-do"><button class="feed" type="button"></button><button class="play" type="button">Play</button></div><p class="hp-pet-msg" hidden></p>';
        box.append(card);
        card.querySelector('.hp-pet-x').addEventListener('click', () => card.life.closeCare());
        card.querySelector('.feed').addEventListener('click', () => card.life.tend('feed'));
        card.querySelector('.play').addEventListener('click', () => card.life.tend('play'));
        card.addEventListener('pointerdown', (e) => e.stopPropagation());
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            card.life.closeCare();
          }
        });
      }
      card.life = life;
      fillCare(card);
      card.hidden = false;
      const fr = box.getBoundingClientRect();
      const pr = node.getBoundingClientRect();
      const left = clampTo(pr.left + pr.width / 2 - fr.left - card.offsetWidth / 2, 8, fr.width - card.offsetWidth - 8);
      let top = pr.top - fr.top - card.offsetHeight - 10;
      if (top < 8) top = Math.min(fr.height - card.offsetHeight - 8, pr.bottom - fr.top + 10);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      me.caring = true;
      card.querySelector('.feed').focus({ preventScroll: true });
    }
    function fillCare(card) {
      const i = me.info;
      card.querySelector('strong').textContent = name;
      card.querySelector('.hp-pet-meters').replaceChildren(...petMeters(i));
      const n = Number(i.pets) || 0;
      const days = Math.max(1, Math.ceil((Date.now() - (i.since || Date.now())) / 86_400_000));
      card.querySelector('.hp-pet-sub').textContent = `Petted ${n.toLocaleString()} ${n === 1 ? 'time' : 'times'} · here ${days} ${days === 1 ? 'day' : 'days'}`;
      card.querySelector('.feed').textContent = `Feed ${name}`;
    }
    function closeCare() {
      const card = page.parentElement && page.parentElement.querySelector('.hp-pet-care');
      if (card && card.life === life) card.hidden = true;
      me.caring = false;
    }
    async function tend(what) {
      const card = page.parentElement.querySelector('.hp-pet-care');
      const msg = card.querySelector('.hp-pet-msg');
      msg.hidden = true;
      let data;
      try {
        const res = await fetch(`/api/homepages/me/pet/${what}`, { method: 'POST' });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      } catch (err) {
        msg.textContent = err.message;
        msg.hidden = false;
        return;
      }
      closeCare();
      did(what, data.pet);
    }

    // Fed (a bowl comes, and it eats), or played with (a ball's thrown for it, three times).
    function did(what, info) {
      if (info) me.info = info;
      mood();
      if (!me.canvas || still) return hearts(3);
      const v = (me.v = view());
      me.plan = [];
      me.arrive = null;
      if (what === 'feed') {
        const bx = clampTo(me.x + me.dir * v.w * 0.95, v.x0, v.x1);
        const bowl = prop('hp-pet-bowl', bowlSvg(K.food), bx, me.y, v.w * 0.5);
        const side = bx >= me.x ? -1 : 1;
        walkTo(bx + side * v.w * 0.5, me.y);
        me.arrive = () => {
          me.dir = -side;
          mode('eat', 2.8);
          me.plan.push(() => {
            bowl.classList.add('gone');
            setTimeout(() => bowl.remove(), 600);
            mode('joy', 1.3);
            hearts(3);
          });
        };
      } else if (what === 'play') {
        const ball = prop('hp-pet-ball', '', me.x, me.y - 4, v.w * 0.24);
        let throws = 3;
        const toss = () => {
          const w = me.v;
          const bx = clampTo(me.x + rand(0.5, 1) * (Math.random() < 0.5 ? -1 : 1) * 230, w.x0, w.x1);
          const by = clampTo(me.y + rand(-90, 90), w.y0, w.y1);
          place(ball, bx, by - 4, w.w * 0.24);
          walkTo(bx - Math.sign(bx - me.x) * w.w * 0.3, by, 'chase');
          me.arrive = () => {
            if (--throws > 0) {
              mode('joy', 0.6);
              me.plan.push(toss);
            } else {
              ball.classList.add('gone');
              setTimeout(() => ball.remove(), 600);
              mode('joy', 1.3);
              hearts(4);
            }
          };
        };
        setTimeout(toss, 60);
      } else {
        hearts(3);
      }
    }
    // Something of its own on the page (a bowl, a ball), where it can see it.
    function prop(cls, html, x, y, w) {
      const n = document.createElement('span');
      n.className = cls;
      n.innerHTML = html;
      me.canvas.append(n);
      me.props.push(n);
      place(n, x, y, w);
      return n;
    }
    function place(n, x, y, w) {
      n.style.width = `${w}px`;
      n.style.height = `${w}px`;
      n.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - w).toFixed(1)}px)`;
    }

    // Where the pointer is (in the page's own units), now and then.
    function saw(e, down) {
      if (!me.canvas || (!down && e.timeStamp - me.sawAt < 90)) return;
      me.sawAt = e.timeStamp;
      const cr = me.canvas.getBoundingClientRect();
      const s = cr.width / (parseFloat(me.canvas.style.width) || WIDTH) || 1;
      me.pointer = { x: (e.clientX - cr.left) / s, y: (e.clientY - cr.top) / s, at: me.t };
      if (down && me.caring && !node.contains(e.target)) closeCare();
    }

    function attach(canvas, doc, ctx) {
      me.canvas = canvas;
      me.doc = doc;
      me.ctx = ctx;
      if (ctx.pet) me.info = ctx.pet;
      node.tabIndex = ctx.edit ? -1 : 0;
      canvas.append(node);
      me.props = me.props.filter((n) => !n.classList.contains('gone'));
      for (const n of me.props) canvas.append(n);
      mood();
      if (!me.raf) me.raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (me.raf) cancelAnimationFrame(me.raf);
      me.raf = 0;
      me.t = 0;
      closeCare();
    }
    const life = { key, node, attach, stop, saw, did, closeCare, tend };
    return life;
  }

  // ---------- Effects for visitors (Glow's) ----------
  // A trail behind a visitor's pointer, and a burst where they click or tap: drawn on a canvas over
  // the page, only while there's something to draw (and not at all for anyone who asks for less
  // motion).

  const FX_COLORS = {
    sparkles: ['#fff6c9', '#ffffff', '#ffe08a', '#dccbff'], hearts: ['#ff6b9d', '#ff8fc6', '#ff4d6d', '#ffc2d9'],
    stars: ['#ffd84d', '#ffe98a', '#ffb347', '#fff3b0'], raindrops: ['#8ad7ff', '#6ec3f2', '#b5e6ff'],
    confetti: ['#ff5f8f', '#ffa24c', '#ffe14d', '#6be07e', '#57c7ff', '#a57bff'],
  };
  function starPath(n, big, small) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? small : big;
      const a = (Math.PI * i) / n - Math.PI / 2;
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(3)} ${(Math.sin(a) * r).toFixed(3)}`;
    }
    return `${d}Z`;
  }
  const FX_SHAPES = typeof Path2D === 'function' ? {
    hearts: new Path2D('M0 .34C-.14 .24-.56 0-.56-.28C-.56-.48-.4-.58-.24-.56C-.11-.54 0-.45 0-.34C0-.45.11-.54.24-.56C.4-.58.56-.48.56-.28C.56 0 .14.24 0 .34Z'),
    sparkles: new Path2D('M0-1Q.14-.14 1 0Q.14.14 0 1Q-.14.14-1 0Q-.14-.14 0-1Z'),
    stars: new Path2D(starPath(5, 1, 0.46)),
    raindrops: new Path2D('M0-1C.3-.52.56-.16.56.2A.56.56 0 0 1-.56.2C-.56-.16-.3-.52 0-1Z'),
  } : null;
  const anyOf = (list) => list[Math.floor(Math.random() * list.length)];

  // host: what they're drawn over (it's positioned); on: where the pointer's watched.
  function effectsOn(host, on) {
    const cv = document.createElement('canvas');
    cv.className = 'hp-fx';
    cv.setAttribute('aria-hidden', 'true');
    host.append(cv);
    const g = cv.getContext('2d');
    const calm = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const parts = [];
    let chosen = { trail: 'none', click: 'none' };
    let live = false;
    let raf = 0;
    let at = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let last = null;
    let gap = 0;
    const size = () => {
      const nw = host.clientWidth;
      const nh = host.clientHeight;
      const nd = Math.min(2, window.devicePixelRatio || 1);
      if (nw === w && nh === h && nd === dpr) return;
      w = nw;
      h = nh;
      dpr = nd;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    const add = (p) => {
      if (!g || parts.length >= 200 || (!FX_SHAPES && !['ring', 'bubble', 'bit'].includes(p.shape))) return;
      parts.push({ t: 0, rot: Math.random() * 6.3, spin: 0, drag: 0, ...p });
      if (!raf) {
        at = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const TRAIL = {
      sparkles: (x, y) => add({ shape: 'sparkles', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-18, 18), vy: rand(-8, 26), g: 30, size: rand(4, 8), life: 0.8, spin: rand(-2, 2) }),
      hearts: (x, y) => add({ shape: 'hearts', x: x + rand(-3, 3), y, vx: rand(-14, 14), vy: rand(-46, -24), g: -6, size: rand(10, 14), life: 1.1, rot: rand(-0.3, 0.3) }),
      stars: (x, y) => add({ shape: 'stars', x, y, vx: rand(-34, 34), vy: rand(-30, 10), g: 110, size: rand(5, 9), life: 0.9, spin: rand(-5, 5) }),
      bubbles: (x, y) => add({ shape: 'bubble', x, y, vx: rand(-8, 8), vy: rand(-44, -22), g: -12, size: rand(4, 10), life: 1.3, wob: rand(0, 6) }),
      raindrops: (x, y) => add({ shape: 'raindrops', x: x + rand(-5, 5), y, vx: 0, vy: rand(20, 50), g: 420, size: rand(4, 6.5), life: 0.6, rot: 0 }),
    };
    const BURST = {
      confetti: (x, y) => {
        for (let i = 0; i < 28; i++) {
          const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
          const v = rand(140, 360);
          add({ shape: 'bit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 560, size: rand(5, 9), life: rand(1.1, 1.6), spin: rand(-9, 9), color: anyOf(FX_COLORS.confetti), drag: 1.6 });
        }
      },
      hearts: (x, y) => {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
          const v = rand(70, 150);
          add({ shape: 'hearts', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: -40, size: rand(11, 17), life: 1.2, rot: rand(-0.3, 0.3), drag: 2.4 });
        }
      },
      stars: (x, y) => {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const v = rand(120, 260);
          add({ shape: 'stars', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, size: rand(6, 11), life: 1, spin: rand(-6, 6), drag: 2 });
        }
      },
      ripples: (x, y) => {
        for (let i = 0; i < 3; i++) add({ shape: 'ring', x, y, vx: 0, vy: 0, g: 0, size: 4, grow: 110, delay: i * 0.16, life: 0.9 + i * 0.16 });
      },
    };
    function tick(now) {
      const dt = Math.min(0.05, (now - at) / 1000);
      at = now;
      size();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) {
          parts.splice(i, 1);
          continue;
        }
        if (p.delay && p.t < p.delay) continue;
        if (p.drag) {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        draw(p);
      }
      g.globalAlpha = 1;
      raf = parts.length ? requestAnimationFrame(tick) : 0;
    }
    function draw(p) {
      const k = p.t / p.life;
      g.globalAlpha = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
      if (p.shape === 'ring') {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, p.size + p.grow * (p.t - (p.delay || 0)), 0, Math.PI * 2);
        g.stroke();
        return;
      }
      if (p.shape === 'bubble') {
        const x = p.x + Math.sin(p.t * 5 + p.wob) * 3;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.strokeStyle = 'rgba(205, 239, 255, 0.95)';
        g.fillStyle = 'rgba(205, 239, 255, 0.16)';
        g.lineWidth = 1.3;
        g.beginPath();
        g.arc(x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255, 255, 255, 0.9)';
        g.beginPath();
        g.arc(x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.22, 0, Math.PI * 2);
        g.fill();
        return;
      }
      const s = p.size * (p.shape === 'sparkles' ? 0.75 + 0.25 * Math.sin(p.t * 18) : 1) * dpr;
      const c = Math.cos(p.rot) * s;
      const n = Math.sin(p.rot) * s;
      g.fillStyle = p.color || (p.color = anyOf(FX_COLORS[p.shape] || FX_COLORS.sparkles));
      if (p.shape === 'bit') {
        const flip = Math.cos(p.t * 11 + p.x * 0.05); // (confetti turning over as it falls)
        g.setTransform(c, n, -n * flip, c * flip, p.x * dpr, p.y * dpr);
        g.fillRect(-0.5, -0.32, 1, 0.64);
        return;
      }
      g.setTransform(c, n, -n, c, p.x * dpr, p.y * dpr);
      if (FX_SHAPES) g.fill(FX_SHAPES[p.shape]);
    }
    const point = (e) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    on.addEventListener('pointermove', (e) => {
      if (!live || chosen.trail === 'none' || e.pointerType === 'touch' || calm.matches) return;
      const { x, y } = point(e);
      if (last) gap += Math.hypot(x - last.x, y - last.y);
      last = { x, y };
      if (gap < 13) return;
      gap = 0;
      size();
      TRAIL[chosen.trail](x, y);
    }, { passive: true });
    on.addEventListener('pointerleave', () => { last = null; });
    on.addEventListener('pointerdown', (e) => {
      if (!live || chosen.click === 'none' || calm.matches || e.button > 0) return;
      const { x, y } = point(e);
      size();
      BURST[chosen.click](x, y);
    }, { passive: true });
    return {
      set(settings, isLive) {
        chosen = { trail: 'none', click: 'none', ...(settings || {}) };
        if (!TRAIL[chosen.trail]) chosen.trail = 'none';
        if (!BURST[chosen.click]) chosen.click = 'none';
        live = Boolean(isLive);
        last = null;
      },
      // A taste of them (in the editor, as one's picked): a trail across the middle, then a burst.
      demo(which = chosen) {
        if (calm.matches) return;
        size();
        const trail = TRAIL[which.trail];
        const burst = BURST[which.click];
        if (trail) {
          for (let i = 0; i <= 36; i++) {
            const k = i / 36;
            setTimeout(() => trail(w / 2 + Math.sin(k * Math.PI * 2) * w * 0.28, h / 2 + Math.sin(k * Math.PI * 4) * h * 0.12), i * 24);
          }
        }
        if (burst) setTimeout(() => burst(w / 2, h / 2), trail ? 950 : 0);
      },
      stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        parts.length = 0;
        if (g) g.clearRect(0, 0, cv.width, cv.height);
      },
    };
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
  // canvas with its pieces (and its pet), scaled to fit. Returns { doc, canvas, fit }. (data: the
  // page as the server sends it. opts: edit, and in the app, report(what), to report a question
  // in your own box.)
  function mount(page, data, opts = {}) {
    const doc = data.doc || starter();
    const ctx = {
      owner: data.owner || {}, views: data.views || 0, fileUrl: (id) => `/homepage-files/${id}`, edit: Boolean(opts.edit), report: opts.report || null,
      pet: data.pet || null, mine: Boolean(data.mine),
    };
    hush(page);
    page.replaceChildren();
    page.classList.add('hp-page');
    Object.assign(page.style, backgroundStyle(doc.bg, ctx.fileUrl));
    // The weather and the pieces, one over the other: the weather stays in view as the page
    // scrolls, over all of it and behind everything on it. Paper and pictures cover it, as they
    // cover the background, and see-through tape shows a bit of both. (A moving pattern stays in
    // view the same way, behind the weather.)
    const room = document.createElement('div');
    room.className = 'hp-room';
    const backdrop = patternLayer(doc.bg);
    if (backdrop) {
      page.style.backgroundImage = 'none';
      room.append(backdrop);
    }
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
    // Pieces can reach past the page's 800px, and below it. On a screen wide enough, the page is
    // centered as it was made, with those showing around it. On a narrower one, everything is
    // shown: all of it, scaled down to fit. (Times the zoom, from pinching.) The top is the
    // page's edge: anything above it is cut off (a lamp hanging from the ceiling, say), and
    // putting something higher never moves the rest of the page down.
    const reach = () => {
      const b = { left: 0, right: WIDTH, top: 0, bottom: doc.height };
      for (const node of canvas.children) {
        if (!node.classList.contains('hp-piece')) continue; // (not the pet, or its things)
        const a = turns.get(node.dataset.id) || 0;
        const w = node.offsetWidth, h = node.offsetHeight;
        const hw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
        const hh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
        const cx = node.offsetLeft + w / 2, cy = node.offsetTop + h / 2;
        b.left = Math.min(b.left, cx - hw);
        b.right = Math.max(b.right, cx + hw);
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
      for (const layer of backdrop ? [sky, backdrop] : [sky]) {
        layer.style.width = `${page.clientWidth}px`;
        layer.style.height = `${page.clientHeight}px`;
      }
      page.style.setProperty('--hp-scale', String(s));
      page.classList.toggle('hp-zoomed', (page.hpZoom || 1) > 1);
      return s;
    };
    page.hpFit = opts.edit ? null : fit; // (for zooming; not while it's being edited)
    zoomable(page);
    fit();
    // Its pet, and the effects for visitors (while it's being looked at; the editor shows them
    // as they're picked).
    if (doc.pet && PETS[doc.pet.kind]) {
      petOn(page, canvas, doc, ctx);
    } else if (page.hpPet) {
      page.hpPet.stop();
      page.hpPet.node.remove();
      page.hpPet = null;
    }
    if (page.parentElement) {
      page.hpFx = page.hpFx || effectsOn(page.parentElement, page);
      page.hpFx.set(doc.effects, !ctx.edit);
    }
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
        // (Tapping the pet, or the fortune ball, again and again isn't zooming.)
        if (e.target.closest && e.target.closest('.hp-pet-live, .hp-ball')) {
          tap = null;
          return;
        }
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
    COUNTERS, GUESTBOOKS, MUSICS, SHELVES, BUTTONS, ASKS, PETS, TRAILS, CLICKS,
    pixelSrc, pixelRatio, backgroundStyle, patternSwatch, pieceEl, starter, mount, setSky, light, hush,
    petEl, petMeters, fullWords, happyWords,
    // (its owner fed the page's pet, or played with it, from elsewhere: it does it)
    petDid: (page, what, info) => { if (page.hpPet) page.hpPet.did(what, info); },
    // (a taste of the effects for visitors: the editor, as one's picked)
    showEffects: (page, which) => { if (page.hpFx) page.hpFx.demo(which); },
    // (effects over something else, to try: Glow's box)
    effectsOver: (host, settings) => {
      const fx = effectsOn(host, host);
      fx.set(settings, true);
      return fx;
    },
    // (someone signed a guestbook, or asked or answered a question, that's showing: read it again)
    reloadGuestbooks: (page, ctx) => { for (const n of page.querySelectorAll('.hp-guestbook')) loadGuestbook(n, ctx); },
    reloadQuestions: (page, ctx) => { for (const n of page.querySelectorAll('.hp-ask')) loadQuestions(n, ctx); },
  };
})();
