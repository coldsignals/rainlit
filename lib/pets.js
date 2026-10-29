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

const { db } = require('./db');
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
  head: { bow: 2_500, beanie: 50_000, party: 1e6, cap: 25e6, tophat: 5e9, crown: 50e12 },
  eyes: { round: 25_000, sun: 10e6, star: 1e12 },
  neck: { collar: 5_000, bandana: 250_000, bowtie: 100e6, spiked: 50e9, scarf: 2e12 },
  body: { stripes: 5e6, hoodie: 500e6, knit: 10e12, rainlit: 1e15 },
};
// (What each can't wear: the droplet's all drop, with no neck for a collar and no body for a
// sweater, though a bowtie suits it. public/homepage.js says the same.)
const WEAR_NOT = { drop: { neck: ['collar', 'bandana', 'spiked', 'scarf'], body: true } };
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
    if (typeof w[slot] === 'string' && Object.hasOwn(WEAR[slot], w[slot]) && (!kind || canWear(kind, slot, w[slot]))) out[slot] = w[slot];
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
    pets: r.pets, since: r.adopted_at, fedAt: r.fed_at,
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
  else if (!Object.hasOwn(WEAR[slot], key)) throw new PetError("That isn't one of the things it can wear.");
  else if (!canWear(r.kind, slot, key)) throw new PetError(`That doesn't fit a ${LABELS[r.kind]}.`);
  else if (wear[slot] !== key && !dewItems(user.id).has(`wear:${key}`)) throw new PetError('That comes with dew: collect enough of it, and get it in Wear.', 403);
  else wear[slot] = key;
  db.prepare('UPDATE pets SET wear = ? WHERE user_id = ?').run(JSON.stringify(wear), user.id);
  return get(user.id);
}

// Letting it go: it's gone, and how it was doing with it.
function release(userId) {
  db.prepare('DELETE FROM pets WHERE user_id = ?').run(userId);
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
  if (now - (pettedAt.get(key) || 0) < 1000 || (hour && now - hour.since < 3600_000 && hour.n >= 300)) return;
  if (pettedAt.size > 50_000) pettedAt.clear();
  if (petting.size > 50_000) petting.clear();
  pettedAt.set(key, now);
  if (!hour || now - hour.since >= 3600_000) petting.set(who, { n: 1, since: now });
  else hour.n++;
  const s = get(ownerId);
  db.prepare('UPDATE pets SET pets = pets + 1, happy = ?, happy_at = ? WHERE user_id = ?').run(Math.min(1, s.happy + 0.05), now, ownerId);
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
};
const GLOW_ROOM = { wall: ['starlit', 'aurora', 'city'], floor: ['clouds', 'crystal'], rug: ['magic'], hang: ['lights', 'neon', 'bolt'], stand: ['aquarium', 'lava', 'arcade'], ceiling: ['disco', 'mobile'], sky: ['storm', 'aurora'] };
// Things that dew brings (lib/dew.js), and how much each costs: anyone's, once they've collected
// that much and spent it (and theirs from then on). Goals for the long run: for someone who keeps
// at it, the umbrella in a first sitting, then on and on, to the terrarium after a couple of weeks
// of Rainlit being open.
const DEW_ROOM = {
  hang: { umbrella: 75_000, poster: 2e12 },
  floor: { moss: 5e6, checker: 150e9 },
  wall: { leaves: 75e6, retro: 750e12 },
  ceiling: { raincloud: 500e6 },
  rug: { leaf: 1e9 },
  sky: { fog: 10e9 },
  stand: { barrel: 30e12, records: 7.5e15, terrarium: 100e15 },
};
const dewItems = (userId) => {
  const r = db.prepare('SELECT items FROM dew WHERE user_id = ?').get(userId);
  try {
    return new Set(JSON.parse(r ? r.items : '[]'));
  } catch {
    return new Set();
  }
};
// The room all round: one of each (the window's weather goes in every window).
const SLOTS = { wall: 'wall', floor: 'floor', sky: 'sky' };
const ROOM_DEFAULT = { wall: 'stripes', floor: 'wood', sky: 'auto' };
// Its things, each where it's been put: `x` from one side to the other (0 to 1: as far left as it
// goes, to as far right), `y` in the room's own pixels from its top (42 of them: 26 of wall, then
// the floor): the top of a thing on the wall or hanging from the ceiling (on a cord that long), and
// the bottom of a rug or of something standing on the floor (as far back as the skirting, to the
// front). `size`: three quarters as big, to half as big again, in eighths. `flip`: facing the
// other way.
const THING_LISTS = ['stand', 'hang', 'ceiling', 'rug'];
const THINGS_MAX = 24;
const THING_Y = { hang: [0, 28], ceiling: [0, 24], rug: [28, 42], stand: [29, 42] };
const isThing = (list, key) => THING_LISTS.includes(list) && (ROOM[list].includes(key) || GLOW_ROOM[list].includes(key) || Object.hasOwn(DEW_ROOM[list], key));
function thingOf(t) {
  const list = String((t && t.list) || ''), key = String((t && t.key) || '');
  if (!t || typeof t !== 'object' || !isThing(list, key)) return null;
  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const [y0, y1] = THING_Y[list];
  return { list, key, x: Math.round(num(t.x, 0, 1, 0.5) * 1000) / 1000, y: Math.round(num(t.y, y0, y1, y0)), size: Math.round(num(t.size, 0.75, 1.5, 1) * 8) / 8, flip: t.flip === true };
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
  return things.map(thingOf);
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
  room.things = Array.isArray(saved.things) ? saved.things.map(thingOf).filter(Boolean).slice(0, THINGS_MAX) : legacyThings(saved);
  return room;
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
    if (b.things.length > THINGS_MAX) throw new PetError(`Its room has space for ${THINGS_MAX} things: put one away first.`);
    const things = b.things.map((t) => {
      const c = thingOf(t);
      if (!c) throw new PetError("That isn't one of the things for its room.");
      return c;
    });
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

module.exports = { KINDS, GLOW_KINDS, LABELS, SLOTS, THING_LISTS, THINGS_MAX, DEW_ROOM, WEAR, canWear, PetError, get, visiting, onHomepage, set, setWear, release, hide, feed, play, petIt, roomOf, setRoom };
