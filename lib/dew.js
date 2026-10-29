'use strict';

// Dew: what someone's pet shakes off when it's patted, saved up for things for its room that only
// dew brings (lib/pets.js: DEW_ROOM). Every pat brings some. Things set out to collect it (a leaf,
// an acorn cup, a spiderweb...) bring more by themselves, for as long as Rainlit's open on any of
// their devices (not in the background on a phone), and upgrades bring more of each. A happy pet
// brings up to a quarter more. Now and then a rainbow drop rolls down its room's window: caught,
// it's a lot at once. (app.js shows it all, in the pet's room.)
//
// It's all worked out here, never in the app: what comes when, and what everything costs. Pats
// count only as fast as anyone could pat. And it's only ever collected: never bought, sold or
// given.

const { db } = require('./db');
const pets = require('./pets');

class DewError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Things to collect it with: what the first of each costs (each one after it, 15% more), and how
// much each brings a second.
const COLLECTORS = [
  { key: 'leaf', label: 'Leaf', many: 'Leaves', about: 'Catches what falls on it.', cost: 15, rate: 0.1 },
  { key: 'acorn', label: 'Acorn cup', many: 'Acorn cups', about: "An acorn's little cap, set out overnight.", cost: 100, rate: 1 },
  { key: 'web', label: 'Spiderweb', many: 'Spiderwebs', about: 'Spun across a corner, and beaded by morning.', cost: 1_100, rate: 8 },
  { key: 'moss', label: 'Moss bed', many: 'Moss beds', about: "Soaks it up, and gives it back when it's squeezed.", cost: 12_000, rate: 47 },
  { key: 'net', label: 'Fog net', many: 'Fog nets', about: 'A fine mesh that catches the fog drifting through it.', cost: 130_000, rate: 260 },
  { key: 'pond', label: 'Dew pond', many: 'Dew ponds', about: 'An old pond, lined so not a drop gets away.', cost: 1_400_000, rate: 1_400 },
  { key: 'mist', label: 'Mist machine', many: 'Mist machines', about: 'Makes its own fog, then catches it again.', cost: 20_000_000, rate: 7_800 },
];
const MORE_EACH = 1.15;

// Upgrades: pats worth twice as much (then a share of a second's dew too), for patting enough;
// and each collector bringing twice as much, once there are 1, 10 and 25 of it.
const TIERS = [[1, 10], [10, 50], [25, 500]]; // ([how many of it, its cost times the collector's])
const TIER_NAMES = {
  leaf: ['Broad leaves', 'Waxy leaves', 'A whole hedge'],
  acorn: ['Polished cups', 'Oak cups', "A squirrel's stash"],
  web: ['Sticky silk', 'Orb weavers', 'Cathedral webs'],
  moss: ['Feather moss', 'Peat beds', 'Moss carpets'],
  net: ['Finer mesh', 'Double nets', 'Coastal fog'],
  pond: ['Clay lining', 'Straw beds', 'Chalk downs'],
  mist: ['Cold plates', 'Cloud seeding', 'Pocket weather'],
};
const UPGRADES = [
  { key: 'pats1', label: 'Gentle pats', about: 'Pats bring twice as much.', cost: 100, pats: 15, times: 2 },
  { key: 'pats2', label: 'Belly rubs', about: 'Pats bring twice as much.', cost: 600, pats: 100, times: 2 },
  { key: 'pats3', label: 'Ear scratches', about: 'Pats bring twice as much.', cost: 12_000, pats: 500, times: 2 },
  { key: 'pats4', label: 'Best friends', about: "Each pat brings 1% of a second's dew too.", cost: 150_000, pats: 1_500, share: 0.01 },
  { key: 'pats5', label: 'Inseparable', about: "Each pat brings another 2% of a second's dew.", cost: 15_000_000, pats: 5_000, share: 0.02 },
  ...COLLECTORS.flatMap((c) => TIERS.map(([owned, times], i) => ({
    key: `${c.key}${i + 1}`, label: TIER_NAMES[c.key][i], about: `${c.many} bring twice as much.`, cost: c.cost * times, of: c.key, owned,
  }))),
];

const PATS_A_SECOND = 12; // (about as fast as anyone pats: more than that doesn't count)
const PATS_SAVED = 36; // (a few seconds' worth, for pats sent all at once)
const COLLECTED_MAX = 45_000; // (at a time: it's for while Rainlit's open, collected every 30 seconds)
const RAINBOW_FOR = 15_000; // (a rainbow drop's on the window this long)
const RAINBOW_EVERY = [4 * 60_000, 9 * 60_000];
const RAINBOW_SECONDS = 240; // (it brings four minutes' collecting, or 30 pats, or 25, whichever's most)
const HAPPY_MORE = 0.25;

const rand = (a, b) => a + Math.random() * (b - a);
const amount = (n) => `${Math.ceil(n).toLocaleString('en-US')} dew`;
const parsed = (v, dflt) => {
  try {
    const x = JSON.parse(v);
    return x && typeof x === 'object' ? x : dflt;
  } catch {
    return dflt;
  }
};

// Someone's dew, as it was last saved (`fresh`: they've never had any).
function load(userId) {
  const r = db.prepare('SELECT * FROM dew WHERE user_id = ?').get(userId);
  if (!r) return { user_id: userId, dew: 0, earned: 0, pats: 0, collectors: {}, upgrades: new Set(), items: new Set(), tick_at: 0, pat_room: 0, pat_at: 0, rainbow_at: 0, fresh: true };
  return { ...r, collectors: parsed(r.collectors, {}), upgrades: new Set(parsed(r.upgrades, [])), items: new Set(parsed(r.items, [])), fresh: false };
}
function save(s) {
  db.prepare(`INSERT INTO dew (user_id, dew, earned, pats, collectors, upgrades, items, tick_at, pat_room, pat_at, rainbow_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET dew = excluded.dew, earned = excluded.earned, pats = excluded.pats, collectors = excluded.collectors, upgrades = excluded.upgrades,
      items = excluded.items, tick_at = excluded.tick_at, pat_room = excluded.pat_room, pat_at = excluded.pat_at, rainbow_at = excluded.rainbow_at`)
    .run(s.user_id, s.dew, s.earned, s.pats, JSON.stringify(s.collectors), JSON.stringify([...s.upgrades]), JSON.stringify([...s.items]), s.tick_at, s.pat_room, s.pat_at, s.rainbow_at);
  s.fresh = false;
}

const happyOf = (userId) => {
  const p = pets.get(userId);
  return p ? p.happy : 0;
};
// How much it all brings a second (more for a happy pet), and a pat.
function perSecond(s, happy) {
  let rate = 0;
  for (const c of COLLECTORS) {
    const n = Number(s.collectors[c.key]) || 0;
    if (!n) continue;
    let k = 1;
    for (const u of UPGRADES) if (u.of === c.key && s.upgrades.has(u.key)) k *= 2;
    rate += n * c.rate * k;
  }
  return rate * (1 + HAPPY_MORE * happy);
}
function perPat(s, rate) {
  let k = 1;
  let share = 0;
  for (const u of UPGRADES) {
    if (u.of || !s.upgrades.has(u.key)) continue;
    if (u.times) k *= u.times;
    if (u.share) share += u.share;
  }
  return k + share * rate;
}

// Who's had Rainlit open, and since when (as far as collecting goes: from when it was first seen
// open, every half a minute in start()).
const openSince = new Map(); // user id -> when

// What's been collected since it was last looked at: only since Rainlit's been open, and no more
// than a little while's.
function collect(s, now, rate) {
  const from = Math.max(s.tick_at || now, openSince.get(s.user_id) ?? now);
  const gap = Math.max(0, Math.min(now - from, COLLECTED_MAX));
  if (gap && rate) {
    const got = (rate * gap) / 1000;
    s.dew += got;
    s.earned += got;
  }
  s.tick_at = now;
}
// When the next rainbow drop comes (the first, soon; one that got away, another later).
function rainbowDue(s, now) {
  if (!s.rainbow_at) s.rainbow_at = now + rand(90_000, 180_000);
  else if (now > s.rainbow_at + RAINBOW_FOR + 5_000) s.rainbow_at = now + rand(...RAINBOW_EVERY);
}

function view(s, happy, now) {
  const rate = perSecond(s, happy);
  return {
    dew: s.dew, earned: s.earned, pats: s.pats, perSecond: rate, perPat: perPat(s, rate), happyMore: HAPPY_MORE * happy,
    collectors: { ...s.collectors }, upgrades: [...s.upgrades], items: [...s.items],
    rainbow: s.fresh ? null : { in: s.rainbow_at - now, for: RAINBOW_FOR },
  };
}

// Someone's dew as it is now (collected up to now: they're here, asking).
function get(userId) {
  const s = load(userId);
  const now = Date.now();
  const happy = happyOf(userId);
  if (!s.fresh) {
    collect(s, now, perSecond(s, happy));
    rainbowDue(s, now);
    save(s);
  }
  return view(s, happy, now);
}

// Pats: `n` of them since the last were sent. Only so many count: as many as could be patted in
// the time (and a few seconds' worth saved up).
function pat(userId, n) {
  if (!pets.get(userId)) throw new DewError("There's no pet to pat yet.", 404);
  const s = load(userId);
  const now = Date.now();
  const happy = happyOf(userId);
  const rate = perSecond(s, happy);
  collect(s, now, rate);
  s.pat_room = Math.min(PATS_SAVED, s.pat_room + (Math.max(0, now - s.pat_at) / 1000) * PATS_A_SECOND);
  s.pat_at = now;
  const counted = Math.max(0, Math.min(Math.floor(Number(n) || 0), Math.floor(s.pat_room)));
  s.pat_room -= counted;
  const got = counted * perPat(s, rate);
  s.dew += got;
  s.earned += got;
  s.pats += counted;
  rainbowDue(s, now);
  save(s);
  return { counted, ...view(s, happy, now) };
}

// Spending some: `fn` takes it (or says why not), and it's saved.
function spend(userId, fn) {
  const s = load(userId);
  const now = Date.now();
  const happy = happyOf(userId);
  collect(s, now, perSecond(s, happy));
  fn(s);
  rainbowDue(s, now);
  save(s);
  return view(s, happy, now);
}
const afford = (s, price) => {
  if (s.dew + 1e-6 < price) throw new DewError(`That takes ${amount(price)}: you have ${amount(Math.floor(s.dew))}.`, 409);
  s.dew = Math.max(0, s.dew - price);
};

// Another of something to collect it with.
const priceOf = (c, owned) => Math.ceil(c.cost * MORE_EACH ** owned);
function buy(userId, key) {
  const c = COLLECTORS.find((x) => x.key === key);
  if (!c) throw new DewError("That isn't one of the things to collect dew with.");
  return spend(userId, (s) => {
    const owned = Number(s.collectors[key]) || 0;
    afford(s, priceOf(c, owned));
    s.collectors[key] = owned + 1;
  });
}

// An upgrade (once it's ready: patted enough, or enough of its collector).
function upgrade(userId, key) {
  const u = UPGRADES.find((x) => x.key === key);
  if (!u) throw new DewError("That isn't one of the upgrades.");
  return spend(userId, (s) => {
    if (s.upgrades.has(key)) throw new DewError('You have that one already.', 409);
    if (u.of ? (Number(s.collectors[u.of]) || 0) < u.owned : s.pats < u.pats) throw new DewError("That one isn't ready yet.", 409);
    afford(s, u.cost);
    s.upgrades.add(key);
  });
}

// One of the things for its room that dew brings: bought (if it isn't already) and put in its place
// (`slot`: wall, floor, rug, hang, left, right or sky).
function unlock(user, slot, key) {
  const list = pets.SLOTS[slot];
  const price = list && Object.hasOwn(pets.DEW_ROOM[list], key) ? pets.DEW_ROOM[list][key] : 0;
  if (!price) throw new DewError("That isn't one of the things dew brings.");
  const state = spend(user.id, (s) => {
    const id = `${list}:${key}`;
    if (s.items.has(id)) return;
    afford(s, price);
    s.items.add(id);
  });
  return { dew: state, room: pets.setRoom(user, { [slot]: key }) };
}

// Catching a rainbow drop (while it's on the window).
function rainbow(userId) {
  const s = load(userId);
  const now = Date.now();
  if (s.fresh || !s.rainbow_at || now < s.rainbow_at - 2_000 || now > s.rainbow_at + RAINBOW_FOR + 5_000) throw new DewError('That rainbow drop got away.', 409);
  const happy = happyOf(userId);
  const rate = perSecond(s, happy);
  collect(s, now, rate);
  const got = Math.round(Math.max(25, rate * RAINBOW_SECONDS, perPat(s, rate) * 30));
  s.dew += got;
  s.earned += got;
  s.rainbow_at = now + rand(...RAINBOW_EVERY);
  save(s);
  return { got, ...view(s, happy, now) };
}

// Every half a minute, for everyone with Rainlit open (`onlineIds`: lib/realtime.js), what their
// collectors have brought. (DEW_COLLECT_MS: more often, for tests.)
let collecting = null;
function start(onlineIds) {
  if (collecting) return;
  collecting = setInterval(() => {
    const now = Date.now();
    const ids = new Set(onlineIds());
    for (const id of openSince.keys()) if (!ids.has(id)) openSince.delete(id);
    for (const id of ids) {
      if (!openSince.has(id)) openSince.set(id, now); // (just opened: collecting from now)
      const s = load(id);
      if (s.fresh || !Object.keys(s.collectors).length) continue;
      collect(s, now, perSecond(s, happyOf(id)));
      save(s);
    }
  }, Number(process.env.DEW_COLLECT_MS) || 30_000);
  collecting.unref();
}

// For "Download your data".
function exported(userId) {
  const s = load(userId);
  return s.fresh ? null : { dew: Math.floor(s.dew), earned: Math.floor(s.earned), pats: s.pats, collectors: s.collectors, upgrades: [...s.upgrades], items: [...s.items] };
}

// What there is, what it costs and what it does (the same for everyone: the app shows it).
const SHOP = {
  collectors: COLLECTORS,
  upgrades: UPGRADES,
  items: Object.entries(pets.DEW_ROOM).flatMap(([list, things]) => Object.entries(things).map(([key, price]) => ({ list, key, price }))),
  moreEach: MORE_EACH, patsASecond: PATS_A_SECOND, happyMore: HAPPY_MORE,
};

module.exports = { DewError, SHOP, get, pat, buy, upgrade, unlock, rainbow, start, exported };
