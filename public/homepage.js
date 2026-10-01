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
  // What each kind of piece is called (in the editor, and Admin's count of what pages use).
  const PIECE_NAMES = {
    text: 'Words', image: 'Picture', sticker: 'Sticker', tape: 'Tape', paper: 'Paper', me: 'Profile card', counter: 'Visitor counter',
    guestbook: 'Guestbook', music: 'Music player', shelf: 'Shelf', button: 'Friend button', ask: 'Ask me anything', fortune: 'Fortune ball',
  };
  const PATTERNS = {
    dots: 'Polka dots', stripes: 'Stripes', checks: 'Checks', gingham: 'Gingham', grid: 'Grid', hearts: 'Hearts', stars: 'Stars', flowers: 'Flowers', zigzag: 'Zigzag', clouds: 'Clouds',
    plaid: 'Plaid', camo: 'Camo', hexes: 'Hexagons', circuit: 'Circuit board',
    starfield: 'Starfield', bokeh: 'Bokeh', holo: 'Holo', waves: 'Waves',
  };
  const SKIES = { none: 'Nothing', rain: 'Rain', snow: 'Snow', sparkles: 'Sparkles', hearts: 'Floating hearts', leaves: 'Autumn leaves', fireflies: 'Fireflies', aurora: 'Aurora', storm: 'Thunderstorm', blossoms: 'Cherry blossoms', embers: 'Embers' };
  const TRAILS = { none: 'Nothing', sparkles: 'Sparkles', hearts: 'Hearts', stars: 'Stars', bubbles: 'Bubbles', raindrops: 'Raindrops', pixels: 'Pixels' };
  const CLICKS = { none: 'Nothing', confetti: 'Confetti', hearts: 'Hearts', stars: 'Stars', ripples: 'Ripples', fireworks: 'Fireworks' };
  // Glow's extras (lib/homepages.js): anyone can see them on a page, people with Glow can use them.
  const PERKS = {
    fx: ['shimmer', 'lamplight'], frame: ['gilded', 'neon'], sky: ['fireflies', 'aurora', 'storm', 'blossoms', 'embers'],
    pattern: ['starfield', 'bokeh', 'holo', 'waves'], trail: ['sparkles', 'hearts', 'stars', 'bubbles', 'raindrops', 'pixels'],
    click: ['confetti', 'hearts', 'stars', 'ripples', 'fireworks'], pet: ['cloud', 'dragon', 'fox'], piece: ['fortune'],
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
    'controller': ["...kkkkkkkkkk...", "..kssssssssssk..", ".kSSSSSSSSSSSSk.", "kSSSwSSSSSSySSSk", "kSSwwwSSSSbSrSSk", "kSSSwSSkkSSgSSSk", "kSSSSSSSSSSSSSSk", "kSSSSSkkkkSSSSSk", ".kSSSk....kSSSk.", "..kkk......kkk.."],
    'headphones': [".....kkkkkk.....", "...kkSSSSSSkk...", "..kSSssssssSSk..", ".kSSskkkkkksSSk.", ".kSsk......ksSk.", "kSSk........kSSk", "kSSk........kSSk", "kSSSk......kSSSk", "krrSSk....kSSrrk", "krrSSk....kSSrrk", "krrSSk....kSSrrk", "krRSSk....kSSRrk", ".kRSSk....kSSRk.", "..kkk......kkk.."],
    'skull': ["....kkkkkk....", "..kkwwwwwwkk..", ".kwwwwwwwwwwk.", "kwwwwwwwwwwwWk", "kwwwwwwwwwwwWk", "kwkkkwwwwkkkWk", "kwkkkkwwkkkkWk", "kwwkkwwwwkkwWk", ".kwwwwkkwwwWk.", "..kwwwwwwwWk..", "..kwkwkwkwWk..", "...kwwwwWWk...", "....kkkkkk...."],
    'sword': ["....k....", "...kwk...", "..kwsSk..", "..kwsSk..", "..kwsSk..", "..kwsSk..", "..kwsSk..", "..kwsSk..", "..kwsSk..", ".kkwsSkk.", "kOyyyyyOk", ".kkknkkk.", "...kNk...", "...knk...", "..kyYyk..", "...kkk..."],
    'rocket': ["....kk....", "...krrk...", "..krrrrk..", "..kwwwWk..", ".kwwbbwWk.", ".kwbccbWk.", ".kwbccbWk.", ".kwwbbwWk.", ".kwwwwwWk.", "krwwwwwWrk", "krrwwwWrrk", "krrkSSkrrk", ".kkoyyokk.", "...kook...", "....kk...."],
    'planet': [".......kkkk.......", ".....kkooOOkk.....", "....kooooooOOk....", ".kkkoooooooooOkkk.", "kYYkooooooooOOkYYk", "kYYYYYYYYYYYYYYYYk", ".kyyyyyyyyyyyyyyk.", "..kkoooooooooOkk..", "....kooooooOOk....", ".....kkooOOkk.....", ".......kkkk......."],
    'basketball': [".....kkkkk.....", "....kookook....", "...koookoook...", "..kkoookoookk..", ".kokoookoookok.", "koookookookoook", "koookookookoook", "kkkkkkkkkkkkkkk", "koookookookoOOk", "koookookookOOOk", ".kokoookooOkOk.", "..kkoookoOOkk..", "...koookOOOk...", "....kookOOk....", ".....kkkkk....."],
    'coffee': ["...k..k.....", "..kWkkWk....", "...kWkkWk...", ".kkWkkWkk...", "kwwwwwwwwkk.", "kwNNNNNNwwwk", "kwwwwwwwWkwk", "krrrrrrrRkwk", "kwwwwwwwWwwk", "kwwwwwwwWkk.", ".kwwwwwwWk..", "..kWWWWWk...", "...kkkkk...."],
  };
  const PIXEL_NAMES = {
    heart: 'Heart', 'heart-pink': 'Pink heart', star: 'Star', sparkle: 'Sparkle', moon: 'Moon', flame: 'Little flame',
    raindrop: 'Raindrop', cloud: 'Cloud', umbrella: 'Umbrella', flower: 'Flower', leaf: 'Leaf', mushroom: 'Mushroom',
    cherry: 'Cherries', ghost: 'Ghost', crown: 'Crown', bolt: 'Lightning', gem: 'Gem', rainbow: 'Rainbow', eye: 'Eye',
    smiley: 'Smiley', bow: 'Bow', music: 'Music', cursor: 'Cursor', floppy: 'Floppy disk',
    controller: 'Controller', headphones: 'Headphones', skull: 'Skull', sword: 'Sword', rocket: 'Rocket', planet: 'Planet',
    basketball: 'Basketball', coffee: 'Coffee',
  };

  const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  // Pixels (rows of letters, each a colour) as rectangles, a run of one colour at a time (`dx`
  // along), and as a picture.
  function rectsOf(rows, colors, dx = 0) {
    let rects = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const c = row[x];
        let n = 1;
        while (x + n < row.length && row[x + n] === c) n++;
        if (c !== '.' && colors[c]) rects += `<rect x="${x + dx}" y="${y}" width="${n}" height="1" fill="${colors[c]}"/>`;
        x += n;
      }
    });
    return rects;
  }
  function pixelsSrc(rows, colors) {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rectsOf(rows, colors)}</svg>`)}`;
  }
  const pixelCache = new Map();
  // A pixel sticker as a picture.
  function pixelSrc(name) {
    if (!PIXEL[name]) return null;
    if (!pixelCache.has(name)) pixelCache.set(name, pixelsSrc(PIXEL[name], PAL));
    return pixelCache.get(name);
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
    // (Tartan: wide bands each way, darker where they cross, and thin lines.)
    plaid: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${a}"/><g fill="${b}" opacity=".32"><rect y="8" width="64" height="16"/><rect x="8" width="16" height="64"/></g><g fill="${b}" opacity=".7"><rect y="44" width="64" height="3"/><rect x="44" width="3" height="64"/></g><g fill="#ffffff" opacity=".12"><rect y="36" width="64" height="1.5"/><rect x="36" width="1.5" height="64"/></g></svg>`,
    // (Blotches in three shades, carrying on from one tile to the next.)
    camo: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><g id="c"><g fill="${b}" opacity=".55"><path d="M10 40C30 12 70 20 84 36s36 10 44 26-16 30-36 22-32 8-52 2-26-24-20-46Z"/><path d="M100 120c18-16 50-10 68 4s8 36-14 36-26 16-46 10-24-34-8-50Z"/></g><g fill="${b}"><path d="M60 100c14-12 32-4 34 10s-12 22-24 30-30 4-32-10 10-20 22-30Z"/><path d="M130 10c16-10 38-4 42 12s-14 22-26 32-30 4-30-12 2-24 14-32Z"/><path d="M20 130c10-6 20 0 18 10s-16 16-24 10-4-14 6-20Z"/></g><g fill="#000000" opacity=".25"><path d="M90 50c10-6 22 0 20 10s-16 12-22 4-4-10 2-14Z"/><path d="M150 80c10-6 22 2 18 12s-18 8-22 2-2-10 4-14Z"/><path d="M40 10c8-6 20-2 18 8s-14 10-20 4-4-8 2-12Z"/></g></g></defs><rect width="160" height="160" fill="${a}"/><use href="#c"/><use href="#c" x="-160"/><use href="#c" y="-160"/><use href="#c" x="-160" y="-160"/></svg>`,
    // (A honeycomb, in lines.)
    hexes: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="26"><rect width="45" height="26" fill="${a}"/><path d="M0 13 7.5 0h15L30 13l-7.5 13h-15ZM30 13h15" fill="none" stroke="${b}" stroke-width="1.6"/></svg>`,
    // (Traces and pads, carrying on from one tile to the next.)
    circuit: (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${a}"/><g fill="none" stroke="${b}" stroke-width="2" opacity=".85"><path d="M0 24h30l12 12v24h54M60 24h36M0 60h18M72 0v14M72 82v14M24 96V78l12-12h10M24 0v8"/></g><g fill="${b}"><circle cx="60" cy="24" r="3.5"/><circle cx="18" cy="60" r="3.5"/><circle cx="72" cy="14" r="3.5"/><circle cx="72" cy="82" r="3.5"/><circle cx="46" cy="66" r="3.5"/><circle cx="24" cy="8" r="3.5"/></g><g fill="${a}"><circle cx="60" cy="24" r="1.4"/><circle cx="18" cy="60" r="1.4"/><circle cx="72" cy="14" r="1.4"/><circle cx="72" cy="82" r="1.4"/><circle cx="46" cy="66" r="1.4"/><circle cx="24" cy="8" r="1.4"/></g></svg>`,
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

  // A friend button: an 88x31, the little badges old sites linked to each other with. It's made
  // from a friend (their name, and their card's colours and font), to take visitors to their page.
  // (About how wide each font's letters are, in em: the widest ones. The rest are about 0.6.)
  const LETTER_WIDTH = { tiny: 0.85, neon: 0.95, bubble: 0.72, terminal: 0.48, hand: 0.45 };
  function buttonPiece(node, p) {
    node.classList.add(`hp-button-${BUTTONS[p.style] ? p.style : 'bevel'}`);
    node.style.setProperty('--b1', hex(p.c1, '#000080'));
    node.style.setProperty('--b2', hex(p.c2, '#ffffff'));
    const kids = [];
    const icon = p.icon && PIXEL[p.icon];
    if (icon) {
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
      const two = text.includes('\n');
      words.className = `hp-button-words${two ? ' two' : ''}`;
      words.style.fontFamily = (FONTS[p.font] || FONTS.tiny).css;
      // (Long words get smaller to fit beside the sticker, rather than being cut off: the room
      // there, over about how wide this font's letters are.)
      const longest = Math.max(...text.split('\n').map((line) => [...line].length));
      const room = icon ? `86cqw - ${(64 / pixelRatio(p.icon)).toFixed(1)}cqh` : '90cqw';
      words.style.fontSize = `min(${two ? 27 : 34}cqh, calc((${room}) / ${(longest * (LETTER_WIDTH[p.font] || 0.6)).toFixed(2)}))`;
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
  // Someone's pet (lib/pets.js keeps it, and how fed and happy it is), drawn in pixels. It lives in
  // its room in the app, where its owner looks after it, and on their homepage too (unless they'd
  // rather it didn't): there it wanders about the part of the page that's showing (coming along
  // when it's scrolled), naps, and comes over to see what the pointer's up to. Petted, it hops and
  // hearts come up. Hungry, it mopes about (slowly, thinking of food) until it's fed; it never
  // gets ill or runs away. Everyone has three kinds to pick from, and Glow three more, each in a
  // few colours.

  // Its colours are letters in its picture (below): a, b, c and s are its coat's (main, light,
  // markings, shade); the rest are the same for every pet unless its coat says otherwise.
  const PETS = {
    cat: {
      label: 'Cat', name: 'Mochi', food: 'fish', speed: 52,
      coats: {
        ginger: { label: 'Ginger', a: '#f6a95c', b: '#fff1dc', c: '#d9782f', s: '#d4843f' },
        grey: { label: 'Grey', a: '#a8b0c2', b: '#eef0f6', c: '#7f889c', s: '#8a92a6' },
        black: { label: 'Black', a: '#3d3548', b: '#5a526c', c: '#2f2939', s: '#2f2939', e: '#ffd84d', p: '#ff9fbd' },
        snowy: { label: 'Snowy', a: '#fffaf2', b: '#ffffff', c: '#f1dcc0', s: '#e3d6c2' },
      },
    },
    dog: {
      label: 'Dog', name: 'Biscuit', food: 'bone', speed: 62,
      coats: {
        tan: { label: 'Tan', a: '#e2ad74', b: '#fff3e2', c: '#a8693c', s: '#c48a52' },
        brown: { label: 'Brown', a: '#a06c49', b: '#efd6b8', c: '#5e3a24', s: '#855638' },
        spotty: { label: 'Spotty', a: '#fbf8f3', b: '#ffffff', c: '#3d3548', s: '#ddd3c5' },
        smoky: { label: 'Smoky', a: '#959cae', b: '#eceef4', c: '#565d70', s: '#7a8195' },
      },
    },
    fish: {
      label: 'Fish', name: 'Bubbles', food: 'flakes', speed: 40, floats: true,
      coats: {
        goldfish: { label: 'Goldfish', a: '#ff9a3d', b: '#ffd9a0', c: '#ff6a3d', s: '#e07a2a' },
        blue: { label: 'Blue tang', a: '#4a9cf0', b: '#fff0a8', c: '#ffcc33', s: '#3478c8' },
        koi: { label: 'Koi', a: '#fff6ee', b: '#ffffff', c: '#ff5a3d', s: '#e8d8cc' },
        betta: { label: 'Betta', a: '#b36bff', b: '#f0dcff', c: '#ff5fb0', s: '#9150e0' },
      },
    },
    cloud: {
      label: 'Cloudlet', name: 'Nimbus', food: 'raindrop', speed: 34, floats: true, glow: true, joy: 'rainbow',
      coats: {
        day: { label: 'Fair', a: '#ffffff', b: '#d6e4fb', d: '#7fd0ff', g: '#bfe6ff' },
        dusk: { label: 'Dusk', a: '#efe6ff', b: '#cdbaf4', d: '#b99bff', g: '#d9c7ff' },
        storm: { label: 'Stormy', a: '#bcc3d4', b: '#8f99b0', d: '#7aa2ff', g: '#a5bcff' },
        candy: { label: 'Candy', a: '#ffe0ee', b: '#ffb9d9', d: '#ff8cc6', g: '#ffc6e3' },
      },
    },
    dragon: {
      label: 'Dragon', name: 'Ember', food: 'flame', speed: 46, glow: true, joy: 'flame',
      coats: {
        jade: { label: 'Jade', a: '#63d6ab', b: '#fff1b8', c: '#35a582', h: '#fff6dc', s: '#4fbf95', g: '#8dffd2' },
        violet: { label: 'Violet', a: '#ab85ff', b: '#ffe2f2', c: '#7a50dc', h: '#fff3d6', s: '#9570eb', g: '#d0b0ff' },
        ruby: { label: 'Ruby', a: '#f25869', b: '#ffdba6', c: '#b32b43', h: '#fff1d6', s: '#d8475a', g: '#ffa0ab' },
        gold: { label: 'Gold', a: '#ffcb52', b: '#fff6d4', c: '#df9420', h: '#fffbeb', s: '#efb33d', g: '#ffe38f' },
      },
    },
    fox: {
      label: 'Spirit fox', name: 'Wisp', food: 'cherry', speed: 66, glow: true, wisps: true,
      coats: {
        snow: { label: 'Snow', a: '#ebe6fb', b: '#ffffff', p: '#ffc2da', s: '#cbc2ea', g: '#8fd8ff' },
        ember: { label: 'Ember', a: '#ff9552', b: '#fff2e4', p: '#ffc4a8', s: '#e8803f', g: '#ffd84d' },
        twilight: { label: 'Twilight', a: '#9689ff', b: '#eeeaff', p: '#ffc8ee', s: '#7d6fe8', g: '#ff9ce8' },
        frost: { label: 'Frost', a: '#c6edff', b: '#ffffff', p: '#ffd0e4', s: '#a3d6ee', g: '#7efaff' },
      },
    },
  };
  // (e eyes, w their glint, n a nose, r cheeks, m a mouth open, t a tongue, p the inside of its
  // ears, h horns, d raindrops, g what glows, k a line.)
  const PET_INK = { k: '#2a1f33', w: '#ffffff', e: '#2a1f33', n: '#ff7f9f', r: '#ff9cbc', m: '#8a2b4c', t: '#ff6f8f', p: '#ffb3c6', h: '#fff6dc', d: '#7fd0ff', g: '#ffffff' };

  // Each pet in pixels (18 across, 14 down), facing right, standing (or floating): a letter a
  // pixel, its colour (above). A line's drawn round it. The rest of how it looks is made from this
  // one (petFrames): `eyes` are where its eyes are (each 2 by 2, from its top left), `mouth` where
  // it opens its mouth, `legs` the row its legs start on (lying down, the rest of it comes `drop`
  // rows down, over them), `head` the column its head starts at (it lowers it to eat), and the
  // changes for its tail (or fins) moving (`swish`) and its legs as it walks (`walk`), each
  // [x, y, 'letters'], from (x, y) along ('.' is nothing).
  const PET_PIXELS = {
    cat: {
      eyes: [[9, 4], [14, 4]], mouth: [12, 7], legs: 12, drop: 2, head: 8,
      rows: [
        '........a.......a.',
        '........ap.....pa.',
        '.a......aaacacaaa.',
        'a.......aaaaaaaaa.',
        'a.......aweaaawea.',
        'a.......aeeaaaeea.',
        '.a......arabnbara.',
        '..aacacaaabbbbbaa.',
        '..aacacaaaaaaaaa..',
        '..aaaaaaabbbb.....',
        '..aabbbbbbbba.....',
        '..aaaaaaaaaaa.....',
        '...s.a...s.a......',
        '...s.a...s.a......',
      ],
      swish: [[1, 2, '.a'], [0, 3, '.a']],
      walk: [[[0, 13, '..s...a.s...a.....']], [[0, 13, '....sa....sa......']]],
      sad: [[8, 0, '.'], [16, 0, '.']],
    },
    dog: {
      eyes: [[9, 4], [14, 4]], mouth: [12, 7], legs: 12, drop: 2, head: 7,
      rows: [
        '..................',
        '.........aaaaaaa..',
        '.......caaaaaaaaac',
        '.......caaaaaaaaac',
        '.a.....caweaaaweac',
        '.a.....caeeaaaeeac',
        '..a....carbbkbbrac',
        '..aaccaaaabbbbbaa.',
        '..aaccaaaaaaaaaa..',
        '..aaaaaaabbbb.....',
        '..aabbbbbbbba.....',
        '..aaaaaaaaaaa.....',
        '...s.a...s.a......',
        '...s.a...s.a......',
      ],
      swish: [[0, 4, 'a.']],
      walk: [[[0, 13, '..s...a.s...a.....']], [[0, 13, '....sa....sa......']]],
      glad: [[12, 7, 'm'], [12, 8, 't']],
    },
    fish: {
      eyes: [[11, 6]], mouth: [15, 7], floats: true,
      rows: [
        '..................',
        '..................',
        '.......ccc........',
        '......cccc........',
        'c....aaccaaaa.....',
        'cc..aacaaaaaaa....',
        '.ccaaaaaaaaweaa...',
        '..caaaaaaaaeeaam..',
        '.ccabbbbbbbbrba...',
        'cc..abbbbbbbba....',
        'c....aaaaaaaa.....',
        '......cc..........',
        '..................',
        '..................',
      ],
      swish: [[0, 4, '.c'], [0, 5, '.cc'], [0, 9, '.cc'], [0, 10, '.c'], [6, 11, '.cc']],
      walk: [[], [[0, 4, '.c'], [0, 5, '.cc'], [0, 9, '.cc'], [0, 10, '.c'], [6, 2, '..ccc'], [6, 11, '.cc']]],
      glad: [[15, 7, 'mm']],
      munch: [[15, 7, 'mk']],
    },
    cloud: {
      eyes: [[5, 5], [11, 5]], mouth: [8, 9], floats: true,
      rows: [
        '..................',
        '.......aaaa.......',
        '...aa.aaaaaa.aa...',
        '..aaaaaaaaaaaaaa..',
        '.aaaaaaaaaaaaaaaa.',
        '.aaaaeeaaaaeeaaaa.',
        'aaaaaeeaaaaeeaaaaa',
        'aaaaraaaaaaaaraaaa',
        'aaaaaaakaakaaaaaaa',
        '.aaaaaaakkaaaaaaa.',
        '.abbbbbbbbbbbbbba.',
        '..bbbbbbbbbbbbbb..',
        '....d...d...d.....',
        '..................',
      ],
      swish: [[0, 12, '..................'], [0, 13, '..d...d...d...d...']],
      walk: [[], [[0, 12, '..................'], [0, 13, '..d...d...d...d...']]],
      sleep: [[0, 12, '..................']],
      breathe: [],
      glad: [[8, 9, 'mm']],
      munch: [[8, 9, 'mm']],
      sad: [[0, 12, '..d..d..d..d..d...'], [0, 13, '....d.....d.......']],
    },
    dragon: {
      eyes: [[9, 4], [14, 4]], mouth: [12, 7], legs: 12, drop: 2, head: 8,
      rows: [
        '........h....h....',
        '.........h....h...',
        '........aaaaaaaaa.',
        '....cc..aaaaaaaaa.',
        '...cccc.aweaaawea.',
        '...ccccaaeeaaaeea.',
        '..c.cccaarbkbkbra.',
        '..aaaaaaaabbbbbaa.',
        '..aaaaaaaaaaaaaa..',
        'c.aaaaaaabbbb.....',
        'ccaabbbbbbbba.....',
        'c.aaaaaaaaaaa.....',
        '...s.a...s.a......',
        '...s.a...s.a......',
      ],
      swish: [[0, 2, '...cc...'], [0, 3, '..cccc..'], [0, 4, '...ccc..'], [0, 5, '....ccc']],
      walk: [[[0, 13, '..s...a.s...a.....']],
        [[0, 13, '....sa....sa......'], [0, 2, '...cc...'], [0, 3, '..cccc..'], [0, 4, '...ccc..'], [0, 5, '....ccc']]],
    },
    fox: {
      eyes: [[9, 4], [14, 4]], mouth: [12, 7], legs: 11, drop: 3, head: 8,
      rows: [
        '..gg....a.......a.',
        '.gggg...ap.....pa.',
        '.aaaa...aaaagaaaa.',
        'saaaas..aaaaaaaaa.',
        'ssaaas..aweaaawea.',
        '.saaa...aeeaaaeea.',
        '..aaa...abbbkbbba.',
        '...aaaaaaabbbbbaa.',
        '....aaaaaabbbbaa..',
        '....aaaaaabbbb....',
        '....aaaaaaaaaa....',
        '.....s.a...s.a....',
        '.....s.a...s.a....',
        '.....s.a...s.a....',
      ],
      swish: [[0, 0, '...gg'], [0, 1, '..gggg']],
      walk: [[[0, 13, '....s...a.s...a...']], [[0, 13, '......sa....sa....']]],
      sad: [[8, 0, '.'], [16, 0, '.']],
    },
  };

  // Its frames, each a picture in pixels (with its line round it, and a pixel's room past that):
  // standing, its tail moved, blinking, walking (two), lying down, asleep (two), glad (two: a
  // hop), eating (two), and hungry.
  const PET_FRAMES = 13;
  const framesMade = new Map();
  function petFrames(kind) {
    if (framesMade.has(kind)) return framesMade.get(kind);
    const P = PET_PIXELS[kind];
    const W = 18;
    const H = 14;
    const base = P.rows.map((r) => r.split(''));
    const copy = (g) => g.map((r) => r.slice());
    const put = (g, changes = [], dy = 0) => {
      for (const [x, y, s] of changes) {
        const row = g[y + dy];
        if (row) [...s].forEach((ch, i) => { if (ch !== ' ' && x + i >= 0 && x + i < W) row[x + i] = ch; });
      }
      return g;
    };
    const LOOK = {
      shut: (x, y) => [[x, y, 'aa'], [x, y + 1, 'kk']],
      glad: (x, y) => [[x, y, 'kk'], [x - 1, y + 1, 'kaak']],
      sad: (x, y) => [[x, y, 'aa'], [x, y + 1, 'ee']],
    };
    const eyes = (g, look, dy = 0) => {
      for (const [x, y] of P.eyes) put(g, LOOK[look](x, y), dy);
      return g;
    };
    // (Everything from column x0 on, n rows down.)
    const lower = (g, n, x0 = 0) => {
      for (let y = H - 1; y >= 0; y--) for (let x = x0; x < W; x++) g[y][x] = y >= n ? g[y - n][x] : '.';
      return g;
    };
    const drop = P.floats ? 0 : P.drop;
    const lying = () => {
      const g = copy(base);
      if (!P.floats) {
        for (let y = P.legs; y < H; y++) g[y].fill('.');
        lower(g, drop);
      }
      return g;
    };
    const mouth = P.glad || [[P.mouth[0], P.mouth[1], 'm']];
    const glad = () => put(eyes(copy(base), 'glad'), mouth);
    const asleep = () => put(eyes(lying(), 'shut', drop), P.sleep, drop);
    const eating = (open) => {
      const g = eyes(lying(), 'shut', drop);
      if (!P.floats) lower(g, 1, P.head); // (its head down, in its bowl)
      if (open) put(g, P.munch || [[P.mouth[0], P.mouth[1], 'm']], drop + (P.floats ? 0 : 1));
      return g;
    };
    const hop = (g) => {
      g.push(g.shift().fill('.'));
      return g;
    };
    const frames = [
      copy(base), put(copy(base), P.swish), eyes(copy(base), 'shut'),
      put(copy(base), P.walk[0]), put(copy(base), P.walk[1]),
      lying(), asleep(), put(asleep(), P.breathe || P.swish, drop),
      glad(), hop(glad()), eating(true), eating(false),
      put(eyes(copy(base), 'sad'), P.sad),
    ].map((g) => outlined(g, 2));
    framesMade.set(kind, frames);
    return frames;
  }

  // Pixels (rows of letters) with a line round them, `pad` pixels bigger each way.
  function outlined(rows, pad = 1) {
    const g = Array.from({ length: rows.length + pad * 2 }, () => Array(rows[0].length + pad * 2).fill('.'));
    rows.forEach((row, y) => [...row].forEach((ch, x) => { g[y + pad][x + pad] = ch; }));
    const on = (x, y) => Boolean(g[y] && g[y][x] && g[y][x] !== '.');
    const edge = [];
    g.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === '.' && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) edge.push([x, y]);
    }));
    for (const [x, y] of edge) g[y][x] = 'k';
    return g.map((r) => r.join(''));
  }

  // A pet's frames side by side, in its coat's colours: a picture for its background.
  const sheets = new Map();
  function petSheet(kind, coat) {
    const key = `${kind}:${coat}`;
    if (!sheets.has(key)) {
      const coats = PETS[kind].coats;
      const colors = { ...PET_INK, ...(coats[coat] || Object.values(coats)[0]) };
      const frames = petFrames(kind);
      const fw = frames[0][0].length;
      const rects = frames.map((f, i) => rectsOf(f, colors, i * fw)).join('');
      sheets.set(key, `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fw * frames.length} ${frames[0].length}" shape-rendering="crispEdges">${rects}</svg>`)}")`);
    }
    return sheets.get(key);
  }
  const PET_H = 18 / 22; // (how tall a pet's frame is, to how wide)

  // What each eats (for its bowl, and its thought bubble when it's hungry): a few of its own, and
  // pixel stickers for the rest.
  const FOODS = {
    fish: { rows: ['a...aaaa..', 'aa.aaaaaa.', 'aaaaaaaeaa', 'aa.aaaaaa.', 'a...aaaa..'], colors: { a: '#8ad7ff', e: '#2a1f33' } },
    bone: { rows: ['aa......aa', '.aaaaaaaa.', '.aaaaaaaa.', 'aa......aa'], colors: { a: '#fff8ec' } },
    flakes: { rows: ['a...b..c.', '..c...a..', '.b..a...b', '....c.b..', 'a.b....a.'], colors: { a: '#ff9f43', b: '#6ad07a', c: '#ffd84d' } },
  };
  const foodSrc = (food) => (FOODS[food] ? pixelsSrc(outlined(FOODS[food].rows), { k: '#2a1f33', ...FOODS[food].colors }) : pixelSrc(food) || pixelSrc('heart'));
  const DISH = pixelsSrc(outlined(['aaaaaaaaaaaaaa', 'bbbbbbbbbbbbbb', '.aaaaaaaaaaaa.', '..aaaaaaaaaa..', '....cccccc....']), { k: '#2a1f33', a: '#ff8fb1', b: '#ffc2d6', c: '#d6336c' });
  const BALL = pixelsSrc(outlined(['..aaa..', '.awaab.', 'awaaaab', 'aaaaaab', 'aaaaabb', '.aaabb.', '..bbb..']), { k: '#2a1f33', a: '#ff5f8f', w: '#ffffff', b: '#d6336c' });

  // A pet, as it looks: standing about, unless it's given something to do (the classes in
  // homepage.css: walk, run, rest, sleep, joy, eat, sad).
  function petEl(kind, coat) {
    const k = PETS[kind] ? kind : 'cat';
    const coats = PETS[k].coats;
    const c = coats[coat] ? coat : Object.keys(coats)[0];
    const node = document.createElement('div');
    node.className = `hp-pet hp-pet-${k}${PETS[k].glow ? ' hp-pet-glowy' : ''}`;
    node.style.setProperty('--pg', coats[c].g || '#ffffff');
    node.style.setProperty('--blink', `${(-Math.random() * 5).toFixed(2)}s`);
    node.innerHTML = `<span class="hp-pet-shadow"></span><span class="hp-pet-lift"><span class="hp-pet-bounce"><span class="hp-pet-in"><i class="hp-pet-sprite"></i>${PETS[k].wisps ? '<i class="hp-pet-wisp"></i><i class="hp-pet-wisp w2"></i>' : ''}</span></span></span>`;
    node.querySelector('.hp-pet-sprite').style.backgroundImage = petSheet(k, c);
    return node;
  }

  // How full and how happy, in words.
  const fullWords = (v) => (v >= 0.7 ? 'Full' : v >= 0.4 ? 'Peckish' : v >= 0.2 ? 'Hungry' : 'Very hungry');
  const happyWords = (v) => (v >= 0.7 ? 'Happy' : v >= 0.4 ? 'Content' : v >= 0.2 ? 'Bored' : 'Mopey');
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

  const PET_W = 110; // (how wide a pet is on a page: 5 of the page's pixels to one of its own; never less than 46 on the screen)
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Where a pet is: `box` is what it's in, `watch` where the pointer's watched, `card` where its
  // owner's card goes (or null), and view() the part of it that's showing, in its own units, and
  // where the pet can go there ({ s: the scale, w and h: the pet's size, top, bottom, x0, x1, y0,
  // y1: where its feet can be }); at(e): where a pointer event is, in its own units.
  // On a homepage: its canvas (in the page's units), the part of the page that's showing.
  function onPage(page, canvas, doc) {
    const scaleOf = (cr) => cr.width / (parseFloat(canvas.style.width) || WIDTH) || 1;
    return {
      box: canvas, watch: page, card: page.parentElement, scrolls: true,
      view() {
        const cr = canvas.getBoundingClientRect();
        const pr = page.getBoundingClientRect();
        const s = scaleOf(cr);
        const w = Math.max(PET_W, 46 / s);
        const h = w * PET_H;
        const top = (pr.top - cr.top) / s;
        const bottom = (pr.bottom - cr.top) / s;
        const x0 = Math.max(w / 2 + 4, (pr.left - cr.left) / s + w / 2 + 4);
        const x1 = Math.min(WIDTH - w / 2 - 4, (pr.right - cr.left) / s - w / 2 - 4);
        const y0 = Math.max(h + 6, top + h + 12);
        const y1 = Math.min((doc.height || 1000) - 6, bottom - 10);
        return { s, w, h, top, bottom, x0, x1: Math.max(x0, x1), y0, y1: Math.max(y0, y1) };
      },
      at(e) {
        const cr = canvas.getBoundingClientRect();
        const s = scaleOf(cr);
        return { x: (e.clientX - cr.left) / s, y: (e.clientY - cr.top) / s };
      },
    };
  }
  // In its room (the app's): the room's floor (a pet that floats can go anywhere in it), in pixels
  // the size of the room's own. nap(): where its bed is, if it has one.
  function inRoom(room, kind) {
    const size = () => {
      const P = roomPx(room);
      return { P, W: room.clientWidth || 480, H: room.clientHeight || P * ROOM_ROWS };
    };
    return {
      box: room, watch: room, card: null, scrolls: false,
      view() {
        const { P, W, H } = size();
        const w = 22 * P;
        const h = w * PET_H;
        // (Its feet on the open floor, in front of the furniture, which stands 13 rows up from the
        // bottom: never up on the skirting or a desk. A pet that floats can go anywhere.)
        const y0 = PETS[kind] && PETS[kind].floats ? h + P * 2 : Math.max(h + 6, P * (ROOM_ROWS - 11));
        return { s: 1, w, h, top: 0, bottom: H, x0: w / 2 + P, x1: Math.max(w / 2 + P, W - w / 2 - P), y0, y1: Math.max(y0, H - P * 2) };
      },
      nap() {
        const r = room.prRoom;
        const bed = (key) => Boolean(STANDS[key] && STANDS[key].nap);
        const side = r && (bed(r.left) ? 'left' : bed(r.right) ? 'right' : null);
        if (!side) return null;
        const { P, W, H } = size();
        const half = (thingOf('stand', r[side]).w * P) / 2;
        return { x: side === 'left' ? P * 3 + half : W - P * 3 - half, y: H - P * 15 };
      },
      at(e) {
        const r = room.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      },
    };
  }

  // A homepage's pet (the server sends it with the page, if its owner has it there), on the page.
  // The same pet carries on when the page is drawn again (the editor does, with every change).
  function petOn(page, canvas, doc, ctx) {
    const pet = ctx.pet;
    const key = [ctx.owner.id || '', pet.kind, pet.coat, pet.name].join('|');
    if (!page.hpPet || page.hpPet.key !== key) {
      if (page.hpPet) page.hpPet.stop();
      page.hpPet = petLife(pet, key);
    }
    page.hpPet.attach(onPage(page, canvas, doc), { info: pet, mine: ctx.mine, inert: ctx.edit, petUrl: `/api/homepages/${encodeURIComponent(ctx.owner.id || '')}/pet` });
    watchFor(page);
  }
  // Its owner's pet, in its room (the app's). Returns it, to feed and play with it there.
  function petRoom(room, pet, opts = {}) {
    const key = ['room', pet.kind, pet.coat, pet.name].join('|');
    if (!room.hpPet || room.hpPet.key !== key) {
      if (room.hpPet) {
        room.hpPet.stop();
        room.hpPet.node.remove();
      }
      room.hpPet = petLife(pet, key);
    }
    room.hpPet.attach(inRoom(room, pet.kind), { info: pet, mine: true, petUrl: '/api/pet/pet', ...opts });
    watchFor(room);
    return room.hpPet;
  }
  // (Where the pointer is: it comes to see.)
  function watchFor(el) {
    if (el.hpPetWatch) return;
    el.hpPetWatch = true;
    el.addEventListener('pointermove', (e) => { if (el.hpPet) el.hpPet.saw(e, false); }, { passive: true });
    el.addEventListener('pointerdown', (e) => { if (el.hpPet) el.hpPet.saw(e, true); }, { passive: true });
  }

  async function petCall(url) {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  function petLife(pet, key) {
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
    const thought = document.createElement('img');
    thought.alt = '';
    thought.src = foodSrc(K.food);
    think.append(thought);
    const bits = document.createElement('span');
    bits.className = 'hp-pet-bits';
    node.append(tag, think, bits);
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Pet ${name}`);
    const calm = Boolean(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const me = {
      where: null, opts: {}, raf: 0, t: 0, born: 0, v: null,
      x: NaN, y: NaN, z: 0, dir: Math.random() < 0.5 ? -1 : 1, w: 0,
      mode: 'idle', until: 0, tx: 0, ty: 0, plan: [], arrive: null, pointer: null, sawAt: 0,
      info: { full: 0.9, happy: 0.7, pets: 0 }, tagUntil: 0, thinkUntil: 0, nextThink: 0, nextZ: 0, nextBubble: 0, props: [],
    };

    const hungry = () => me.info.full < 0.2;
    const glad = () => me.info.happy >= 0.7 && !hungry();
    const LOOKS = { walk: ['walk'], run: ['walk', 'run'], chase: ['walk', 'run'], rest: ['rest'], sleep: ['rest', 'sleep'], eat: ['rest', 'eat'], joy: ['joy'] };
    function mode(m, secs = Infinity) {
      me.mode = m;
      me.until = me.t + secs;
      node.classList.remove('walk', 'run', 'rest', 'sleep', 'eat', 'joy');
      node.classList.add(...(LOOKS[m] || []));
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
    // Hearts, z's, sparkles and bubbles, coming up from it (and a Glow pet's own: a rainbow, a
    // puff of flame).
    function bit(kind, text = '') {
      const b = document.createElement('i');
      b.className = `hp-pet-bit hp-pet-${kind}`;
      if (text) b.textContent = text;
      const src = { heart: 'heart', spark: 'sparkle', rainbow: 'rainbow', flame: 'flame' }[kind];
      if (src) b.style.backgroundImage = `url("${pixelSrc(src)}")`;
      if (kind !== 'rainbow') b.style.left = `${(me.dir > 0 ? 70 : 30) + rand(-10, 10)}%`;
      b.style.setProperty('--drift', `${rand(-0.25, 0.25).toFixed(2)}`);
      b.addEventListener('animationend', () => b.remove());
      setTimeout(() => b.remove(), 3000); // (in case it doesn't move at all)
      bits.append(b);
    }
    const hearts = (n) => {
      for (let i = 0; i < n; i++) setTimeout(() => bit('heart'), i * 150);
      if (K.glow) for (let i = 0; i < n; i++) setTimeout(() => bit('spark'), 70 + i * 170);
      if (K.joy) bit(K.joy);
    };

    // (`free`: somewhere past where it can walk about, like up in its bed.)
    function walkTo(x, y, how = 'walk', free = false) {
      me.tx = free ? x : clampTo(x, me.v.x0, me.v.x1);
      me.ty = free ? y : clampTo(y, me.v.y0, me.v.y1);
      mode(how);
    }

    // (Its size, where it is.)
    function fit() {
      const v = (me.v = me.where.view());
      if (v.w !== me.w) {
        me.w = v.w;
        node.style.width = `${v.w}px`;
        node.style.height = `${v.h}px`;
        node.style.setProperty('--pw', `${v.w}px`);
      }
      return v;
    }
    // (Its room's changed size: it's the right size for it at once, and in it.)
    function refit() {
      if (!me.where || Number.isNaN(me.x)) return;
      const v = fit();
      me.x = clampTo(me.x, v.x0, v.x1);
      me.y = clampTo(me.y, v.y0, v.y1);
      me.tx = clampTo(me.tx, v.x0, v.x1);
      me.ty = clampTo(me.ty, v.y0, v.y1);
      render();
    }

    // What next: whatever it's been asked to (plan), or back into view, or something of its own.
    function decide() {
      const v = fit();
      const next = me.plan.shift();
      if (next) return next();
      if (Number.isNaN(me.x)) {
        me.x = rand(v.x0, v.x1);
        me.y = rand(v.y0, v.y1);
        return mode(calm ? 'rest' : 'idle', rand(0.6, 1.6));
      }
      if (calm) return mode('rest', 5);
      // (Scrolled out of sight: it comes along, from just past the nearest edge.)
      if (me.where.scrolls && (me.y < v.top - 40 || me.y > v.bottom + v.h + 40 || me.x < v.x0 - 80 || me.x > v.x1 + 80)) {
        me.y = me.y < v.top ? v.top - 4 : v.bottom + v.h + 4;
        me.x = clampTo(me.x, v.x0, v.x1);
        return walkTo(rand(v.x0, v.x1), me.y < v.top ? v.y0 + rand(0, 90) : v.y1 - rand(0, 90), 'run');
      }
      // (In a room that's been made smaller: back in it.)
      if (me.x < v.x0 || me.x > v.x1 || me.y < v.y0 || me.y > v.y1) return walkTo(me.x, me.y);
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
      if (r < 0.18 * lazy && me.t - me.born > 15) {
        // (It naps in its bed, if it has one: along the floor to it, then up into it. Otherwise
        // wherever it is on the floor. Awake, it hops back down.)
        const bed = me.where.nap && me.where.nap();
        if (!bed) return mode('sleep', rand(8, 16));
        walkTo(bed.x, me.y);
        me.arrive = () => {
          walkTo(bed.x, bed.y, 'walk', true);
          me.arrive = () => mode('sleep', rand(10, 18));
        };
        return;
      }
      if (glad() && r > 0.9) return walkTo(me.x + rand(-1, 1) * 360, me.y + rand(-1, 1) * 160, 'run');
      walkTo(me.x + rand(-1, 1) * 240, me.y + rand(-1, 1) * 140);
    }
    function arrived() {
      const then = me.arrive;
      me.arrive = null;
      if (then) return then();
      mode('idle', rand(1.2, 3.6));
    }

    function step(dt, t) {
      if (me.mode === 'walk' || me.mode === 'run' || me.mode === 'chase') {
        const dx = me.tx - me.x;
        const dy = me.ty - me.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 1.5) me.dir = dx > 0 ? 1 : -1;
        const go = K.speed * (me.mode === 'walk' ? 1 : 2.1) * (hungry() ? 0.6 : 1) * (me.w / PET_W) * dt;
        if (d <= go) {
          me.x = me.tx;
          me.y = me.ty;
          return arrived();
        }
        me.x += (dx / d) * go;
        me.y += (dy / d) * go;
      } else if (me.pointer && me.mode === 'idle' && t - me.pointer.at < 3 && Math.abs(me.pointer.x - me.x) > 24) {
        me.dir = me.pointer.x > me.x ? 1 : -1; // (standing about, it looks at the pointer)
      }
      if (K.floats) {
        const base = me.mode === 'sleep' ? 0.04 : me.mode === 'rest' || me.mode === 'eat' ? 0.07 : 0.12;
        me.z += (me.w * base + Math.sin(t * 2.1) * me.w * 0.03 - me.z) * Math.min(1, dt * 4);
      }
      if (me.mode === 'sleep' && t > me.nextZ) {
        me.nextZ = t + 1.4;
        bit('z', 'z');
      }
      if (kind === 'fish' && me.mode !== 'eat' && t > me.nextBubble) {
        me.nextBubble = t + rand(2.5, 6);
        bit('bubble');
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
      node.style.transform = `translate(${(me.x - me.w / 2).toFixed(1)}px, ${(me.y - me.w * PET_H).toFixed(1)}px)`;
      lift.style.transform = me.z ? `translateY(${(-me.z).toFixed(1)}px)` : '';
      inner.classList.toggle('left', me.dir < 0);
      node.classList.toggle('lf', me.dir < 0);
      const k = Math.min(0.5, me.z / (me.w * 0.6));
      shadow.style.transform = k ? `scale(${(1 - k).toFixed(3)})` : '';
      shadow.style.opacity = k ? String(1 - k) : '';
    }

    function frame(ms) {
      me.raf = 0;
      if (!node.isConnected || !me.where) return;
      const t = ms / 1000;
      const dt = me.t ? Math.min(0.1, t - me.t) : 0;
      me.t = t;
      if (!me.born) me.born = t;
      if (t >= me.until) decide();
      step(dt, t);
      if (!Number.isNaN(me.x)) render();
      me.raf = requestAnimationFrame(frame);
    }

    // Petted: it hops, hearts come up, and it's counted. (On their homepage, its owner gets its
    // card too.) Busy eating or chasing its ball, it carries on.
    function petted() {
      if (me.opts.inert) return;
      if (!me.plan.length && !me.arrive && me.mode !== 'eat') mode('joy', 1.3);
      hearts(3);
      showTag(3);
      petCall(me.opts.petUrl).then((d) => {
        if (!d || !d.pet) return;
        me.info = { ...me.info, ...d.pet };
        mood();
        if (me.opts.onInfo) me.opts.onInfo(me.info);
        const card = me.caring && cardOf();
        if (card && card.life === life) fillCare(card);
      }).catch(() => {});
      if (me.opts.mine && me.where.card) care();
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

    // Its owner's card, on their homepage: how it's doing, and feeding it or playing with it.
    const cardOf = () => me.where && me.where.card && me.where.card.querySelector('.hp-pet-care');
    function care() {
      const box = me.where.card;
      let card = cardOf();
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
      card.querySelector('.hp-pet-sub').textContent = `Petted ${n.toLocaleString()} ${n === 1 ? 'time' : 'times'} · yours ${days} ${days === 1 ? 'day' : 'days'}`;
      card.querySelector('.feed').textContent = `Feed ${name}`;
    }
    function closeCare() {
      const card = cardOf();
      if (card && card.life === life) card.hidden = true;
      me.caring = false;
    }
    async function tend(what) {
      const card = cardOf();
      const msg = card.querySelector('.hp-pet-msg');
      msg.hidden = true;
      let data;
      try {
        data = await petCall(`/api/pet/${what}`);
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
      if (info) me.info = { ...me.info, ...info };
      mood();
      if (me.opts.onInfo) me.opts.onInfo(me.info);
      if (!me.where || calm || Number.isNaN(me.x)) return hearts(3);
      const v = (me.v = me.where.view());
      me.plan = [];
      me.arrive = null;
      if (what === 'feed') {
        const bx = clampTo(me.x + me.dir * v.w * 0.95, v.x0, v.x1);
        const by = K.floats ? me.y - me.z : me.y;
        const bowl = prop('hp-pet-bowl', bx, by, v.w * 0.45);
        const food = document.createElement('i');
        food.style.backgroundImage = `url("${foodSrc(K.food)}")`;
        const dish = document.createElement('i');
        dish.style.backgroundImage = `url("${DISH}")`;
        bowl.append(food, dish);
        const side = bx >= me.x ? -1 : 1;
        walkTo(bx + side * v.w * 0.55, me.y);
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
        const ball = prop('hp-pet-ball', me.x, me.y - 4, v.w * 0.22);
        ball.style.backgroundImage = `url("${BALL}")`;
        let throws = 3;
        const toss = () => {
          const w = me.v;
          const bx = clampTo(me.x + rand(0.5, 1) * (Math.random() < 0.5 ? -1 : 1) * w.w * 2.2, w.x0, w.x1);
          const by = clampTo(me.y + rand(-1, 1) * w.h, w.y0, w.y1);
          place(ball, bx, by - 4, w.w * 0.22);
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
    // Something of its own where it is (a bowl, a ball), where it can see it.
    function prop(cls, x, y, w) {
      const n = document.createElement('span');
      n.className = cls;
      me.where.box.append(n);
      me.props.push(n);
      place(n, x, y, w);
      return n;
    }
    function place(n, x, y, w) {
      n.style.width = `${w}px`;
      n.style.height = `${w}px`;
      n.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - w).toFixed(1)}px)`;
    }

    // Where the pointer is, now and then.
    function saw(e, down) {
      if (!me.where || (!down && e.timeStamp - me.sawAt < 90)) return;
      me.sawAt = e.timeStamp;
      me.pointer = { ...me.where.at(e), at: me.t };
      if (down && me.caring && !node.contains(e.target)) closeCare();
    }

    function attach(where, opts) {
      me.where = where;
      me.opts = opts;
      if (opts.info) me.info = { ...me.info, ...opts.info };
      node.tabIndex = opts.inert ? -1 : 0;
      where.box.append(node);
      me.props = me.props.filter((n) => !n.classList.contains('gone'));
      for (const n of me.props) where.box.append(n);
      mood();
      if (!me.raf) me.raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (me.raf) cancelAnimationFrame(me.raf);
      me.raf = 0;
      me.t = 0;
      closeCare();
    }
    const life = { key, node, attach, stop, saw, did, refit, closeCare, tend, info: () => me.info };
    return life;
  }

  // ---------- A pet's room ----------
  // Where someone's pet lives in the app, in pixels like it: a wallpaper and a floor, a window with
  // the rain outside, a rug, something on the wall, and something in each corner (a pet bed is
  // where it naps). A few of each, and some of Glow's. Its owner picks them (lib/pets.js keeps
  // them). It's all measured in the room's own pixels (--px: the same size as its pet's), 42 of
  // them tall: 26 of wall and 16 of floor.

  const ROOM_ROWS = 42;
  const WALL_ROWS = 26;
  const ROOM_DEFAULT = { wall: 'stripes', floor: 'wood', rug: 'round', hang: 'none', left: 'plant', right: 'bed' };

  // (Pixels made to a shape: a flat oval in rings, from the middle out.)
  function oval(w, h, rings) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
        row += d > 1 ? '.' : rings[Math.min(rings.length - 1, Math.floor(d * rings.length))];
      }
      rows.push(row);
    }
    return rows;
  }
  // (A mat: a border, stripes, and a fringe at each end.)
  function mat(w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        if (x === 0 || x === w - 1) row += y % 2 ? 'w' : '.';
        else row += y === 0 || y === h - 1 || x === 1 || x === w - 2 ? 'a' : y % 3 === 1 ? 'c' : 'b';
      }
      rows.push(row);
    }
    return rows;
  }
  // (Fairy lights on a wire in two swoops, every other one dimmed or not.)
  function fairyLights(dim) {
    const W = 36;
    const g = Array.from({ length: 6 }, () => Array(W).fill('.'));
    const sag = (x) => Math.round(3 * Math.sin((Math.PI * (x % 18)) / 17));
    for (let x = 0; x < W; x++) g[sag(x)][x] = 'm';
    for (let i = 0, x = 2; x < W - 1; x += 4, i++) {
      const t = 'ypcg'[i % 4];
      const lit = dim ? i % 2 === 0 : true;
      g[sag(x) + 1][x] = lit ? t : t.toUpperCase();
      g[sag(x) + 2][x] = lit ? t : t.toUpperCase();
    }
    return g.map((r) => r.join(''));
  }
  // (A bookshelf: three shelves of books, all sorts.)
  function bookshelf() {
    const W = 14;
    const books = [[2, 4, 'r'], [1, 3, 'u'], [2, 4, 'g'], [1, 4, 'y'], [2, 3, 'p'], [1, 4, 'r'], [2, 4, 'u'], [1, 2, 'g'], [2, 4, 'y']];
    const rows = ['B'.repeat(W)];
    for (let shelf = 0, i = 0; shelf < 3; shelf++) {
      const band = Array.from({ length: 4 }, () => ['B', ...Array(W - 2).fill('d'), 'B']);
      for (let x = 1; x < W - 1;) {
        const [bw, bh, c] = books[i++ % books.length];
        for (let n = 0; n < bw && x < W - 1; n++, x++) for (let y = 4 - bh; y < 4; y++) band[y][x] = c;
      }
      rows.push(...band.map((r) => r.join('')), 'B'.repeat(W));
    }
    return rows;
  }
  // (A lava lamp, its blobs where they are: [x, y, how big].)
  function lavaLamp(blobs) {
    const widths = { 2: 3, 3: 5, 4: 5, 5: 5, 6: 5 };
    const rows = ['..mmm..', '..mmm..'];
    for (let y = 2; y <= 12; y++) {
      const w = widths[y] || 7;
      let row = '';
      for (let x = 0; x < 7; x++) {
        if (Math.abs(x - 3) > (w - 1) / 2) row += '.';
        else row += blobs.some(([bx, by, r]) => Math.hypot(x - bx, y - by) <= r) ? 'o' : 'l';
      }
      rows.push(row);
    }
    return [...rows, '.mmmmm.', 'mmmmmmm', 'mmmmmmm'];
  }
  // (The northern lights, in bands that wave.)
  function auroraTile() {
    const rows = [];
    for (let y = 0; y < WALL_ROWS; y++) {
      let row = '';
      for (let x = 0; x < 12; x++) {
        const wave = 6 + Math.round(2 * Math.sin((2 * Math.PI * x) / 12));
        const d = y - wave;
        row += d >= 0 && d < 2 ? 'g' : d >= 2 && d < 4 ? 't' : d >= 5 && d < 7 ? 'p' : y > 18 ? 'b' : 'a';
      }
      rows.push(row);
    }
    return rows;
  }

  // (A woven rug: a border, a row of diamonds, and a fringe at each end.)
  function woven(w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        if (x === 0 || x === w - 1) row += y % 2 ? 'w' : '.';
        else if (y === 0 || y === h - 1 || x === 1 || x === w - 2) row += 'c';
        else {
          const d = Math.abs(((x - 2) % 8) - 3.5) + Math.abs(y - (h - 1) / 2);
          row += d <= 1.5 ? 'c' : d <= 2.5 ? 'b' : 'a';
        }
      }
      rows.push(row);
    }
    return rows;
  }
  // (A dartboard: black and cream wedges, a red ring and a green one, the bull, and a dart in it.)
  function dartboard() {
    const n = 15;
    const g = [];
    for (let y = 0; y < n; y++) {
      const row = [];
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - n / 2;
        const dy = y + 0.5 - n / 2;
        const d = Math.hypot(dx, dy);
        const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8) % 2;
        row.push(d > 7.3 ? '.' : d > 6.4 ? 'K' : d > 5.5 ? 'r' : d > 3.6 ? (seg ? 'c' : 'K') : d > 2.7 ? 'g' : d > 1.3 ? (seg ? 'c' : 'K') : 'r');
      }
      g.push(row);
    }
    for (const [x, y, c] of [[8, 6, 's'], [9, 5, 's'], [10, 4, 's'], [11, 3, 'y'], [12, 2, 'y'], [11, 2, 'y'], [12, 3, 'y']]) g[y][x] = c;
    return g.map((r) => r.join(''));
  }
  // (A lightning bolt as a neon tube: just its edge.)
  function neonBolt() {
    const pts = [[6, 0], [12, 0], [8, 6.5], [12, 6.5], [3, 17], [5.5, 9], [1, 9]];
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    const m = Array.from({ length: 17 }, (_, y) => Array.from({ length: 13 }, (_, x) => inside(x + 0.5, y + 0.5)));
    const at = (x, y) => Boolean(m[y] && m[y][x]);
    return m.map((row, y) => row.map((v, x) => (v && !(at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) ? 'c' : '.')).join(''));
  }
  // (Tartan: wide bands each way, darker where they cross, and a thin red line.)
  function plaidTile() {
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let row = '';
      for (let x = 0; x < 16; x++) {
        const bx = x >= 4 && x < 8;
        const by = y >= 4 && y < 8;
        row += x === 12 || y === 12 ? 'r' : bx && by ? 'd' : bx || by ? 'n' : x === 0 || y === 0 ? 'l' : 'g';
      }
      rows.push(row);
    }
    return rows;
  }
  // (A city at night: buildings against the sky, their windows lit, and a few stars.)
  function cityTile() {
    const W = 32;
    const tops = [[0, 4, 13], [4, 6, 9], [10, 5, 15], [15, 3, 11], [18, 7, 7], [25, 5, 12], [30, 2, 16]]; // ([x, width, how tall])
    const g = Array.from({ length: WALL_ROWS }, (_, y) => Array(W).fill(y < 10 ? 'a' : 'b'));
    for (const [x, y] of [[3, 2], [13, 5], [22, 1], [28, 4], [8, 8]]) g[y][x] = 's';
    for (const [x0, w, tall] of tops) {
      for (let x = x0; x < Math.min(W, x0 + w); x++) for (let y = WALL_ROWS - tall; y < WALL_ROWS; y++) g[y][x] = 'h';
      for (let x = x0 + 1; x < Math.min(W, x0 + w) - 1; x += 2) for (let y = WALL_ROWS - tall + 2; y < WALL_ROWS - 1; y += 2) g[y][x] = (x * 7 + y * 3) % 5 === 0 ? 'h' : 'y';
    }
    return g.map((r) => r.join(''));
  }
  // (A pet bed: there are two.)
  const BED_ROWS = ['.....pppppppppppp.....', '...ppbbbbbbbbbbbbpp...', '..pbbbbbbbbbbbbbbbbp..', '.pbbbbbbbbbbbbbbbbbbp.', 'ppbbbbbbbbbbbbbbbbbbpp', 'pppbbbbbbbbbbbbbbbbppp', 'PpppppbbbbbbbbbbpppppP', '.PPPppppppppppppppPPP.', '...PPPPPPPPPPPPPPPP...'];

  // Wallpapers and floors: a tile each, repeated (and for some of Glow's, some of it twinkling).
  // (`perk`: one of Glow's.)
  const WALLS = {
    stripes: { label: 'Stripes', tile: ['aaabbb'], colors: { a: '#4b3f73', b: '#554880' } },
    dots: { label: 'Dots', tile: ['aaaaaaaa', 'abbaaaaa', 'abbaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'aaaaabba', 'aaaaabba', 'aaaaaaaa'], colors: { a: '#2f5d62', b: '#3f7a7f' } },
    checks: { label: 'Checks', tile: ['aaaabbbb', 'aaaabbbb', 'aaaabbbb', 'aaaabbbb', 'bbbbaaaa', 'bbbbaaaa', 'bbbbaaaa', 'bbbbaaaa'], colors: { a: '#7a4a55', b: '#86525e' } },
    bricks: { label: 'Bricks', tile: ['aaaaaaabaaaaaaab', 'aaaaaaabaaaaaaab', 'aaaaaaabaaaaaaab', 'bbbbbbbbbbbbbbbb', 'aaabaaaaaaabaaaa', 'aaabaaaaaaabaaaa', 'aaabaaaaaaabaaaa', 'bbbbbbbbbbbbbbbb'], colors: { a: '#8c4a3a', b: '#6e3a2e' } },
    hearts: {
      label: 'Hearts',
      tile: ['aaaaaaaaaaaa', 'abbabbaaaaaa', 'abbbbbaaaaaa', 'aabbbaaaaaaa', 'aaabaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'aaaaaaabbabb', 'aaaaaaabbbbb', 'aaaaaaaabbba', 'aaaaaaaaabaa', 'aaaaaaaaaaaa'],
      colors: { a: '#e9a3bd', b: '#d9779c' },
    },
    slate: { label: 'Slate', tile: ['baaaaaaaaaac', 'baaaaaaaaaac', 'baaaaadaaaac', 'baaaaaaaaaac', 'baaaaaaaaaac', 'baadaaaaaaac', 'baaaaaaaaaac', 'baaaaaaaaaac'], colors: { a: '#4b5563', b: '#56606e', c: '#3e4652', d: '#525c6a' } },
    panels: { label: 'Wood panels', tile: ['baaaacbaaaac', 'baadacbaaaac', 'baadacbaaaac', 'baaaacbadaac', 'baaaacbadaac', 'baaaacbaaaac', 'badaacbaaaac', 'badaacbaaadc', 'baaaacbaaadc', 'baaaacbaaaac'], colors: { a: '#6b4a32', b: '#7a5638', c: '#4f3523', d: '#5e412c' } },
    plaid: { label: 'Plaid', tile: plaidTile(), colors: { g: '#2f4a3a', l: '#3a5746', n: '#283a55', d: '#1f2c3f', r: '#9a3a3a' } },
    starlit: {
      label: 'Starlit', perk: true, twinkle: 'b',
      tile: ['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaacaaaa', 'aabaaaaaaaaaaaaa', 'abbbaaaaaaaaaaaa', 'aabaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaacaaaaaaaa', 'aaaaaaaaaaaaabaa',
        'aaaaaaaaaaaaaaaa', 'aaacaaaaaaaaaaaa', 'aaaaaaaaaabaaaaa', 'aaaaaaaaabbbaaaa', 'aaaaaaaaaabaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaacaaaaaaaca', 'aaaaaaaaaaaaaaaa'],
      colors: { a: '#141a3a', b: '#fff4c2', c: '#8f96c9' },
    },
    aurora: { label: 'Aurora', perk: true, twinkle: 'g', tile: auroraTile(), colors: { a: '#0f1a33', b: '#0b1328', g: '#5ff0b0', t: '#2a9f96', p: '#7a5cd6' } },
    city: { label: 'City at night', perk: true, twinkle: 'y', tile: cityTile(), colors: { a: '#0f1530', b: '#1a2246', s: '#cfd8ff', h: '#0a0d1c', y: '#ffd76a' } },
  };
  const FLOORS = {
    wood: { label: 'Wood', tile: ['aaaaaaaaaaaaaaab', 'acaaaaaaaaaaaaab', 'aaaaaaaaaaaaaaab', 'bbbbbbbbbbbbbbbb', 'aaaaaaabaaaaaaaa', 'aaaaaaabaaaaacaa', 'aaaaaaabaaaaaaaa', 'bbbbbbbbbbbbbbbb'], colors: { a: '#a8744c', b: '#8a5c3a', c: '#b8845a' } },
    // (Cream tiles with grout between them, each lit at its top and left edges.)
    tiles: { label: 'Tiles', tile: ['gggggggg', 'ghhhhhha', 'ghaaaaas', 'ghaaaaas', 'ghaaaaas', 'ghaaaaas', 'ghaaaaas', 'gassssss'], colors: { g: '#b3a48c', h: '#fbf6ec', a: '#ece3d1', s: '#d6cab3' } },
    carpet: { label: 'Carpet', tile: ['abac', 'baca', 'acab', 'caba'], colors: { a: '#5b4a8a', b: '#6a58a0', c: '#4f4079' } },
    grass: { label: 'Grass', tile: ['aaaaaaaa', 'abaaaaba', 'aaaacaaa', 'aaaaaaaa', 'aaabaaaa', 'baaaaaab', 'aaaaadaa', 'aaaaaaaa'], colors: { a: '#5fa84f', b: '#4f9442', c: '#ffd84d', d: '#ffffff' } },
    walnut: { label: 'Dark wood', tile: ['aaaaaaaaaaaaaaab', 'acaaaaaaaaaaaaab', 'aaaaaaaaaaaaaaab', 'bbbbbbbbbbbbbbbb', 'aaaaaaaaaaabaaaa', 'aaaaacaaaaabaaaa', 'aaaaaaaaaaabaaaa', 'bbbbbbbbbbbbbbbb'], colors: { a: '#5e3d27', b: '#46291a', c: '#6e4a30' } },
    stone: { label: 'Stone', tile: ['aaaaaaambbbbbbbm', 'aacaaaambbbbbcbm', 'aaaaaaambbbbbbbm', 'mmmmmmmmmmmmmmmm', 'bbbmaaaaaaambbbb', 'bbbmaaacaaambbbb', 'bbbmaaaaaaambbbb', 'mmmmmmmmmmmmmmmm'], colors: { a: '#7d8088', b: '#6f727a', c: '#8a8d95', m: '#55575e' } },
    clouds: {
      label: 'Clouds', perk: true,
      tile: ['aaaaaaaaaaaaaaaa', 'aabbbaaaaaaaaaaa', 'abbbbbaaaaabbaaa', 'abbbbbbaaabbbbaa', 'aabbbbaaaabbbbba', 'aaaccaaaaaabbbaa', 'aaaaaaaaaaacccaa', 'aaaaaaaaaaaaaaaa'],
      colors: { a: '#cfe9ff', b: '#ffffff', c: '#b3dcf7' },
    },
    crystal: { label: 'Crystal', perk: true, twinkle: 'c', tile: ['aaabbaaa', 'aabbbbaa', 'abbcbbba', 'bbcbbbbb', 'abbbbbba', 'aabbbbaa', 'aaabbaaa', 'aaaaaaaa'], colors: { a: '#5a3fa0', b: '#8a6fd6', c: '#e2d4ff' } },
  };
  // Rugs, things on the wall, and things for the corners: a picture each (or two, taking turns),
  // with a line round it unless it glows (`bare`).
  const RUGS = {
    none: { label: 'None' },
    round: { label: 'Round', rows: oval(36, 10, 'bbababa'), colors: { a: '#e8799f', b: '#f3a9c4' } },
    rect: { label: 'Striped', rows: mat(34, 9), colors: { a: '#3f6fc0', b: '#9fc3f5', c: '#f2f6ff', w: '#f2f6ff' } },
    woven: { label: 'Woven', rows: woven(34, 9), colors: { a: '#a8502f', b: '#e8d8b8', c: '#2f3f5f', w: '#e8d8b8' } },
    charcoal: { label: 'Charcoal', rows: oval(36, 10, 'bbababa'), colors: { a: '#4a4e57', b: '#5d626c' } },
    magic: { label: 'Magic circle', perk: true, glow: '#9ae8ff', bare: true, rows: oval(38, 10, '...c.b.a').map((r, y) => (y === 4 || y === 5 ? r.replace(/c/g, 'w') : r)), colors: { a: '#7efaff', b: '#b58cff', c: '#b58cff', w: '#ffffff' } },
  };
  const HANGS = {
    none: { label: 'None' },
    picture: {
      label: 'Picture',
      rows: ['ffffffffffffff', 'fuuuuuuuuuuyyf', 'fuuuuuuuuuyyyf', 'fuuuuuuuuuuyuf', 'fuuuuuuuuuuuuf', 'fuuugguuuuuuuf', 'fuuggggguuuguf', 'fugggggggggggf', 'fGgggGggggggGf', 'fGGGGGGGGGGGGf', 'ffffffffffffff'],
      colors: { f: '#c89a5a', u: '#8fd3ff', y: '#ffd84d', g: '#6ad07a', G: '#3f9e57' },
    },
    clock: {
      label: 'Clock',
      rows: ['...aaaaa...', '.aaawwwaaa.', '.awwwkwwwa.', 'aawwwkwwwaa', 'awwwwkwwwwa', 'awwwwkkkwwa', 'awwwwwwwwwa', 'aawwwwwwwaa', '.awwwwwwwa.', '.aaawwwaaa.', '...aaaaa...'],
      colors: { a: '#ef4d5e', w: '#fff8ec' },
    },
    shelf: {
      label: 'Shelf',
      rows: ['...g................', '..ggg.......r.......', '.gGgGg....yyru.pp...', '..gGg.....yyruupp...', '..ooo.....yyruupp...', '..ooo.....yyruupp...', 'bbbbbbbbbbbbbbbbbbbb', 'BBBBBBBBBBBBBBBBBBBB', '..B..............B..'],
      colors: { g: '#6ad07a', G: '#3f9e57', o: '#e07a4a', b: '#b8845a', B: '#8a5c3a', y: '#ffd84d', r: '#ef4d5e', u: '#4c8dff', p: '#a57bff' },
    },
    guitar: {
      label: 'Guitar',
      rows: ['...NNN...', '..tNNNt..', '..tNNNt..', '....n....', '....n....', '....n....', '....n....', '....n....', '..bbnbb..', '.bbbnbbB.', '.bbbbbbB.', '..bbbbB..', '.bbbbbbB.', 'bbbhhhbbB', 'bbbhhhbbB', 'bbbbbbbbB', 'bbbNNNbBB', '.bbbbbbB.', '..BBBBB..'],
      colors: { N: '#4a2f22', n: '#7a4a2a', t: '#d8d8d8', b: '#d9893f', B: '#b06a2a', h: '#3a2a22' },
    },
    darts: { label: 'Dartboard', rows: dartboard(), colors: { K: '#26262b', c: '#efe6cf', r: '#d64545', g: '#3f9e57', s: '#cfd3dc', y: '#ffd84d' } },
    lights: {
      label: 'Fairy lights', perk: true, glow: '#fff1a8', bare: true, frames: [fairyLights(false), fairyLights(true)],
      colors: { m: '#7a7a92', y: '#ffd84d', Y: '#8a7a3a', p: '#ff6fb5', P: '#7a3a5c', c: '#7fe3ff', C: '#3a6a7a', g: '#8dff7a', G: '#3f6a3a' },
    },
    neon: {
      label: 'Neon heart', perk: true, glow: '#ff5fc8', bare: true, flicker: true,
      rows: ['..ppp...ppp..', '.p...p.p...p.', 'p.....p.....p', 'p...........p', 'p...........p', '.p.........p.', '..p.......p..', '...p.....p...', '....p...p....', '.....p.p.....', '......p......'],
      colors: { p: '#ff7ad6' },
    },
    bolt: { label: 'Neon bolt', perk: true, glow: '#4fe0ff', bare: true, flicker: true, rows: neonBolt(), colors: { c: '#7ff6ff' } },
  };
  const STANDS = {
    none: { label: 'None' },
    plant: {
      label: 'Plant',
      rows: ['....g.....', '..g.gg..g.', '.gg.gGg.gg', '.gGggGggGg', '..gGgGgGg.', 'g..gGGGg..', 'gg.ggGgg.g', '.gggGGgggg', '..ggGGgGg.', '...gGGgg..', '..OOOOOO..', '..oooooo..', '...oooo...', '...oooo...', '...oooo...', '...OOOO...'],
      colors: { g: '#6ad07a', G: '#3f9e57', o: '#e07a4a', O: '#b85a33' },
    },
    lamp: {
      label: 'Lamp', glow: '#ffd27a',
      rows: ['..yyyyy..', '.yyyyyyy.', '.yyyyyyy.', 'yyyyyyyyy', 'yyyyyyyyy', 'YYYYYYYYY', ...Array(15).fill('....m....'), '...mmm...', '..mmmmm..', '.mmmmmmm.'],
      colors: { y: '#ffd27a', Y: '#e0a84a', m: '#6a6f80' },
    },
    bed: { label: 'Pet bed', nap: true, rows: BED_ROWS, colors: { p: '#e8799f', b: '#ffc2d6', P: '#c95c80' } },
    bedgrey: { label: 'Grey pet bed', nap: true, rows: BED_ROWS, colors: { p: '#5b6372', b: '#c3c8d2', P: '#454b57' } },
    books: { label: 'Bookshelf', rows: bookshelf(), colors: { B: '#8a5c3a', d: '#4a2f22', r: '#ef4d5e', u: '#4c8dff', g: '#6ad07a', y: '#ffd84d', p: '#a57bff' } },
    desk: {
      label: 'Desk',
      rows: ['..mmmmmmmmmmm.......', '..mbbbbbbbbbm.......', '..mbccbbbbbbm.......', '..mbcbbbbbbbm.......', '..mbbbbbbbbbm.......', '..mmmmmmmmmmm.......', '.......m.......ww...', '.....mmmmm.KK..wwW..', 'tttttttttttttttttttt', 'TTTTTTTTTTTTTTTTTTTT', 'T..........DDDDDDDDT', 'T..........DddddddDT', 'T..........DDDDDDDDT', 'T..........DddddddDT', 'T..........DDDDDDDDT'],
      colors: { m: '#3a3f4b', b: '#3d6fd6', c: '#9fd0ff', w: '#f2f2f2', W: '#cfcfcf', K: '#262a33', t: '#9a6b45', T: '#7a5234', D: '#6b4a32', d: '#8a5f3d' },
    },
    armchair: {
      label: 'Armchair',
      rows: ['...bbbbbbbbbb...', '..baaaaaaaaaac..', '..baaaaaaaaaac..', '..baaaaaaaaaac..', 'bbbaaaaaaaaaacbb', 'baacaaaaaaaacaac', 'baacbbbbbbbbcaac', 'baacaaaaaaaacaac', 'baaccccccccccaac', 'baaaaaaaaaaaaaac', 'cccccccccccccccc', '.l............l.'],
      colors: { a: '#6b7280', b: '#7d8492', c: '#565c68', l: '#4a3424' },
    },
    aquarium: {
      label: 'Aquarium', perk: true, glow: '#8fd8ff',
      frames: [
        ['mmmmmmmmmmmmmmmmmm', 'caaaaaaaaaaaaaaaac', 'caaaaaaaaaaawaaaac', 'caaaaaaaaaaaaaaaac', 'caaaooaaaaaaaawaac', 'caaoooooaaaaaaaaac', 'caaaooaaaaaaaaaaac', 'caaaaaaaaaaaaagaac', 'cagaaaaaaaaaaggaac', 'caggaaaaaaaaaagaac', 'cyyyyyyyyyyyyyyyyc', 'mmmmmmmmmmmmmmmmmm', '.bbbbbbbbbbbbbbbb.', '.b..............b.', '.b..............b.', '.bb............bb.'],
        ['mmmmmmmmmmmmmmmmmm', 'caaaaaaaaaaaaawaac', 'caaaaaaaaaaaaaaaac', 'caaaaaaaaaaaawaaac', 'caaaaaaooaaaaaaaac', 'caaaaaoooooaaaaaac', 'caaaaaaooaaaaaaaac', 'caaaaaaaaaaaaagaac', 'cagaaaaaaaaaaggaac', 'caggaaaaaaaaaagaac', 'cyyyyyyyyyyyyyyyyc', 'mmmmmmmmmmmmmmmmmm', '.bbbbbbbbbbbbbbbb.', '.b..............b.', '.b..............b.', '.bb............bb.'],
      ],
      colors: { m: '#8a8fa3', c: '#cdeeff', a: '#5fb4e8', o: '#ff9a3d', w: '#e6f7ff', g: '#4fbf6a', y: '#e3c27a', b: '#8a5c3a' },
    },
    lava: {
      label: 'Lava lamp', perk: true, glow: '#c08aff',
      frames: [lavaLamp([[2, 4, 1.1], [4, 10, 1.5]]), lavaLamp([[3, 6, 1.2], [3, 9, 1.4]])],
      colors: { m: '#9aa0b5', l: '#8a5cff', o: '#ff9a3d' },
    },
    arcade: {
      label: 'Arcade machine', perk: true, glow: '#7fd8ff',
      frames: [
        ['aaaaaaaaaaaa', 'ammmmmmmmmma', 'amMmmMmmMmma', 'aaaaaaaaaaaa', 'aAssssssssAa', 'aAssgsssssAa', 'aAsgggssssAa', 'aAssgsssysAa', 'aAssssssssAa', 'aAssssssssAa', 'aaaaaaaaaaaa', 'cccccccccccc', 'ccrccccbyccc', 'aaaaaaaaaaaa', 'aAAAAAAAAAAa', 'aAAAyyyyAAAa', 'aAAAAAAAAAAa', 'aAAAAAAAAAAa', 'aAAAAAAAAAAa', 'aAAAAAAAAAAa', 'aaaaaaaaaaaa'],
        ['aaaaaaaaaaaa', 'aMmmMmmMmmma', 'ammmmmmmmmma', 'aaaaaaaaaaaa', 'aAssssssssAa', 'aAssssgsssAa', 'aAsssgggssAa', 'aAssssgsssAa', 'aAssyyssssAa', 'aAssssssssAa', 'aaaaaaaaaaaa', 'cccccccccccc', 'ccrccccbyccc', 'aaaaaaaaaaaa', 'aAAAAAAAAAAa', 'aAAAyyyyAAAa', 'aAAAAAAAAAAa', 'aAAAAAAAAAAa', 'aAAAAAAAAAAa', 'aAAAAAAAAAAa', 'aaaaaaaaaaaa'],
      ],
      colors: { a: '#2b2f3d', A: '#363b4d', m: '#ff5fa8', M: '#ffd0e6', s: '#13233f', g: '#7dff8a', y: '#ffd84d', c: '#4a5068', r: '#ef4d5e', b: '#4c8dff' },
    },
  };
  const ROOM = { wall: WALLS, floor: FLOORS, rug: RUGS, hang: HANGS, stand: STANDS };
  // (Which list each place in the room picks from.)
  const ROOM_SLOTS = { wall: 'wall', floor: 'floor', rug: 'rug', hang: 'hang', left: 'stand', right: 'stand' };

  // The window, and the rain outside it.
  const WINDOW = pixelsSrc(outlined(['aaaaaaaaaaaaaaaaaaaa', ...Array(5).fill('a........aa........a'), 'aaaaaaaaaaaaaaaaaaaa', ...Array(5).fill('a........aa........a'), 'aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb', '.cccccccccccccccccc.']), { k: '#2a1f33', a: '#8a5a3c', b: '#b07a52', c: '#5e3f2c' });
  const RAIN = pixelsSrc(['nnnnnnnn', 'nrnnnnnn', 'nrnnnnnn', 'nnnnnnnn', 'nnnnnrnn', 'nnnnnrnn', 'nnnnnnnn', 'nnnnnnnn'], { n: '#1a2350', r: '#8fb8ff' });
  const BASEBOARD = pixelsSrc(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'], { a: '#c89a6a', b: '#8a5c3a', c: '#5e3f2c' });

  const thingSrc = new Map();
  // A thing's picture (its frames side by side), and how big it is, in the room's pixels.
  function thingOf(list, key) {
    const id = `${list}:${key}`;
    if (!thingSrc.has(id)) {
      const t = ROOM[list][key];
      if (!t || (!t.rows && !t.frames && !t.tile)) {
        thingSrc.set(id, null);
      } else if (t.tile) {
        const twinkle = t.twinkle ? t.tile.map((r) => r.replace(new RegExp(`[^${t.twinkle}]`, 'g'), '.')) : null;
        thingSrc.set(id, { src: pixelsSrc(t.tile, t.colors), twinkle: twinkle && pixelsSrc(twinkle, t.colors), w: t.tile[0].length, h: t.tile.length });
      } else {
        const frames = (t.frames || [t.rows]).map((f) => (t.bare ? f : outlined(f)));
        const colors = { k: '#2a1f33', ...t.colors };
        const fw = frames[0][0].length;
        const rects = frames.map((f, i) => rectsOf(f, colors, i * fw)).join('');
        const src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fw * frames.length} ${frames[0].length}" shape-rendering="crispEdges">${rects}</svg>`)}`;
        const still = frames.length > 1 ? pixelsSrc(frames[0], colors) : src;
        thingSrc.set(id, { src, still, w: fw, h: frames[0].length, frames: frames.length });
      }
    }
    return thingSrc.get(id);
  }

  // A room's pixel: as big as its pet's (a pet is 22 of them across).
  const roomPx = (el) => Math.round(clampTo((el.clientWidth || 480) * 0.24, 88, 132) / 22);
  const roomOf = (room) => {
    const r = { ...ROOM_DEFAULT };
    for (const [slot, list] of Object.entries(ROOM_SLOTS)) if (room && ROOM[list][room[slot]]) r[slot] = room[slot];
    return r;
  };

  // Furnishing a room (`room`: what's in it; anything not in it is as it was to begin with).
  function furnish(el, room) {
    const r = roomOf(room);
    el.prRoom = r;
    el.classList.add('pr-room');
    const px = roomPx(el);
    el.style.setProperty('--px', `${px}px`);
    if (!el.prSized) {
      el.prSized = true;
      new ResizeObserver(() => {
        el.style.setProperty('--px', `${roomPx(el)}px`);
        if (el.hpPet) el.hpPet.refit();
      }).observe(el);
    }
    let scene = el.querySelector('.pr-scene');
    if (!scene) {
      scene = document.createElement('div');
      scene.className = 'pr-scene';
      scene.setAttribute('aria-hidden', 'true');
      el.prepend(scene);
    }
    const layer = (cls, t, fill) => {
      const n = document.createElement('i');
      n.className = cls;
      if (!t) return n;
      n.style.backgroundImage = `url("${t.src}")`;
      if (fill) {
        n.style.backgroundSize = `calc(var(--px) * ${t.w}) calc(var(--px) * ${t.h})`;
        if (t.twinkle) {
          const tw = document.createElement('i');
          tw.className = 'pr-twinkle';
          tw.style.backgroundImage = `url("${t.twinkle}")`;
          tw.style.backgroundSize = n.style.backgroundSize;
          n.append(tw);
        }
      } else {
        n.style.width = `calc(var(--px) * ${t.w})`;
        n.style.height = `calc(var(--px) * ${t.h})`;
        if (t.frames > 1) n.classList.add('pr-frames');
      }
      return n;
    };
    const thing = (slot) => {
      const list = ROOM_SLOTS[slot];
      const key = r[slot];
      const info = ROOM[list][key];
      const n = layer(`pr-thing pr-${slot} pr-${key}`, thingOf(list, key));
      if (info && info.glow) {
        n.classList.add('pr-glow');
        n.style.setProperty('--glow', info.glow);
      }
      if (info && info.flicker) n.classList.add('pr-flicker');
      return n;
    };
    const win = document.createElement('i');
    win.className = 'pr-window';
    win.style.setProperty('--frame', `url("${WINDOW}")`);
    win.style.setProperty('--rain', `url("${RAIN}")`);
    const base = layer('pr-base', null);
    base.style.backgroundImage = `url("${BASEBOARD}")`;
    scene.replaceChildren(layer('pr-wall', thingOf('wall', r.wall), true), layer('pr-floor', thingOf('floor', r.floor), true), base, win,
      thing('rug'), thing('hang'), thing('left'), thing('right'));
  }

  // One of a room's things (or a wallpaper or floor), small: to pick it.
  function roomSwatch(list, key) {
    const n = document.createElement('i');
    n.className = `pr-swatch pr-swatch-${list}`;
    const t = thingOf(list, key);
    if (!t) {
      n.classList.add('pr-none');
      return n;
    }
    if (list === 'wall' || list === 'floor') {
      n.style.backgroundImage = `url("${t.src}")`;
      n.style.backgroundSize = `${t.w * 4}px ${t.h * 4}px`;
    } else {
      n.style.backgroundImage = `url("${t.still}")`;
    }
    return n;
  }

  // ---------- Effects for visitors (Glow's) ----------
  // A trail behind a visitor's pointer, and a burst where they click or tap: drawn on a canvas over
  // the page, only while there's something to draw (and not at all for anyone who asks for less
  // motion).

  const FX_COLORS = {
    sparkles: ['#fff6c9', '#ffffff', '#ffe08a', '#dccbff'], hearts: ['#ff6b9d', '#ff8fc6', '#ff4d6d', '#ffc2d9'],
    stars: ['#ffd84d', '#ffe98a', '#ffb347', '#fff3b0'], raindrops: ['#8ad7ff', '#6ec3f2', '#b5e6ff'],
    confetti: ['#ff5f8f', '#ffa24c', '#ffe14d', '#6be07e', '#57c7ff', '#a57bff'],
    pixels: ['#7dff8a', '#57c7ff', '#ff5f8f', '#ffd84d', '#ffffff'], fireworks: ['#ffd84d', '#ff6b6b', '#7ff6ff', '#9dff7a', '#c99bff', '#ffa24c'],
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
      if (!g || parts.length >= 200 || (!FX_SHAPES && !['ring', 'bubble', 'bit', 'square', 'spark'].includes(p.shape))) return;
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
      pixels: (x, y) => add({ shape: 'square', x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-12, 12), vy: rand(-6, 30), g: 70, size: rand(3, 6), life: 0.8, color: anyOf(FX_COLORS.pixels) }),
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
      // (A shell going off: streaks out every way, in a colour, and some in another.)
      fireworks: (x, y) => {
        const c1 = anyOf(FX_COLORS.fireworks);
        const c2 = anyOf(FX_COLORS.fireworks);
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2 + rand(-0.06, 0.06);
          const v = rand(170, 250) * (i % 3 ? 1 : 0.6);
          add({ shape: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 150, size: 2, life: rand(0.9, 1.25), color: i % 3 ? c1 : c2, drag: 1.7 });
        }
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
      if (p.shape === 'spark') {
        // (A streak, along the way it's going.)
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.strokeStyle = p.color;
        g.lineWidth = p.size;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        g.stroke();
        return;
      }
      if (p.shape === 'square') {
        // (A pixel: square on, on whole pixels.)
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = p.color;
        const q = Math.round(p.size);
        g.fillRect(Math.round(p.x - q / 2), Math.round(p.y - q / 2), q, q);
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
    if (ctx.pet && PETS[ctx.pet.kind]) {
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

  // The weather on a page (behind its pieces), or on someone's card. (A thunderstorm has more to it:
  // clouds drifting along the top, and lightning. Only drawn again when it's changed, so it carries
  // on as the page or card around it is.)
  const SKY_PARTS = { storm: ['hp-storm-clouds far', 'hp-storm-clouds', 'hp-storm-bolt far', 'hp-storm-bolt'] };
  function setSky(sky, kind) {
    const k = SKIES[kind] ? kind : 'none';
    if (sky.dataset.sky === k) return;
    sky.dataset.sky = k;
    sky.className = `hp-sky hp-sky-${k}`;
    sky.replaceChildren(...(SKY_PARTS[k] || []).map((cls) => {
      const part = document.createElement('i');
      part.className = cls;
      return part;
    }));
  }

  window.Homepage = {
    WIDTH, FONTS, EFFECTS, BOXES, FRAMES, TAPES, PAPERS, ME_STYLES, PATTERNS, SKIES, PERKS, PIXEL, PIXEL_NAMES,
    COUNTERS, GUESTBOOKS, MUSICS, SHELVES, BUTTONS, ASKS, PETS, TRAILS, CLICKS, PIECE_NAMES,
    pixelSrc, pixelRatio, backgroundStyle, patternSwatch, patternLayer, pieceEl, starter, mount, setSky, light, hush,
    petEl, petRoom, petMeters, fullWords, happyWords,
    ROOM, ROOM_DEFAULT, ROOM_SLOTS, furnish, roomSwatch,
    // (its owner fed the page's pet, or played with it, from elsewhere: it does it)
    petDid: (page, what, info) => { if (page.hpPet) page.hpPet.did(what, info); },
    // (the sheet of a pet's frames, to look at them)
    petSheet,
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
