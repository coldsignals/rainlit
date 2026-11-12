'use strict';

// Pets (public/homepage.js draws them, in pixels): someone's own pet. It lives in its room in the
// app, where its owner looks after it, and on their homepage too unless they'd rather it didn't
// (lib/homepages.js), where anyone who can see the page can pet it.
//
// How full it is and how happy, each from 0 to 1, wear off as time goes by: full to hungry in
// three days, and happy to glum in two, unless it's petted or played with. Feeding it fills it up
// (and cheers it a little); playing makes it happy (and a little hungry); every pet cheers it up
// (a twentieth of the way from glum to happy). It never gets ill or runs
// away: hungry, it just mopes about until it's fed. A new pet comes fed and fairly happy.
//
// Everyone can have a cat, a dog or a fish; Glow (lib/supporters.js) brings a droplet (Rainlit's
// own little drop), a dragon and a spirit fox. One of Glow's stays someone's if their Glow ends, until they change it for
// another kind (like Glow's themes: lib/themes.js).
//
// It can wear things too (got with dew: WEAR): one on its head, its eyes, round its neck and on its
// body, which it wears everywhere it goes. They're its owner's (kept with dew), so a new pet can
// wear them too.
//
// Its room is its owner's to do up: a wallpaper, the weather out its window and a floor, and its
// things, put wherever they like (as many as THINGS_MAX): on the floor, on the wall (the window's
// one of those), hanging from the ceiling, and rugs. Each can be flipped, and made a little bigger or
// smaller. A few of each, and some of Glow's (kept the same way), and some that dew brings
// (lib/dew.js). It's kept with their account, not the pet, so it stays if they let their pet go and
// adopt another.

const { db, transaction } = require('./db');
const supporters = require('./supporters');

// Each kind, with its colours.
const KINDS = { cat: ['ginger', 'grey', 'black', 'snowy'], dog: ['tan', 'brown', 'spotty', 'smoky'], fish: ['goldfish', 'blue', 'koi', 'betta'] };
const GLOW_KINDS = { drop: ['lamp', 'rain', 'dusk', 'mint'], dragon: ['jade', 'violet', 'ruby', 'gold'], fox: ['snow', 'ember', 'twilight', 'frost'] };
const LABELS = { cat: 'cat', dog: 'dog', fish: 'fish', drop: 'droplet', dragon: 'dragon', fox: 'spirit fox' };
const NAME_MAX = 24;

const FULL_MS = 3 * 86_400_000;
const HAPPY_MS = 2 * 86_400_000;

class PetError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const oneLine = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const worn = (v, at, span, now) => Math.round(Math.max(0, Math.min(1, v - (now - at) / span)) * 1000) / 1000;
const rowOf = (userId) => db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId) || null;

// What a pet can wear (public/homepage.js draws each), in each place, and what each costs in dew
// (lib/dew.js): a few soon, more as it goes, some a long way off.
const WEAR = {
  head: { bow: 2_500, beanie: 50_000, party: 1e6, cap: 25e6, tophat: 5e9, crown: 50e12, propeller: 250e12, sprout: 15_000, beret: 3e6, cowboy: 300e6, halo: 20e12, wizard: 2e15 },
  eyes: { round: 25_000, sun: 10e6, star: 1e12, three: 500_000, aviator: 75e9, monocle: 400e12 },
  neck: { collar: 5_000, bandana: 250_000, bowtie: 100e6, spiked: 50e9, scarf: 2e12, bell: 40_000, lei: 30e6, medal: 5e12 },
  body: { stripes: 5e6, hoodie: 500e6, knit: 10e12, rainlit: 1e15, raincoat: 50e6, varsity: 3e9, tux: 200e9 },
};
// More to wear (public/pet-more.js draws them): from where those leave off, a long way on.
const MORE_WEAR = {
  head: { cone: 900e15, chef: 25e18, hardhat: 900e18, ushanka: 20e21, tricorn: 300e21, viking: 6e24, antenna: 200e24, frostcrown: 6e27 },
  eyes: { patch: 7.5e18, goggles: 500e18, welding: 100e21, snorkel: 9e24, visor: 600e24 },
  neck: { necktie: 10e18, lanyard: 750e18, sailor: 120e21, pendant: 12e24, chain: 900e24 },
  body: { flannel: 3e18, hivis: 90e18, leather: 4e21, wetsuit: 150e21, parka: 2.5e24, chainmail: 120e24, spacesuit: 4e27 },
};
for (const slot of Object.keys(MORE_WEAR)) Object.assign(WEAR[slot], MORE_WEAR[slot]);
// (What each can't wear: the droplet's all drop, with no neck for a collar and no body for a
// sweater, though a bowtie suits it. public/homepage.js says the same.)
// Glow's (for someone with Glow; kept on if they stop, but not put on again).
const GLOW_WEAR = { head: ['wish'], eyes: ['led'], neck: ['neon'], body: ['galaxy'] };
const isWear = (slot, key) => Object.hasOwn(WEAR, slot) && (Object.hasOwn(WEAR[slot], key) || GLOW_WEAR[slot].includes(key));
const WEAR_NOT = { drop: { neck: ['collar', 'bandana', 'spiked', 'scarf', 'bell', 'lei', 'medal', 'neon', 'necktie', 'lanyard', 'sailor', 'pendant', 'chain'], body: true } };
const canWear = (kind, slot, key) => {
  const no = WEAR_NOT[kind] && WEAR_NOT[kind][slot];
  return !(no === true || (Array.isArray(no) && no.includes(key)));
};
// (What it's wearing, from how it's kept: only what there is, and, given its `kind`, only what that
// can wear. Something it can't stays kept, for if it's changed back.)
function wornOf(v, kind) {
  let w = {};
  try {
    w = JSON.parse(v || '{}') || {};
  } catch {}
  const out = {};
  for (const slot of Object.keys(WEAR)) {
    if (typeof w[slot] === 'string' && isWear(slot, w[slot]) && (!kind || canWear(kind, slot, w[slot]))) out[slot] = w[slot];
  }
  return out;
}

// Someone's pet as it is now (null: they haven't one).
function get(userId) {
  const r = rowOf(userId);
  if (!r) return null;
  const now = Date.now();
  return {
    kind: r.kind, name: r.name, coat: r.coat, home: Boolean(r.home), wear: wornOf(r.wear, r.kind),
    full: worn(r.full, r.full_at, FULL_MS, now), happy: worn(r.happy, r.happy_at, HAPPY_MS, now),
    pets: r.pets, since: r.adopted_at, fedAt: r.fed_at, slot: r.slot, capsules: capsulesOf(userId),
  };
}

// What a visitor to its room sees of it (null: they haven't one). Not how full or happy it is:
// that's for its owner (a pet's no one else's chore).
function visiting(userId) {
  const p = get(userId);
  return p && { kind: p.kind, name: p.name, coat: p.coat, wear: p.wear, pets: p.pets, since: p.since };
}

// What anyone who can see their homepage sees of it (null: it isn't there).
function onHomepage(userId) {
  const p = get(userId);
  return p && p.home ? { kind: p.kind, name: p.name, coat: p.coat, wear: p.wear, full: p.full, happy: p.happy, pets: p.pets, since: p.since } : null;
}

// Adopting one, or changing it: its kind, its name, its colours, and whether it's on their
// homepage (b: whichever of those are changing).
function set(user, b) {
  const r = rowOf(user.id);
  const kind = b.kind === undefined && r ? r.kind : String(b.kind || '');
  const coats = KINDS[kind] || GLOW_KINDS[kind];
  if (!coats || !Object.hasOwn(LABELS, kind)) throw new PetError("That isn't one of the pets.");
  if (GLOW_KINDS[kind] && !supporters.active(user) && !(r && r.kind === kind)) throw new PetError(`The ${LABELS[kind]} comes with Glow.`, 403);
  const name = b.name === undefined ? (r ? r.name : '') : oneLine(b.name);
  const coat = coats.includes(b.coat) ? b.coat : r && r.kind === kind && coats.includes(r.coat) ? r.coat : coats[0];
  const home = b.home === undefined ? (r ? r.home : 1) : b.home ? 1 : 0;
  if (r) {
    db.prepare('UPDATE pets SET kind = ?, name = ?, coat = ?, home = ? WHERE user_id = ?').run(kind, name, coat, home, user.id);
  } else {
    const now = Date.now();
    db.prepare('INSERT INTO pets (user_id, kind, name, coat, home, full, full_at, happy, happy_at, adopted_at) VALUES (?, ?, ?, ?, ?, 0.9, ?, 0.7, ?, ?)')
      .run(user.id, kind, name, coat, home, now, now, now);
  }
  return get(user.id);
}

// Putting something on it (`key`: one of WEAR's for that place, got with dew), or taking it off ('').
function setWear(user, slot, key) {
  const r = mustHave(user.id);
  if (!Object.hasOwn(WEAR, slot)) throw new PetError("That isn't somewhere for it to wear something.");
  const wear = wornOf(r.wear);
  if (!key) delete wear[slot];
  else if (!isWear(slot, key)) throw new PetError("That isn't one of the things it can wear.");
  else if (!canWear(r.kind, slot, key)) throw new PetError(`That doesn't fit a ${LABELS[r.kind]}.`);
  else if (GLOW_WEAR[slot].includes(key)) {
    if (wear[slot] !== key && !supporters.active(user)) throw new PetError('That comes with Glow.', 403);
    wear[slot] = key;
  } else if (wear[slot] !== key && !dewItems(user.id).has(`wear:${key}`)) throw new PetError('That comes with dew: collect enough of it, and get it in Wear.', 403);
  else wear[slot] = key;
  db.prepare('UPDATE pets SET wear = ? WHERE user_id = ?').run(JSON.stringify(wear), user.id);
  return get(user.id);
}

// Letting it go: it's gone, and how it was doing with it. (One resting in a capsule comes out in
// its place: the first of them.)
function release(userId) {
  const r = rowOf(userId);
  if (!r) return;
  transaction(() => {
    db.prepare('DELETE FROM pets WHERE user_id = ?').run(userId);
    const next = resting(userId)[0];
    if (next) wake(userId, next, r.home, Date.now());
  });
}

// ----- Capsules -----
// With Glow, three of them: a pet in each, one of them out (in the room, on the homepage, the one
// that's fed and petted) and the others resting, just as they were when they went in: they don't
// get hungry or glum in there. Each has its own name, colours and clothes; the room, the dew and
// everything got with it are their owner's, whichever is out. If Glow ends they all stay, but
// there's no swapping: the one that's out is their pet until it's back.
const CAPSULES = 3;
const resting = (userId) => db.prepare('SELECT * FROM pet_capsules WHERE user_id = ? ORDER BY slot').all(userId);
const capsulesOf = (userId) => resting(userId).map((c) => ({ slot: c.slot, kind: c.kind, name: c.name, coat: c.coat, wear: wornOf(c.wear, c.kind), pets: c.pets, since: c.adopted_at }));
// (Out of its capsule: as full and as happy as it went in, from now.)
function wake(userId, c, home, now) {
  db.prepare('INSERT INTO pets (user_id, slot, kind, name, coat, wear, home, full, full_at, happy, happy_at, pets, fed_at, adopted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, c.slot, c.kind, c.name, c.coat, c.wear, home ? 1 : 0, c.full, now, c.happy, now, c.pets, c.fed_at, c.adopted_at);
  db.prepare('DELETE FROM pet_capsules WHERE user_id = ? AND slot = ?').run(userId, c.slot);
}
// Swapping to the pet in another capsule, or, it's empty, adopting one into it (b: its kind, and
// maybe its name and colours). The one that was out goes to rest in its own.
function swap(user, slot, b = {}) {
  const r = mustHave(user.id);
  if (!supporters.active(user)) throw new PetError('Pet capsules come with Glow.', 403);
  if (!Number.isInteger(slot) || slot < 0 || slot >= CAPSULES) throw new PetError("That isn't one of the capsules.");
  if (slot === r.slot) return get(user.id);
  const c = db.prepare('SELECT * FROM pet_capsules WHERE user_id = ? AND slot = ?').get(user.id, slot);
  const kind = String(b.kind || '');
  const coats = KINDS[kind] || GLOW_KINDS[kind];
  if (!c && (!coats || !Object.hasOwn(LABELS, kind))) throw new PetError("That isn't one of the pets.");
  const now = Date.now();
  transaction(() => {
    db.prepare('INSERT INTO pet_capsules (user_id, slot, kind, name, coat, wear, full, happy, pets, fed_at, adopted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, r.slot, r.kind, r.name, r.coat, r.wear, worn(r.full, r.full_at, FULL_MS, now), worn(r.happy, r.happy_at, HAPPY_MS, now), r.pets, r.fed_at, r.adopted_at);
    db.prepare('DELETE FROM pets WHERE user_id = ?').run(user.id);
    if (c) wake(user.id, c, r.home, now);
    else {
      db.prepare('INSERT INTO pets (user_id, slot, kind, name, coat, home, full, full_at, happy, happy_at, adopted_at) VALUES (?, ?, ?, ?, ?, ?, 0.9, ?, 0.7, ?, ?)')
        .run(user.id, slot, kind, oneLine(b.name), coats.includes(b.coat) ? b.coat : coats[0], r.home, now, now, now);
    }
  });
  return get(user.id);
}

// The admin taking someone's homepage down: their pet's name goes, and it's off the page.
function hide(userId) {
  db.prepare("UPDATE pets SET name = '', home = 0 WHERE user_id = ?").run(userId);
}

function mustHave(userId) {
  const r = rowOf(userId);
  if (!r) throw new PetError("There's no pet to look after yet.", 404);
  return r;
}
const nameOf = (r) => r.name || `Your ${LABELS[r.kind] || 'pet'}`;
function change(userId, fields) {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE pets SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...keys.map((k) => fields[k]), userId);
}

// Its owner feeding it (not when it's full).
function feed(userId) {
  const r = mustHave(userId);
  const s = get(userId);
  if (s.full > 0.9) throw new PetError(`${nameOf(r)} is full! Try again in a while.`, 409);
  const now = Date.now();
  change(userId, { full: Math.min(1, s.full + 0.45), full_at: now, happy: Math.min(1, s.happy + 0.1), happy_at: now, fed_at: now });
  return get(userId);
}

// ...and playing with it (a game at a time: one every 15 seconds counts).
function play(userId) {
  const r = mustHave(userId);
  const s = get(userId);
  const now = Date.now();
  if (r.played_at && now - r.played_at < 15_000) return s;
  change(userId, { happy: Math.min(1, s.happy + 0.25), happy_at: now, full: Math.max(0, s.full - 0.04), full_at: now, played_at: now });
  return get(userId);
}

// Someone petting it (its owner, or anyone on its owner's homepage, by id or, not signed in, a
// key for where they are: lib/homepages.js visitorKey()). A pet a second counts, and at most 300 an
// hour from anyone. (Who petted what is only kept in memory, for an hour at most.)
const pettedAt = new Map(); // `${ownerId}:${who}` -> when
const petting = new Map(); // who -> { n, since }
setInterval(() => {
  const hour = Date.now() - 3600_000;
  for (const [k, at] of pettedAt) if (at < hour) pettedAt.delete(k);
  for (const [k, w] of petting) if (w.since < hour) petting.delete(k);
}, 10 * 60_000).unref();

function petIt(ownerId, who) {
  mustHave(ownerId);
  const now = Date.now();
  const key = `${ownerId}:${who}`;
  const hour = petting.get(who);
  if (now - (pettedAt.get(key) || 0) < 1000 || (hour && now - hour.since < 3600_000 && hour.n >= 300)) return false;
  if (pettedAt.size > 50_000) pettedAt.clear();
  if (petting.size > 50_000) petting.clear();
  pettedAt.set(key, now);
  if (!hour || now - hour.since >= 3600_000) petting.set(who, { n: 1, since: now });
  else hour.n++;
  const s = get(ownerId);
  db.prepare('UPDATE pets SET pets = pets + 1, happy = ?, happy_at = ? WHERE user_id = ?').run(Math.min(1, s.happy + 0.05), now, ownerId);
  return true;
}

// ---------- Its room ----------
// Everyone's things, and Glow's, for each place in the room (public/homepage.js draws them).
const ROOM = {
  wall: ['stripes', 'dots', 'checks', 'bricks', 'hearts', 'slate', 'panels', 'plaid'],
  floor: ['wood', 'tiles', 'carpet', 'grass', 'walnut', 'stone'],
  rug: ['round', 'rect', 'woven', 'charcoal'],
  hang: ['window', 'picture', 'clock', 'shelf', 'guitar', 'darts'],
  stand: ['plant', 'lamp', 'bed', 'bedgrey', 'books', 'desk', 'armchair'],
  ceiling: ['pendant', 'hangplant', 'lantern'],
  sky: ['auto', 'rain', 'clear', 'snow', 'sunny', 'sunset'], // (out its window: auto changes by itself)
  light: ['day', 'warm', 'cool'], // (its light: daylight, or a little warmer or cooler)
};
const GLOW_ROOM = {
  wall: ['starlit', 'aurora', 'city', 'nebula'], floor: ['clouds', 'crystal', 'neongrid'], rug: ['magic'], hang: ['lights', 'neon', 'bolt', 'moonlamp'],
  stand: ['aquarium', 'lava', 'arcade', 'plasma', 'jukebox'], ceiling: ['disco', 'mobile', 'ufo'], sky: ['storm', 'aurora', 'meteors'], light: ['aurora', 'disco'],
};
// Things that dew brings (lib/dew.js), and how much each costs: anyone's, once they've collected
// that much and spent it (and theirs from then on). Goals for the long run: for someone who keeps
// at it, the umbrella in a first sitting, then on and on, to the terrarium after a couple of weeks
// of Rainlit being open.
const DEW_ROOM = {
  hang: { umbrella: 75_000, poster: 2e12, mirror: 900_000, map: 70e9, rainbow: 777e9, cuckoo: 8e12 },
  floor: { moss: 5e6, checker: 150e9, pebbles: 40e6, parquet: 8e9, marble: 2e15 },
  wall: { leaves: 75e6, retro: 750e12, raindrops: 3e6, cabin: 400e9, waves: 60e12 },
  ceiling: { raincloud: 500e6, chimes: 4e6, chandelier: 900e12 },
  rug: { leaf: 1e9, puddle: 250_000, persian: 15e12 },
  sky: { fog: 10e9, fireflies: 1.2e9, rainbow: 77e12 },
  stand: { barrel: 30e12, records: 7.5e15, terrarium: 100e15, boots: 150_000, cactus: 20e6, stove: 600e9, telescope: 40e12, piano: 3e15 },
  light: { golden: 5e6, lamplit: 300e6, moon: 40e9, candle: 2e12, neon: 90e12 },
};
// More for its room (public/pet-more.js draws them): ice, the backrooms, under the sea, deep space,
// a workshop, a castle. From where those leave off, to a long way past the last of the collectors.
const MORE_ROOM = {
  hang: { vent: 600e15, tools: 15e18, skis: 120e18, snowflake: 1.2e21, anchor: 6e21, banner: 30e21, exit: 750e21, swords: 4e24, wheel: 40e24, starmap: 300e24, porthole: 7.5e27 },
  floor: { concrete: 1.5e18, dampcarpet: 50e18, sand: 2e21, flagstone: 40e21, ice: 1.2e24, plate: 50e24, moon: 2e27 },
  wall: { pegboard: 2e18, backrooms: 60e18, castle: 2.5e21, hull: 50e21, frost: 1.5e24, bubbles: 75e24, deco: 2.5e27 },
  ceiling: { bulb: 2.5e18, pipes: 75e18, tube: 3e21, icicles: 60e21, fan: 2e24, planets: 90e24, jelly: 3e27 },
  rug: { tatami: 4e18, hazard: 150e18, starfish: 9e21, pond: 500e21, compass: 20e24, orbit: 1e27 },
  sky: { dunes: 5e18, hallway: 200e18, blizzard: 10e21, sea: 600e21, volcano: 25e24, earthrise: 1.5e27 },
  stand: { wetfloor: 500e15, toolbox: 1e18, cabinet: 12e18, anvil: 20e18, snowman: 40e18, coral: 250e18, cooler: 300e18, workbench: 1.5e21, icebed: 5e21, helmet: 15e21, crystal: 25e21, rocket: 200e21, kelp: 400e21, armor: 900e21, vending: 3e24, moonbed: 15e24, crt: 30e24, snowglobe: 150e24, chest: 250e24, grandclock: 400e24, fireplace: 5e27, orrery: 10e27 },
  light: { hum: 6e18, icy: 400e18, ember: 75e21, deep: 7.5e24, starlight: 500e24 },
};
for (const list of Object.keys(MORE_ROOM)) Object.assign(DEW_ROOM[list], MORE_ROOM[list]);
const dewItems = (userId) => {
  const r = db.prepare('SELECT items FROM dew WHERE user_id = ?').get(userId);
  try {
    return new Set(JSON.parse(r ? r.items : '[]'));
  } catch {
    return new Set();
  }
};
// The room all round: one of each (the window's weather goes in every window).
const SLOTS = { wall: 'wall', floor: 'floor', sky: 'sky', light: 'light' };
const ROOM_DEFAULT = { wall: 'stripes', floor: 'wood', sky: 'auto', light: 'day' };
// Its things, each where it's been put: `x` from one side to the other (0 to 1: as far left as it
// goes, to as far right), `y` in the room's own pixels from its top (42 of them: 26 of wall, then
// the floor): the top of a thing on the wall or hanging from the ceiling (on a cord that long), and
// the bottom of a rug or of something standing on the floor (as far back as the skirting, to the
// front). `size`: three quarters as big, to half as big again, in eighths. `flip`: facing the
// other way. `tint`: in its own colours (0), or one of its three others (public/homepage.js TINTS).
const THING_LISTS = ['stand', 'hang', 'ceiling', 'rug'];
// The room's size, in its own pixels (public/homepage.js says the same): how many across and down,
// how many of those are wall (the rest is floor), and how many things fit. It grows a tier at a
// time, each bought with dew (lib/dew.js room): wider, then a higher ceiling, and so on. A room
// that's wider than the app's view of it is looked round. Each tier's its own size, its things
// placed in it (`x` of the way across, `y` rows down): growing a tier keeps them where they were
// (growRoom). More tiers can come after these.
const ROOM_TIERS = [
  { cols: 92, rows: 42, wall: 26, things: 24 },
  { cols: 115, rows: 42, wall: 26, things: 28, label: 'A wider room', about: 'A quarter as wide again.', cost: 1e9 },
  { cols: 115, rows: 49, wall: 31, things: 32, label: 'A higher ceiling', about: 'More wall to hang things on.', cost: 100e9 },
  { cols: 138, rows: 49, wall: 31, things: 36, label: 'Wider still', about: 'Half as wide again as it began.', cost: 10e12 },
  { cols: 138, rows: 56, wall: 36, things: 40, label: 'A high ceiling', about: 'Higher still, with a deeper floor.', cost: 5e15 },
  { cols: 184, rows: 56, wall: 36, things: 48, label: 'A grand room', about: 'Twice as wide as it began.', cost: 5e18 },
];
const tierOf = (v) => (Number.isInteger(v) && v >= 0 && v < ROOM_TIERS.length ? v : 0);
const geoOf = (tier) => ROOM_TIERS[tierOf(tier)];
// (Where each kind of thing can be, rows down: its top for what's on the wall or hangs from the
// ceiling, its bottom for a rug or what stands on the floor.)
const thingY = (list, geo) => ({ hang: [0, geo.wall + 2], ceiling: [0, geo.wall - 2], rug: [geo.wall + 2, geo.rows], stand: [geo.wall + 3, geo.rows] })[list];
const THINGS_MAX = ROOM_TIERS[ROOM_TIERS.length - 1].things;
const isThing = (list, key) => THING_LISTS.includes(list) && (ROOM[list].includes(key) || GLOW_ROOM[list].includes(key) || Object.hasOwn(DEW_ROOM[list], key));
function thingOf(t, geo = ROOM_TIERS[0]) {
  const list = String((t && t.list) || ''), key = String((t && t.key) || '');
  if (!t || typeof t !== 'object' || !isThing(list, key)) return null;
  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const [y0, y1] = thingY(list, geo);
  return {
    list, key, x: Math.round(num(t.x, 0, 1, 0.5) * 1000) / 1000, y: Math.round(num(t.y, y0, y1, y0)), size: Math.round(num(t.size, 0.75, 1.5, 1) * 8) / 8, flip: t.flip === true,
    tint: Number.isInteger(t.tint) ? Math.min(3, Math.max(0, t.tint)) : 0,
  };
}
// (A room from before things could be moved: its window, something on the wall, a rug and a thing in
// each corner, just where they were. A bed stood a little out from the wall.)
const LEGACY = { rug: ['rug', 'round'], hang: ['hang', 'none'], left: ['stand', 'plant'], right: ['stand', 'bed'] };
function legacyThings(saved) {
  const of = (slot) => {
    const [list, d] = LEGACY[slot];
    return isThing(list, String(saved[slot])) || saved[slot] === 'none' ? saved[slot] : d;
  };
  const out = (key) => (key === 'bed' || key === 'bedgrey' ? 3 : 0);
  const things = [{ list: 'hang', key: 'window', x: 0.1, y: 3 }];
  if (of('hang') !== 'none') things.push({ list: 'hang', key: of('hang'), x: 0.5, y: 5 });
  if (of('rug') !== 'none') things.push({ list: 'rug', key: of('rug'), x: 0.5, y: 40 });
  if (of('left') !== 'none') things.push({ list: 'stand', key: of('left'), x: 0.04, y: 29 + out(of('left')) });
  if (of('right') !== 'none') things.push({ list: 'stand', key: of('right'), x: 0.96, y: 29 + out(of('right')) });
  return things.map((t) => thingOf(t));
}

function roomOf(userId) {
  const r = db.prepare('SELECT pet_room FROM users WHERE id = ?').get(userId);
  let saved = {};
  try {
    saved = JSON.parse((r && r.pet_room) || '{}') || {};
  } catch {}
  const room = { ...ROOM_DEFAULT };
  for (const [slot, list] of Object.entries(SLOTS)) {
    if (ROOM[list].includes(saved[slot]) || GLOW_ROOM[list].includes(saved[slot]) || Object.hasOwn(DEW_ROOM[list], String(saved[slot]))) room[slot] = saved[slot];
  }
  room.tier = tierOf(saved.tier);
  const geo = geoOf(room.tier);
  room.things = Array.isArray(saved.things) ? saved.things.map((t) => thingOf(t, geo)).filter(Boolean).slice(0, geo.things) : legacyThings(saved);
  return room;
}

// The room grown to the next tier (lib/dew.js room pays for it): its things kept where they were,
// spread from the middle as it widens (the new space at both ends), floor things and rugs as far
// up from the floor's front and wall things as far up the wall as the ceiling rises. Returns the
// room as it is now.
function growRoom(userId) {
  const room = roomOf(userId);
  if (!ROOM_TIERS[room.tier + 1]) throw new PetError("Its room is as big as rooms go, for now.", 409);
  room.things = grownThings(room.things, room.tier, room.tier + 1);
  room.tier += 1;
  db.prepare('UPDATE users SET pet_room = ? WHERE id = ?').run(JSON.stringify(room), userId);
  return room;
}
// (Things placed in one tier's room, as they'd be in a bigger tier's: a tier at a time.)
function grownThings(things, fromTier, toTier) {
  let list = things;
  for (let k = fromTier; k < toTier; k++) {
    const from = ROOM_TIERS[k], to = ROOM_TIERS[k + 1];
    const down = { hang: to.wall - from.wall, ceiling: 0, rug: to.rows - from.rows, stand: to.rows - from.rows };
    list = list.map((t) => thingOf({ ...t, x: 0.5 + (t.x - 0.5) * (from.cols / to.cols), y: t.y + down[t.list] }, to)).filter(Boolean);
  }
  return list;
}

// Doing it up (b: whichever of the wallpaper, the weather and the floor are changing, and its
// things, all of them, as they are now). Glow's things are for someone with Glow, and dew's for
// someone who's got it with dew; either, as many of it as are there already. (`owned`: one of
// dew's that's being got just now. `dry`: only seeing if it can be done.)
function setRoom(user, b, { owned = '', dry = false } = {}) {
  const room = roomOf(user.id);
  b = b && typeof b === 'object' ? b : {};
  const mine = (id) => id === owned || dewItems(user.id).has(id);
  for (const [slot, list] of Object.entries(SLOTS)) {
    if (!Object.hasOwn(b, slot)) continue;
    const v = b[slot];
    if (ROOM[list].includes(v)) room[slot] = v;
    else if (Object.hasOwn(DEW_ROOM[list], String(v))) {
      if (room[slot] !== v && !mine(`${list}:${v}`)) throw new PetError('That comes with dew: collect enough of it, and get it in Decorate.', 403);
      room[slot] = v;
    } else if (!GLOW_ROOM[list].includes(v)) throw new PetError("That isn't one of the things for its room.");
    else if (supporters.active(user) || room[slot] === v) room[slot] = v;
    else throw new PetError('That comes with Glow.', 403);
  }
  if (Object.hasOwn(b, 'things')) {
    if (!Array.isArray(b.things)) throw new PetError("That isn't one of the things for its room.");
    const geo = geoOf(room.tier);
    if (b.things.length > geo.things) throw new PetError(`Its room has space for ${geo.things} things: put one away first.`);
    // (Placed in the room as it was when the app last saw it (`tier`): a page open from before the
    // room grew says a smaller one, and its things are grown the same way the room's were. An older
    // app says none: the first room's terms.)
    const madeIn = Math.min(room.tier, tierOf(b.tier));
    const things = grownThings(b.things.map((t) => {
      const c = thingOf(t, geoOf(madeIn));
      if (!c) throw new PetError("That isn't one of the things for its room.");
      return c;
    }), madeIn, room.tier);
    const count = (list) => list.reduce((m, t) => m.set(`${t.list}:${t.key}`, (m.get(`${t.list}:${t.key}`) || 0) + 1), new Map());
    const had = count(room.things);
    for (const [id, n] of count(things)) {
      if (n <= (had.get(id) || 0)) continue;
      const [list, key] = id.split(':');
      if (Object.hasOwn(DEW_ROOM[list], key) && !mine(id)) throw new PetError('That comes with dew: collect enough of it, and get it in Decorate.', 403);
      if (GLOW_ROOM[list].includes(key) && !supporters.active(user)) throw new PetError('That comes with Glow.', 403);
    }
    room.things = things;
  }
  if (!dry) db.prepare('UPDATE users SET pet_room = ? WHERE id = ?').run(JSON.stringify(room), user.id);
  return room;
}

module.exports = { KINDS, GLOW_KINDS, LABELS, SLOTS, THING_LISTS, THINGS_MAX, ROOM_TIERS, growRoom, DEW_ROOM, WEAR, canWear, PetError, CAPSULES, get, visiting, onHomepage, set, setWear, swap, release, hide, feed, play, petIt, roomOf, setRoom };
