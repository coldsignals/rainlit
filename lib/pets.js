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
// Its room is its owner's to do up: a wallpaper, the weather out its window, a floor, a rug,
// something on the wall and something in each corner (a few of each, and some of Glow's, kept the same way). It's kept with
// their account, not the pet, so it stays if they let their pet go and adopt another.

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

// Someone's pet as it is now (null: they haven't one).
function get(userId) {
  const r = rowOf(userId);
  if (!r) return null;
  const now = Date.now();
  return {
    kind: r.kind, name: r.name, coat: r.coat, home: Boolean(r.home),
    full: worn(r.full, r.full_at, FULL_MS, now), happy: worn(r.happy, r.happy_at, HAPPY_MS, now),
    pets: r.pets, since: r.adopted_at, fedAt: r.fed_at,
  };
}

// What anyone who can see their homepage sees of it (null: it isn't there).
function onHomepage(userId) {
  const p = get(userId);
  return p && p.home ? { kind: p.kind, name: p.name, coat: p.coat, full: p.full, happy: p.happy, pets: p.pets, since: p.since } : null;
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
  rug: ['none', 'round', 'rect', 'woven', 'charcoal'],
  hang: ['none', 'picture', 'clock', 'shelf', 'guitar', 'darts'],
  stand: ['none', 'plant', 'lamp', 'bed', 'bedgrey', 'books', 'desk', 'armchair'],
  sky: ['auto', 'rain', 'clear', 'snow', 'sunny', 'sunset'], // (out its window: auto changes by itself)
};
const GLOW_ROOM = { wall: ['starlit', 'aurora', 'city'], floor: ['clouds', 'crystal'], rug: ['magic'], hang: ['lights', 'neon', 'bolt'], stand: ['aquarium', 'lava', 'arcade'], sky: ['storm', 'aurora'] };
const SLOTS = { wall: 'wall', floor: 'floor', rug: 'rug', hang: 'hang', left: 'stand', right: 'stand', sky: 'sky' };
const ROOM_DEFAULT = { wall: 'stripes', floor: 'wood', rug: 'round', hang: 'none', left: 'plant', right: 'bed', sky: 'auto' };

function roomOf(userId) {
  const r = db.prepare('SELECT pet_room FROM users WHERE id = ?').get(userId);
  let saved = {};
  try {
    saved = JSON.parse((r && r.pet_room) || '{}') || {};
  } catch {}
  const room = { ...ROOM_DEFAULT };
  for (const [slot, list] of Object.entries(SLOTS)) {
    if (ROOM[list].includes(saved[slot]) || GLOW_ROOM[list].includes(saved[slot])) room[slot] = saved[slot];
  }
  return room;
}

// Doing it up (b: whichever places are changing). Glow's things are for someone with Glow, or
// where they are already.
function setRoom(user, b) {
  const room = roomOf(user.id);
  for (const [slot, v] of Object.entries(b && typeof b === 'object' ? b : {})) {
    if (!Object.hasOwn(SLOTS, slot)) continue;
    const list = SLOTS[slot];
    if (ROOM[list].includes(v)) room[slot] = v;
    else if (!GLOW_ROOM[list].includes(v)) throw new PetError("That isn't one of the things for its room.");
    else if (supporters.active(user) || room[slot] === v) room[slot] = v;
    else throw new PetError('That comes with Glow.', 403);
  }
  db.prepare('UPDATE users SET pet_room = ? WHERE id = ?').run(JSON.stringify(room), user.id);
  return room;
}

module.exports = { KINDS, GLOW_KINDS, PetError, get, onHomepage, set, release, hide, feed, play, petIt, roomOf, setRoom };
