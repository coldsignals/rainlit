'use strict';

// Dew: what someone's pet shakes off when it's patted, saved up for things for its room that only
// dew brings (lib/pets.js: DEW_ROOM). Every pat brings some. Things set out to collect it (a leaf,
// an acorn cup, a spiderweb...) bring more by themselves, for as long as Rainlit's open on any of
// their devices (not in the background on a phone), and upgrades bring more of each. A happy pet
// brings up to a quarter more. Now and then a drop rolls down its room's window (for anyone who's
// asked for them, falling anywhere in Rainlit): caught, it brings dew at once, or more for a while,
// the rarer the more (DROPS). (app.js shows it all, in the pet's room.)
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
  { key: 'comet', label: 'Comet catcher', many: 'Comet catchers', about: 'A long net on a longer pole, for the ice off passing comets.', cost: 26e15, rate: 21e9 },
  { key: 'sieve', label: 'Star sieve', many: 'Star sieves', about: 'Sifts starlight for the dew in it.', cost: 310e15, rate: 150e9 },
  { key: 'nebula', label: 'Nebula net', many: 'Nebula nets', about: 'Wide enough to hold a nebula, fine enough to catch what condenses in it.', cost: 71e18, rate: 1.1e12 },
  { key: 'harp', label: 'Aurora harp', many: 'Aurora harps', about: 'Strung with the northern lights. Played, they rain.', cost: 12e21, rate: 8.3e12 },
  { key: 'ocean', label: 'Sky ocean', many: 'Sky oceans', about: 'An ocean up above the clouds, with tides of its own.', cost: 1.9e24, rate: 64e12 },
  { key: 'first', label: 'The first rain', many: 'First rains', about: 'Somewhere, the very first rain is still falling. Now it falls here.', cost: 540e24, rate: 510e12 },
];
const MORE_EACH = 1.15;

// Upgrades, each ready once something's been done enough (`pats`, `of` and `owned`, `count`,
// `earned`, `rainbows`), and what each does:
//   double  a collector brings twice as much (at 1, 5, 25, 50, 100, 150, 200, 250, 300, 350 and 400 of it)
//   times   pats bring that many times as much
//   share   each pat brings that much of a second's dew too
//   paws    each pat brings that much more for every collector there is
//   boost   everything collects that much more (the kinds of dew)
//   happy   a happy pet brings that much more again
//   sooner, longer, richer   rainbow drops: come sooner, stay longer, bring more
const TIERS = [[1, 10], [5, 50], [25, 500], [50, 50_000], [100, 5e6], [150, 5e8], [200, 5e10], [250, 5e13], [300, 5e16], [350, 5e19], [400, 5e22]]; // ([how many of it, its cost times the collector's])
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
  comet: ['Longer poles', 'Tail combs', 'Comet showers'],
  sieve: ['Finer mesh of stars', 'Star charts', 'Constellations'],
  nebula: ['Wider nets', 'Star nurseries', 'Pillars of cloud'],
  harp: ['Tuned strings', 'Solar winds', 'The northern choir'],
  ocean: ['Cloud shores', 'High tides', 'An ocean of oceans'],
  first: ['The first drop', 'Before the clouds', 'Always raining'],
};
const LATER_TIERS = ['Dew-kissed', 'Moonlit', 'Ancient', 'Everlasting', 'Starlit', 'Cosmic', 'Timeless', 'Infinite']; // ("Moonlit spiderwebs")
const DEWS = [
  ['morning', 'Morning dew', 0.05, 1e6], ['evening', 'Evening dew', 0.05, 5e6], ['spring', 'Spring dew', 0.05, 25e6], ['summer', 'Summer dew', 0.05, 1e8],
  ['autumn', 'Autumn dew', 0.05, 5e8], ['winter', 'Winter dew', 0.05, 2.5e9], ['honey', 'Honeydew', 0.1, 1e10], ['rose', 'Rose dew', 0.1, 5e10],
  ['moon', 'Moon dew', 0.1, 2.5e11], ['silver', 'Silver dew', 0.1, 1e12], ['gold', 'Golden dew', 0.15, 5e12], ['rainbow', 'Rainbow dew', 0.2, 2.5e13],
  ['starlight', 'Starlight dew', 0.2, 1e14], ['comet', 'Comet dew', 0.2, 5e14], ['aurora', 'Aurora dew', 0.2, 2.5e15], ['nebula', 'Nebula dew', 0.25, 1e16],
  ['eclipse', 'Eclipse dew', 0.25, 5e16], ['solstice', 'Solstice dew', 0.25, 2.5e17], ['crystal', 'Crystal dew', 0.25, 1e18], ['thunder', 'Thunder dew', 0.3, 1e19],
  ['ocean', 'Ocean dew', 0.3, 1e20], ['cosmic', 'Cosmic dew', 0.3, 1e21], ['dawn', 'First light dew', 0.3, 1e22], ['eternal', 'Eternal dew', 0.3, 1e23],
];
const pct = (x) => `${Math.round(x * 100)}%`;
const UPGRADES = [
  { key: 'pats1', label: 'Gentle pats', about: 'Pats bring twice as much.', cost: 100, pats: 15, times: 2 },
  { key: 'pats2', label: 'Belly rubs', about: 'Pats bring twice as much.', cost: 600, pats: 100, times: 2 },
  { key: 'pats3', label: 'Ear scratches', about: 'Pats bring twice as much.', cost: 12_000, pats: 500, times: 2 },
  ...[['pats4', 'Best friends', 50_000, 1_000], ['pats5', 'Inseparable', 5e6, 3_000], ['pats6', 'Bedtime cuddles', 5e8, 7_500], ['pats7', 'Nose boops', 5e10, 15_000],
    ['pats8', 'Soulmates', 5e12, 30_000], ['pats9', 'Forever friends', 5e14, 60_000], ['pats10', 'Pat parade', 5e16, 100_000], ['pats11', 'Ten-paw salute', 5e18, 200_000],
    ['pats12', 'To the moon and back', 5e20, 400_000]]
    .map(([key, label, cost, pats], i) => ({ key, label, about: `Each pat brings ${i ? 'another' : ''} 1% of a second's dew${i ? '' : ' too'}.`.replace('  ', ' '), cost, pats, share: 0.01 })),
  ...[['paws1', 'Leafy paws', 0.1, 1e5, 50], ['paws2', 'Mossy paws', 0.5, 1e7, 100], ['paws3', 'Misty paws', 5, 1e9, 150], ['paws4', 'Stormy paws', 50, 1e11, 200], ['paws5', 'Rainbow paws', 500, 1e13, 300],
    ['paws6', 'Starry paws', 5000, 1e15, 400], ['paws7', 'Comet paws', 50_000, 1e17, 500], ['paws8', 'Cosmic paws', 500_000, 1e19, 600]]
    .map(([key, label, paws, cost, count]) => ({ key, label, about: `Each pat brings ${paws} more for every collector you have.`, cost, count, paws })),
  ...DEWS.map(([key, label, boost, cost]) => ({ key: `dew-${key}`, label, about: `Everything collects ${pct(boost)} more.`, cost, earned: cost, boost })),
  { key: 'happy1', label: 'Cozy corners', about: 'A happy pet brings more: up to 35%, not 25%.', cost: 1e7, earned: 5e6, happy: 0.1 },
  { key: 'happy2', label: 'Favorite treats', about: 'A happy pet brings more: up to 50%.', cost: 1e9, earned: 5e8, happy: 0.15 },
  { key: 'happy3', label: 'Best pet ever', about: 'A happy pet brings more: up to 75%.', cost: 1e11, earned: 5e10, happy: 0.25 },
  { key: 'happy4', label: 'Spoiled rotten', about: 'A happy pet brings more: up to twice as much.', cost: 1e14, earned: 5e13, happy: 0.25 },
  { key: 'rainbow1', label: 'Rainbow chasers', about: 'Drops come 10% sooner.', cost: 777_777, rainbows: 3, sooner: 0.1 },
  { key: 'rainbow2', label: 'Rainbow lore', about: 'Drops stay twice as long.', cost: 77_777_777, rainbows: 7, longer: 2 },
  { key: 'rainbow3', label: 'Pots of gold', about: 'Drops that bring dew at once bring twice as much.', cost: 7_777_777_777, rainbows: 27, richer: 2 },
  { key: 'rainbow4', label: 'Sun showers', about: 'Drops come another 10% sooner.', cost: 777_777_777_777, rainbows: 77, sooner: 0.1 },
  ...COLLECTORS.flatMap((c) => TIERS.map(([owned, times], i) => ({
    key: `${c.key}${i + 1}`, label: i < 3 ? TIER_NAMES[c.key][i] : `${LATER_TIERS[i - 3]} ${c.many.toLowerCase()}`, about: `${c.many} bring twice as much.`,
    cost: c.cost * times, of: c.key, owned, double: true,
  }))),
];

// Drops: which kinds there are, the small ones often and the big ones seldom (`weight`: how many
// in a hundred; `tier`: 1 common to 4 legendary, for how they look). Each brings dew at once (`now`:
// that many seconds' collecting, or `pats` pats' worth, whichever's more, and `pats` more), or for a
// while (`for` seconds) `x` times as much: collecting, pats, or both (`on`). Boosts at once add up
// (twice as much and five times as much: six times as much).
const DROPS = [
  { key: 'dew', label: 'Dewdrop', tier: 1, weight: 30, now: 30, pats: 7, about: "Half a minute's collecting, at once." },
  { key: 'firefly', label: 'Firefly drop', tier: 1, weight: 26, on: 'collect', x: 2, for: 30, about: 'Everything collects twice as much, for 30 seconds.' },
  { key: 'rainbow', label: 'Rainbow drop', tier: 2, weight: 16, now: 60, pats: 13, about: "A minute's collecting, at once." },
  { key: 'lava', label: 'Lava drop', tier: 2, weight: 12, on: 'pats', x: 7, for: 30, about: 'Pats bring 7 times as much, for 30 seconds.' },
  { key: 'storm', label: 'Storm drop', tier: 3, weight: 7, now: 300, pats: 77, about: "5 minutes' collecting, at once." },
  { key: 'aurora', label: 'Aurora drop', tier: 3, weight: 5, on: 'collect', x: 5, for: 45, about: 'Everything collects 5 times as much, for 45 seconds.' },
  { key: 'golden', label: 'Golden drop', tier: 4, weight: 2, now: 900, pats: 300, about: "15 minutes' collecting, at once." },
  { key: 'star', label: 'Star drop', tier: 4, weight: 2, on: 'all', x: 7, for: 60, about: 'Everything collects, and pats bring, 7 times as much, for a minute.' },
];
const DROP_WEIGHT = DROPS.reduce((n, d) => n + d.weight, 0);
const dropOf = (key) => DROPS.find((d) => d.key === key) || DROPS.find((d) => d.key === 'rainbow');

const PATS_A_SECOND = 12; // (about as fast as anyone pats: more than that doesn't count)
const PATS_SAVED = 36; // (a few seconds' worth, for pats sent all at once)
const COLLECTED_MAX = 45_000; // (at a time: it's for while Rainlit's open, collected every 30 seconds)
const RAINBOW_FOR = 15_000; // (a drop's there this long)
const RAINBOW_EVERY = [4 * 60_000, 9 * 60_000];
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

// Milestones: things done along the way, each making everything collect 1% more, for good (reached
// as it happens: reach). The secret ones aren't said till they're reached (app.js).
const MILESTONE_MORE = 0.01;
const many = (n) => n.toLocaleString('en-US');
// ("a leaf", "an acorn cup", "the first rain".)
const aOne = (name) => (/^the /i.test(name) ? name.toLowerCase() : `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name.toLowerCase()}`);
const MILESTONES = [
  ...[[1, 'First pat'], [100, 'A hundred pats'], [1000, 'Pat pat pat'], [10_000, 'Ten thousand pats'], [50_000, 'Pat-a-thon'], [100_000, 'Pat master'],
    [250_000, 'A quarter of a million'], [500_000, 'Half a million pats'], [1_000_000, 'A million pats']]
    .map(([n, label], i) => ({ key: `pats-${i + 1}`, group: 'pats', label, about: `Pat it ${n === 1 ? 'once' : `${many(n)} times`}.`, test: (s) => s.pats >= n })),
  ...[[1e3, 'A puddle'], [1e6, 'A pond'], [1e9, 'A lake'], [1e12, 'A sea'], [1e15, 'An ocean'], [1e18, 'All the oceans'], [1e21, 'A world of dew'], [1e24, 'A sky full'],
    [1e27, 'Seas of stars'], [1e30, 'Everything, dewy']]
    .map(([n, label], i) => ({ key: `earned-${i + 1}`, group: 'earned', label, about: `Collect ${amount(n)} in all.`, test: (s) => s.earned >= n })),
  ...[[1e3, 'A steady drip'], [1e6, 'Pouring'], [1e9, 'A torrent'], [1e12, 'A deluge'], [1e15, 'A flood of floods'], [1e18, 'The rain itself']]
    .map(([n, label], i) => ({ key: `rate-${i + 1}`, group: 'rate', label, about: `Collect ${amount(n)} a second.`, test: (s, rate) => rate >= n })),
  ...COLLECTORS.flatMap((c) => [1, 50, 100, 200, 300, 400].map((n) => ({
    key: `${c.key}-${n}`, group: 'collectors', of: c.key, label: n === 1 ? (/^the /i.test(c.label) ? c.label : `A first ${c.label.toLowerCase()}`) : `${many(n)} ${c.many.toLowerCase()}`,
    about: n === 1 ? `Get ${aOne(c.label)}.` : `Have ${many(n)} ${c.many.toLowerCase()}.`, test: (s) => (Number(s.collectors[c.key]) || 0) >= n,
  }))),
  ...[[100, 'A collection'], [500, 'Busy, busy'], [1000, 'A thousand things'], [2000, 'Two thousand things'], [4000, 'More than can be counted']]
    .map(([n, label], i) => ({ key: `count-${i + 1}`, group: 'collectors', label, about: `Have ${many(n)} things collecting it, in all.`, test: (s) => countOf(s) >= n })),
  ...[[10, 'Getting better'], [25, 'Tinkerer'], [50, 'Handy'], [100, 'Inventor'], [150, 'Clever paws'], [200, 'Mastermind'], [250, 'Upgraded']]
    .map(([n, label], i) => ({ key: `upgrades-${i + 1}`, group: 'upgrades', label, about: `Get ${n} upgrades.`, test: (s) => s.upgrades.size >= n })),
  { key: 'upgrades-all', group: 'upgrades', label: 'Every last one', about: 'Get every upgrade there is.', test: (s) => UPGRADES.every((u) => s.upgrades.has(u.key)) },
  ...[[1, 'Catch!'], [10, 'Quick paws'], [50, 'Drop collector'], [100, 'A hundred drops'], [250, 'Rainmaker'], [500, 'Storm chaser'], [1000, 'A thousand drops']]
    .map(([n, label], i) => ({ key: `drops-${i + 1}`, group: 'drops', label, about: n === 1 ? 'Catch a drop.' : `Catch ${many(n)} drops.`, test: (s) => s.rainbows >= n })),
  ...DROPS.map((d) => ({ key: `drop-${d.key}`, group: 'drops', of: d.key, label: d.label, about: `Catch ${aOne(d.label)}.`, test: (s) => (Number(s.drops[d.key]) || 0) >= 1 })),
  { key: 'drops-all', group: 'drops', label: 'The full set', about: 'Catch every kind of drop.', test: (s) => DROPS.every((d) => Number(s.drops[d.key]) >= 1) },
  ...[[1, 'Something nice'], [10, 'Doing it up'], [25, 'Cozy'], [50, 'A room to remember']]
    .map(([n, label], i) => ({ key: `things-${i + 1}`, group: 'things', label, about: n === 1 ? 'Get something that only dew brings.' : `Get ${n} things that only dew brings.`, test: (s) => s.items.size >= n })),
  // (Secret, till they're reached.)
  { key: 'stacked', group: 'secret', hidden: true, label: 'Stacked', about: 'Have three boosts going at once.', test: (s, rate, now) => s.boosts.filter((b) => b.until > now).length >= 3 },
  { key: 'blur', group: 'secret', hidden: true, label: 'Paws a-blur', about: 'Pat as fast as it counts pats, for a few seconds.', test: (s, rate, now, extra) => (extra.counted || 0) >= PATS_SAVED },
  { key: 'spoiled', group: 'secret', hidden: true, label: 'Utterly spoiled', about: 'Get every upgrade for a happy pet.', test: (s) => ['happy1', 'happy2', 'happy3', 'happy4'].every((k) => s.upgrades.has(k)) },
  { key: 'legend', group: 'secret', hidden: true, label: 'Legendary luck', about: 'Catch ten legendary drops.', test: (s) => DROPS.filter((d) => d.tier === 4).reduce((n, d) => n + (Number(s.drops[d.key]) || 0), 0) >= 10 },
];

// Milestones reached just now (with how much it all brings, as it is), kept.
function reach(s, now, happy, extra = {}) {
  const rate = perSecond(s, happy);
  for (const m of MILESTONES) if (!s.milestones.has(m.key) && m.test(s, rate, now, extra)) s.milestones.add(m.key);
}

// Someone's dew, as it was last saved (`fresh`: they've never had any).
function load(userId) {
  const r = db.prepare('SELECT * FROM dew WHERE user_id = ?').get(userId);
  if (!r) return { user_id: userId, dew: 0, earned: 0, pats: 0, collectors: {}, upgrades: new Set(), items: new Set(), tick_at: 0, pat_room: 0, pat_at: 0, rainbow_at: 0, rainbows: 0, drop_kind: '', boosts: [], drops: {}, milestones: new Set(), fresh: true };
  const boosts = parsed(r.boosts, []);
  return { ...r, collectors: parsed(r.collectors, {}), upgrades: new Set(parsed(r.upgrades, [])), items: new Set(parsed(r.items, [])), boosts: Array.isArray(boosts) ? boosts : [], drops: parsed(r.drops, {}),
    milestones: new Set(parsed(r.milestones, [])), fresh: false };
}
function save(s) {
  db.prepare(`INSERT INTO dew (user_id, dew, earned, pats, collectors, upgrades, items, tick_at, pat_room, pat_at, rainbow_at, rainbows, drop_kind, boosts, drops, milestones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET dew = excluded.dew, earned = excluded.earned, pats = excluded.pats, collectors = excluded.collectors, upgrades = excluded.upgrades,
      items = excluded.items, tick_at = excluded.tick_at, pat_room = excluded.pat_room, pat_at = excluded.pat_at, rainbow_at = excluded.rainbow_at, rainbows = excluded.rainbows,
      drop_kind = excluded.drop_kind, boosts = excluded.boosts, drops = excluded.drops, milestones = excluded.milestones`)
    .run(s.user_id, s.dew, s.earned, s.pats, JSON.stringify(s.collectors), JSON.stringify([...s.upgrades]), JSON.stringify([...s.items]), s.tick_at, s.pat_room, s.pat_at, s.rainbow_at, s.rainbows,
      s.drop_kind || '', JSON.stringify(s.boosts || []), JSON.stringify(s.drops || {}), JSON.stringify([...(s.milestones || [])]));
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
// How much it all brings a second (more for a happy pet, and each milestone reached), and a pat.
const DOUBLES = new Map(COLLECTORS.map((c) => [c.key, UPGRADES.filter((u) => u.double && u.of === c.key).map((u) => u.key)]));
function perSecond(s, happy) {
  let rate = 0;
  for (const c of COLLECTORS) {
    const n = Number(s.collectors[c.key]) || 0;
    if (!n) continue;
    rate += n * c.rate * 2 ** DOUBLES.get(c.key).filter((k) => s.upgrades.has(k)).length;
  }
  const e = effects(s);
  return rate * e.boost * (1 + e.happy * happy) * (1 + MILESTONE_MORE * (s.milestones ? s.milestones.size : 0));
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

// Who has Rainlit open, and since when (lib/realtime.js: given to start()).
let onlineIds = () => [];
let onlineSince = () => null;

// What's been collected since it was last looked at: only while Rainlit's been open (from the
// moment it opened), and no more than a little while's (it's collected every half a minute while
// it's open, and as it closes: collectNow).
function collect(s, now, rate) {
  const since = onlineSince(s.user_id);
  const from = since === null ? now : Math.max(s.tick_at || now, since);
  const gap = Math.max(0, Math.min(now - from, COLLECTED_MAX));
  if (gap && rate) {
    // (A drop's boost brings more for as much of that time as it was going.)
    let ms = gap;
    for (const b of s.boosts) if (b.on !== 'pats') ms += (b.x - 1) * Math.max(0, Math.min(now, b.until) - Math.max(now - gap, b.from));
    const got = (rate * ms) / 1000;
    s.dew += got;
    s.earned += got;
  }
  s.tick_at = now;
  s.boosts = s.boosts.filter((b) => b.until > now); // (over: gone)
}
// How many times as much a boost brings now (collecting, or pats): those going, added up.
const boostNow = (s, on, now) => 1 + s.boosts.filter((b) => b.until > now && (b.on === on || b.on === 'all')).reduce((n, b) => n + b.x - 1, 0);
// When the next rainbow drop comes (the first, soon; one that got away, another later).
function rainbowDue(s, now) {
  if (!s.rainbow_at) {
    s.rainbow_at = now + rand(90_000, 180_000);
    s.drop_kind = 'rainbow';
  } else if (now > s.rainbow_at + rainbowFor(s) + 5_000) {
    nextDrop(s, now);
  }
}
function nextDrop(s, now) {
  s.rainbow_at = now + rand(...RAINBOW_EVERY) * (1 - effects(s).sooner);
  s.drop_kind = pickDrop();
}
// (Which kind: the common ones most of the time.)
function pickDrop(roll = Math.random()) {
  let r = roll * DROP_WEIGHT;
  for (const d of DROPS) {
    r -= d.weight;
    if (r < 0) return d.key;
  }
  return DROPS[0].key;
}

function view(s, happy, now) {
  const rate = perSecond(s, happy);
  const e = effects(s);
  return {
    dew: s.dew, earned: s.earned, pats: s.pats, rainbows: s.rainbows, perSecond: rate, perPat: perPat(s, rate), boost: e.boost, happyMore: e.happy * happy,
    collectors: { ...s.collectors }, upgrades: [...s.upgrades], items: [...s.items],
    rainbow: s.fresh ? null : { in: s.rainbow_at - now, for: rainbowFor(s), kind: dropOf(s.drop_kind).key },
    // (Boosts going: what, how many times as much, and how long left of how long.)
    boosts: s.boosts.filter((b) => b.until > now).map((b) => ({ kind: b.kind, on: b.on, x: b.x, left: b.until - now, for: b.until - b.from })),
    drops: { ...s.drops },
    milestones: [...s.milestones], milestoneMore: MILESTONE_MORE * s.milestones.size,
    // (How many pats would count right now, so the app counts only those too; and when this was, so
    // it can tell which of two answers is newer.)
    patRoom: Math.min(PATS_SAVED, s.pat_room + (Math.max(0, now - s.pat_at) / 1000) * PATS_A_SECOND), at: now,
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
    reach(s, now, happy);
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
  const got = counted * perPat(s, rate) * boostNow(s, 'pats', now);
  s.dew += got;
  s.earned += got;
  s.pats += counted;
  rainbowDue(s, now);
  reach(s, now, happy, { counted });
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
  reach(s, now, happy);
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
  const pet = pets.get(user.id);
  if (!pet) throw new DewError("There's no pet to dress up yet.", 404);
  if (!pets.canWear(pet.kind, slot, key)) throw new DewError(`That doesn't fit a ${pets.LABELS[pet.kind]}.`);
  const state = spend(user.id, (s) => {
    const id = `wear:${key}`;
    if (s.items.has(id)) return;
    afford(s, price);
    s.items.add(id);
  });
  return { dew: state, pet: pets.setWear(user, slot, key) };
}

// Catching a drop (while it's there): dew at once, or a boost for a while, as its kind brings; and
// the next one planned.
function catchDrop(userId) {
  const s = load(userId);
  const now = Date.now();
  const d = dropOf(s.drop_kind);
  if (s.fresh || !s.rainbow_at || now < s.rainbow_at - 2_000 || now > s.rainbow_at + rainbowFor(s) + 5_000) throw new DewError(`That ${d.label.toLowerCase()} got away.`, 409);
  const happy = happyOf(userId);
  const rate = perSecond(s, happy);
  collect(s, now, rate);
  const e = effects(s);
  let got = 0;
  if (d.now) {
    got = Math.round((Math.max(rate * d.now, perPat(s, rate) * d.pats) + d.pats) * e.richer);
    s.dew += got;
    s.earned += got;
  } else {
    s.boosts.push({ kind: d.key, on: d.on, x: d.x, from: now, until: now + d.for * 1000 });
  }
  s.rainbows += 1;
  s.drops[d.key] = (Number(s.drops[d.key]) || 0) + 1;
  nextDrop(s, now);
  reach(s, now, happy);
  save(s);
  return { got, kind: d.key, ...view(s, happy, now) };
}

// What someone's collectors have brought, up to now: every half a minute while they have Rainlit
// open, and just as it closes or goes to the background on a phone (lib/realtime.js says).
function collectNow(userId) {
  const s = load(userId);
  if (s.fresh || !Object.keys(s.collectors).length) return;
  const happy = happyOf(userId);
  const now = Date.now();
  collect(s, now, perSecond(s, happy));
  reach(s, now, happy);
  save(s);
}
// (For everyone with it open. And when the server stops for an update, so it's kept.)
function collectAll() {
  for (const id of onlineIds()) {
    try {
      collectNow(id);
    } catch (err) {
      console.error('[dew]', err.message);
    }
  }
}

// Collecting, for everyone with Rainlit open (`realtime`: lib/realtime.js, for who and since when).
// (DEW_COLLECT_MS: more often, for tests.)
let collecting = null;
function start(realtime) {
  if (collecting) return;
  ({ onlineIds, onlineSince } = realtime);
  collecting = setInterval(collectAll, Number(process.env.DEW_COLLECT_MS) || 30_000);
  collecting.unref();
}

// For "Download your data".
function exported(userId) {
  const s = load(userId);
  return s.fresh ? null : { dew: Math.floor(s.dew), earned: Math.floor(s.earned), pats: s.pats, rainbows: s.rainbows, drops: s.drops, milestones: [...s.milestones], collectors: s.collectors, upgrades: [...s.upgrades], items: [...s.items] };
}

// What there is, what it costs and what it does (the same for everyone: the app shows it).
const SHOP = {
  collectors: COLLECTORS,
  upgrades: UPGRADES,
  items: Object.entries(pets.DEW_ROOM).flatMap(([list, things]) => Object.entries(things).map(([key, price]) => ({ list, key, price }))),
  wear: Object.entries(pets.WEAR).flatMap(([slot, things]) => Object.entries(things).map(([key, price]) => ({ slot, key, price }))),
  drops: DROPS.map((d) => ({ key: d.key, label: d.label, tier: d.tier, about: d.about, on: d.on || null, x: d.x || null, for: d.for || null })),
  milestones: MILESTONES.map((m) => ({ key: m.key, group: m.group, label: m.label, about: m.about, of: m.of || null, hidden: Boolean(m.hidden) })), milestoneMore: MILESTONE_MORE,
  moreEach: MORE_EACH, patsASecond: PATS_A_SECOND, patsSaved: PATS_SAVED, happyMore: HAPPY_MORE,
};

module.exports = { DewError, SHOP, DROPS, MILESTONES, get, pat, buy, upgrade, unlock, wearIt, catchDrop, rainbow: catchDrop, pickDrop, start, collectNow, collectAll, exported, perSecond, perPat, ready, effects };
