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
// much each brings a second. (Cookie Clicker's buildings' numbers: a long way from a leaf to a
// rainbow loom.)
const COLLECTORS = [
  { key: 'leaf', label: 'Leaf', many: 'Leaves', about: 'Catches what falls on it.', cost: 15, rate: 0.1 },
  { key: 'acorn', label: 'Acorn cup', many: 'Acorn cups', about: "An acorn's little cap, set out overnight.", cost: 100, rate: 1 },
  { key: 'web', label: 'Spiderweb', many: 'Spiderwebs', about: 'Spun across a corner, and beaded by morning.', cost: 1_100, rate: 8 },
  { key: 'moss', label: 'Moss bed', many: 'Moss beds', about: "Soaks it up, and gives it back when it's squeezed.", cost: 12_000, rate: 47 },
  { key: 'net', label: 'Fog net', many: 'Fog nets', about: 'A fine mesh that catches the fog drifting through it.', cost: 130_000, rate: 260 },
  { key: 'pond', label: 'Dew pond', many: 'Dew ponds', about: 'An old pond, lined so not a drop gets away.', cost: 1_400_000, rate: 1_400 },
  { key: 'mist', label: 'Mist machine', many: 'Mist machines', about: 'Makes its own fog, then catches it again.', cost: 20_000_000, rate: 7_800 },
  { key: 'garden', label: 'Rain garden', many: 'Rain gardens', about: 'Drinks the rain, and gives back more.', cost: 330_000_000, rate: 44_000 },
  { key: 'cloud', label: 'Cloud catcher', many: 'Cloud catchers', about: 'Hooks clouds down out of the sky, gently, and wrings them out.', cost: 5.1e9, rate: 260_000 },
  { key: 'dance', label: 'Rain dance', many: 'Rain dances', about: 'An old dance, written down and wound up like a clock.', cost: 75e9, rate: 1.6e6 },
  { key: 'jar', label: 'Storm in a jar', many: 'Storms in jars', about: 'A whole storm, kept in a jar.', cost: 1e12, rate: 10e6 },
  { key: 'station', label: 'Weather station', many: 'Weather stations', about: 'Tells the weather what to do.', cost: 14e12, rate: 65e6 },
  { key: 'moon', label: 'Tide moon', many: 'Tide moons', about: 'A little moon of its own, pulling dew up out of the sea.', cost: 170e12, rate: 430e6 },
  { key: 'loom', label: 'Rainbow loom', many: 'Rainbow looms', about: 'Weaves rainbows, and wrings the dew out of them.', cost: 2.1e15, rate: 2.9e9 },
];
const MORE_EACH = 1.15;

// Upgrades, each ready once something's been done enough (`pats`, `of` and `owned`, `count`,
// `earned`, `rainbows`), and what each does:
//   double  a collector brings twice as much (at 1, 5, 25, 50, 100, 150 and 200 of it)
//   times   pats bring that many times as much
//   share   each pat brings that much of a second's dew too
//   paws    each pat brings that much more for every collector there is
//   boost   everything collects that much more (the kinds of dew)
//   happy   a happy pet brings that much more again
//   sooner, longer, richer   rainbow drops: come sooner, stay longer, bring more
const TIERS = [[1, 10], [5, 50], [25, 500], [50, 50_000], [100, 5e6], [150, 5e8], [200, 5e10]]; // ([how many of it, its cost times the collector's])
const TIER_NAMES = {
  leaf: ['Broad leaves', 'Waxy leaves', 'A whole hedge'],
  acorn: ['Polished cups', 'Oak cups', "A squirrel's stash"],
  web: ['Sticky silk', 'Orb weavers', 'Cathedral webs'],
  moss: ['Feather moss', 'Peat beds', 'Moss carpets'],
  net: ['Finer mesh', 'Double nets', 'Coastal fog'],
  pond: ['Clay lining', 'Straw beds', 'Chalk downs'],
  mist: ['Cold plates', 'Cloud seeding', 'Pocket weather'],
  garden: ['Deeper beds', 'Rain chains', 'A garden of gardens'],
  cloud: ['Softer hooks', 'Thunderheads', 'Cloud herding'],
  dance: ['Better steps', 'Drums', 'The big dance'],
  jar: ['Thicker glass', 'A tighter lid', 'Jars in jars'],
  station: ['A taller mast', 'Barometers', 'Forecasts that come true'],
  moon: ['Brighter nights', 'Spring tides', 'Two moons'],
  loom: ['Finer thread', 'Double rainbows', 'Full circle'],
};
const LATER_TIERS = ['Dew-kissed', 'Moonlit', 'Ancient', 'Everlasting']; // ("Moonlit spiderwebs")
const DEWS = [
  ['morning', 'Morning dew', 0.05, 1e6], ['evening', 'Evening dew', 0.05, 5e6], ['spring', 'Spring dew', 0.05, 25e6], ['summer', 'Summer dew', 0.05, 1e8],
  ['autumn', 'Autumn dew', 0.05, 5e8], ['winter', 'Winter dew', 0.05, 2.5e9], ['honey', 'Honeydew', 0.1, 1e10], ['rose', 'Rose dew', 0.1, 5e10],
  ['moon', 'Moon dew', 0.1, 2.5e11], ['silver', 'Silver dew', 0.1, 1e12], ['gold', 'Golden dew', 0.15, 5e12], ['rainbow', 'Rainbow dew', 0.2, 2.5e13],
];
const pct = (x) => `${Math.round(x * 100)}%`;
const UPGRADES = [
  { key: 'pats1', label: 'Gentle pats', about: 'Pats bring twice as much.', cost: 100, pats: 15, times: 2 },
  { key: 'pats2', label: 'Belly rubs', about: 'Pats bring twice as much.', cost: 600, pats: 100, times: 2 },
  { key: 'pats3', label: 'Ear scratches', about: 'Pats bring twice as much.', cost: 12_000, pats: 500, times: 2 },
  ...[['pats4', 'Best friends', 50_000, 1_000], ['pats5', 'Inseparable', 5e6, 3_000], ['pats6', 'Bedtime cuddles', 5e8, 7_500], ['pats7', 'Nose boops', 5e10, 15_000],
    ['pats8', 'Soulmates', 5e12, 30_000], ['pats9', 'Forever friends', 5e14, 60_000]]
    .map(([key, label, cost, pats], i) => ({ key, label, about: `Each pat brings ${i ? 'another' : ''} 1% of a second's dew${i ? '' : ' too'}.`.replace('  ', ' '), cost, pats, share: 0.01 })),
  ...[['paws1', 'Leafy paws', 0.1, 1e5, 50], ['paws2', 'Mossy paws', 0.5, 1e7, 100], ['paws3', 'Misty paws', 5, 1e9, 150], ['paws4', 'Stormy paws', 50, 1e11, 200], ['paws5', 'Rainbow paws', 500, 1e13, 300]]
    .map(([key, label, paws, cost, count]) => ({ key, label, about: `Each pat brings ${paws} more for every collector you have.`, cost, count, paws })),
  ...DEWS.map(([key, label, boost, cost]) => ({ key: `dew-${key}`, label, about: `Everything collects ${pct(boost)} more.`, cost, earned: cost, boost })),
  { key: 'happy1', label: 'Cozy corners', about: 'A happy pet brings more: up to 35%, not 25%.', cost: 1e7, earned: 5e6, happy: 0.1 },
  { key: 'happy2', label: 'Favorite treats', about: 'A happy pet brings more: up to 50%.', cost: 1e9, earned: 5e8, happy: 0.15 },
  { key: 'happy3', label: 'Best pet ever', about: 'A happy pet brings more: up to 75%.', cost: 1e11, earned: 5e10, happy: 0.25 },
  { key: 'rainbow1', label: 'Rainbow chasers', about: 'Rainbow drops come 10% sooner.', cost: 777_777, rainbows: 3, sooner: 0.1 },
  { key: 'rainbow2', label: 'Rainbow lore', about: 'Rainbow drops stay on the window twice as long.', cost: 77_777_777, rainbows: 7, longer: 2 },
  { key: 'rainbow3', label: 'Pots of gold', about: 'Rainbow drops bring twice as much.', cost: 7_777_777_777, rainbows: 27, richer: 2 },
  { key: 'rainbow4', label: 'Sun showers', about: 'Rainbow drops come another 10% sooner.', cost: 777_777_777_777, rainbows: 77, sooner: 0.1 },
  ...COLLECTORS.flatMap((c) => TIERS.map(([owned, times], i) => ({
    key: `${c.key}${i + 1}`, label: i < 3 ? TIER_NAMES[c.key][i] : `${LATER_TIERS[i - 3]} ${c.many.toLowerCase()}`, about: `${c.many} bring twice as much.`,
    cost: c.cost * times, of: c.key, owned, double: true,
  }))),
];

const PATS_A_SECOND = 12; // (about as fast as anyone pats: more than that doesn't count)
const PATS_SAVED = 36; // (a few seconds' worth, for pats sent all at once)
const COLLECTED_MAX = 45_000; // (at a time: it's for while Rainlit's open, collected every 30 seconds)
const RAINBOW_FOR = 15_000; // (a rainbow drop's on the window this long)
const RAINBOW_EVERY = [4 * 60_000, 9 * 60_000];
const RAINBOW_SECONDS = 60; // (it brings a minute's collecting, or 13 pats, whichever's more, and 13 more)
const HAPPY_MORE = 0.25;

const rand = (a, b) => a + Math.random() * (b - a);
// (An amount, said: 1,234 dew, 2.5 million dew.)
const WORDS = [[1e33, 'decillion'], [1e30, 'nonillion'], [1e27, 'octillion'], [1e24, 'septillion'], [1e21, 'sextillion'], [1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
const amount = (n) => {
  const big = WORDS.find(([k]) => n >= k);
  return `${big ? `${Math.floor((n / big[0]) * 100) / 100} ${big[1]}` : Math.ceil(n).toLocaleString('en-US')} dew`;
};
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
  if (!r) return { user_id: userId, dew: 0, earned: 0, pats: 0, collectors: {}, upgrades: new Set(), items: new Set(), tick_at: 0, pat_room: 0, pat_at: 0, rainbow_at: 0, rainbows: 0, fresh: true };
  return { ...r, collectors: parsed(r.collectors, {}), upgrades: new Set(parsed(r.upgrades, [])), items: new Set(parsed(r.items, [])), fresh: false };
}
function save(s) {
  db.prepare(`INSERT INTO dew (user_id, dew, earned, pats, collectors, upgrades, items, tick_at, pat_room, pat_at, rainbow_at, rainbows) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET dew = excluded.dew, earned = excluded.earned, pats = excluded.pats, collectors = excluded.collectors, upgrades = excluded.upgrades,
      items = excluded.items, tick_at = excluded.tick_at, pat_room = excluded.pat_room, pat_at = excluded.pat_at, rainbow_at = excluded.rainbow_at, rainbows = excluded.rainbows`)
    .run(s.user_id, s.dew, s.earned, s.pats, JSON.stringify(s.collectors), JSON.stringify([...s.upgrades]), JSON.stringify([...s.items]), s.tick_at, s.pat_room, s.pat_at, s.rainbow_at, s.rainbows);
  s.fresh = false;
}

const happyOf = (userId) => {
  const p = pets.get(userId);
  return p ? p.happy : 0;
};
// What the upgrades someone has add up to.
function effects(s) {
  const e = { times: 1, share: 0, paws: 0, boost: 1, happy: HAPPY_MORE, sooner: 0, longer: 1, richer: 1 };
  for (const u of UPGRADES) {
    if (!s.upgrades.has(u.key)) continue;
    if (u.times) e.times *= u.times;
    if (u.share) e.share += u.share;
    if (u.paws) e.paws += u.paws;
    if (u.boost) e.boost *= 1 + u.boost;
    if (u.happy) e.happy += u.happy;
    if (u.sooner) e.sooner += u.sooner;
    if (u.longer) e.longer *= u.longer;
    if (u.richer) e.richer *= u.richer;
  }
  return e;
}
const countOf = (s) => Object.values(s.collectors).reduce((n, v) => n + (Number(v) || 0), 0);
// How much it all brings a second (more for a happy pet), and a pat.
function perSecond(s, happy) {
  let rate = 0;
  for (const c of COLLECTORS) {
    const n = Number(s.collectors[c.key]) || 0;
    if (!n) continue;
    let k = 1;
    for (const u of UPGRADES) if (u.double && u.of === c.key && s.upgrades.has(u.key)) k *= 2;
    rate += n * c.rate * k;
  }
  const e = effects(s);
  return rate * e.boost * (1 + e.happy * happy);
}
function perPat(s, rate) {
  const e = effects(s);
  return (1 + e.paws * countOf(s)) * e.times + e.share * rate;
}
// Whether an upgrade's ready to get.
function ready(s, u) {
  if (u.of) return (Number(s.collectors[u.of]) || 0) >= u.owned;
  if (u.pats !== undefined) return s.pats >= u.pats;
  if (u.count !== undefined) return countOf(s) >= u.count;
  if (u.rainbows !== undefined) return s.rainbows >= u.rainbows;
  if (u.earned !== undefined) return s.earned >= u.earned;
  return true;
}
const rainbowFor = (s) => RAINBOW_FOR * effects(s).longer;

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
  else if (now > s.rainbow_at + rainbowFor(s) + 5_000) s.rainbow_at = now + rand(...RAINBOW_EVERY) * (1 - effects(s).sooner);
}

function view(s, happy, now) {
  const rate = perSecond(s, happy);
  const e = effects(s);
  return {
    dew: s.dew, earned: s.earned, pats: s.pats, rainbows: s.rainbows, perSecond: rate, perPat: perPat(s, rate), boost: e.boost, happyMore: e.happy * happy,
    collectors: { ...s.collectors }, upgrades: [...s.upgrades], items: [...s.items],
    rainbow: s.fresh ? null : { in: s.rainbow_at - now, for: rainbowFor(s) },
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
    if (!ready(s, u)) throw new DewError("That one isn't ready yet.", 409);
    afford(s, u.cost);
    s.upgrades.add(key);
  });
}

// One of the things for its room that dew brings: bought (if it isn't already), and put in its room.
// A wallpaper, the weather or a floor (`slot`) goes in its place; a thing (`list`: stand, hang,
// ceiling or rug), wherever it is in `things` (its room's things, as they'll be with it: lib/pets.js
// setRoom), or just got, for later.
function unlock(user, b) {
  const slot = Object.hasOwn(pets.SLOTS, b.slot) ? b.slot : '';
  const list = slot || (pets.THING_LISTS.includes(b.list) ? b.list : '');
  const key = String(b.key || '');
  const price = list && Object.hasOwn(pets.DEW_ROOM[list], key) ? pets.DEW_ROOM[list][key] : 0;
  if (!price) throw new DewError("That isn't one of the things dew brings.");
  const id = `${list}:${key}`;
  const change = slot ? { [slot]: key } : Array.isArray(b.things) ? { things: b.things } : null;
  // (Whether it'll go in, before any dew's spent on it.)
  if (change) pets.setRoom(user, change, { owned: id, dry: true });
  const state = spend(user.id, (s) => {
    if (s.items.has(id)) return;
    afford(s, price);
    s.items.add(id);
  });
  return { dew: state, room: change ? pets.setRoom(user, change) : pets.roomOf(user.id) };
}

// One of the things for a pet to wear: bought (if it isn't already) and put on it (`slot`: head,
// eyes, neck or body).
function wearIt(user, slot, key) {
  const price = Object.hasOwn(pets.WEAR, slot) && Object.hasOwn(pets.WEAR[slot], key) ? pets.WEAR[slot][key] : 0;
  if (!price) throw new DewError("That isn't one of the things it can wear.");
  if (!pets.get(user.id)) throw new DewError("There's no pet to dress up yet.", 404);
  const state = spend(user.id, (s) => {
    const id = `wear:${key}`;
    if (s.items.has(id)) return;
    afford(s, price);
    s.items.add(id);
  });
  return { dew: state, pet: pets.setWear(user, slot, key) };
}

// Catching a rainbow drop (while it's on the window).
function rainbow(userId) {
  const s = load(userId);
  const now = Date.now();
  if (s.fresh || !s.rainbow_at || now < s.rainbow_at - 2_000 || now > s.rainbow_at + rainbowFor(s) + 5_000) throw new DewError('That rainbow drop got away.', 409);
  const happy = happyOf(userId);
  const rate = perSecond(s, happy);
  collect(s, now, rate);
  const e = effects(s);
  const got = Math.round((Math.max(rate * RAINBOW_SECONDS, perPat(s, rate) * 13) + 13) * e.richer);
  s.dew += got;
  s.earned += got;
  s.rainbows += 1;
  s.rainbow_at = now + rand(...RAINBOW_EVERY) * (1 - e.sooner);
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
  return s.fresh ? null : { dew: Math.floor(s.dew), earned: Math.floor(s.earned), pats: s.pats, rainbows: s.rainbows, collectors: s.collectors, upgrades: [...s.upgrades], items: [...s.items] };
}

// What there is, what it costs and what it does (the same for everyone: the app shows it).
const SHOP = {
  collectors: COLLECTORS,
  upgrades: UPGRADES,
  items: Object.entries(pets.DEW_ROOM).flatMap(([list, things]) => Object.entries(things).map(([key, price]) => ({ list, key, price }))),
  wear: Object.entries(pets.WEAR).flatMap(([slot, things]) => Object.entries(things).map(([key, price]) => ({ slot, key, price }))),
  moreEach: MORE_EACH, patsASecond: PATS_A_SECOND, happyMore: HAPPY_MORE,
};

module.exports = { DewError, SHOP, get, pat, buy, upgrade, unlock, wearIt, rainbow, start, exported, perSecond, perPat, ready, effects };
