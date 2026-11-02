'use strict';

// Events: something planned in a space, for a time, in one of its voice channels or somewhere else,
// and who's going (or might, or can't). And each person's free times: the hours of the week they're
// usually free, in their own time zone, so whoever plans an event can see when most can come.
// (Who can do what is server.js's to check: lib/spaces.js's "events" and "manageEvents".)

const crypto = require('crypto');
const { db } = require('./db');
const { oneLine, cleanTz } = require('./people');

const TITLE_MAX = 80;
const ABOUT_MAX = 1000;
const PLACE_MAX = 80;
const COMING_MAX = 50; // (a space's, not ended yet, at once)
const LONGEST = 7 * 86_400_000; // (an event a week long at most)
const AHEAD = 366 * 86_400_000; // (and planned a year ahead at most)
const NO_END = 3_600_000; // (one with no end set: an hour, as far as being on goes)
const LATE = 15 * 60_000; // (one that started while the server was away is still said to be starting, this long after)
const KEEP = 30 * 86_400_000; // (kept this long after it ends, then gone)
const ANSWERS = ['going', 'maybe', 'no'];
const REPEATS = ['week', '2weeks', 'month'];
const PAST_MAX = 50; // (past ones, listed)
const HOURS = 7 * 24; // (free times: an hour each, Monday midnight first)

class EventError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newId = () => crypto.randomBytes(12).toString('hex');

// As the app has it: who's going, who might be and who can't (people still in its space, in the
// order they said so).
function json(e) {
  const answers = db.prepare(`
    SELECT r.user_id, r.answer FROM event_rsvps r
    JOIN space_members m ON m.space_id = ? AND m.user_id = r.user_id
    WHERE r.event_id = ? ORDER BY r.at
  `).all(e.space_id, e.id);
  const of = (a) => answers.filter((r) => r.answer === a).map((r) => r.user_id);
  return {
    id: e.id, spaceId: e.space_id, title: e.title, about: e.about,
    startsAt: e.starts_at, endsAt: e.ends_at || null,
    channelId: e.channel_id || null, place: e.place || '',
    creatorId: e.creator_id || null, createdAt: e.created_at,
    repeats: e.repeats || '', series: e.series || null,
    going: of('going'), maybe: of('maybe'), no: of('no'),
  };
}

const get = (id) => db.prepare('SELECT * FROM events WHERE id = ?').get(String(id)) || null;
const one = (id) => {
  const e = get(id);
  return e ? json(e) : null;
};

// A space's events that haven't ended, soonest first.
function coming(spaceId, now = Date.now()) {
  return db.prepare('SELECT * FROM events WHERE space_id = ? AND COALESCE(ends_at, starts_at + ?) > ? ORDER BY starts_at, created_at')
    .all(String(spaceId), NO_END, now).map(json);
}

// And those that have (as long as they're kept: a month), latest first.
function past(spaceId, now = Date.now()) {
  return db.prepare('SELECT * FROM events WHERE space_id = ? AND COALESCE(ends_at, starts_at + ?) <= ? ORDER BY starts_at DESC LIMIT ?')
    .all(String(spaceId), NO_END, now, PAST_MAX).map(json);
}

// ----- Repeating -----
// The next time a repeating one's on: a week, two or a month on, at the same time of day where it
// was planned (so 8 PM stays 8 PM when the clocks change). A month on from the 31st is the last day
// of a shorter month.

const zoneParts = new Map();
function partsIn(t, tz) {
  if (!zoneParts.has(tz)) zoneParts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
  const p = Object.fromEntries(zoneParts.get(tz).formatToParts(t).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) };
}
// (A time of day on a day, where tz is, as a moment.)
function zoned(y, mo, d, h, mi, tz) {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = partsIn(t, tz);
    const off = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - want;
    if (!off) break;
    t -= off;
  }
  return t;
}
function nextTime(t, repeats, tz = 'UTC') {
  const p = partsIn(t, tz);
  if (repeats === 'month') {
    const [y, mo] = p.mo === 12 ? [p.y + 1, 1] : [p.y, p.mo + 1];
    return zoned(y, mo, Math.min(p.d, new Date(Date.UTC(y, mo, 0)).getUTCDate()), p.h, p.mi, tz);
  }
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d + (repeats === '2weeks' ? 14 : 7)));
  return zoned(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), p.h, p.mi, tz);
}

// The next of a repeating one, made (once), as it was planned, the next time it's on after now; its
// planner going, as they were to this one. Not once its planner's gone from the space.
function spawnFrom(e, now = Date.now()) {
  if (!e.repeats || e.spawned) return null;
  db.prepare('UPDATE events SET spawned = 1 WHERE id = ?').run(e.id);
  const still = e.creator_id && db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(e.space_id, e.creator_id);
  if (!still) return null;
  let at = nextTime(e.starts_at, e.repeats, e.tz || 'UTC');
  while (at <= now) at = nextTime(at, e.repeats, e.tz || 'UTC');
  const id = newId();
  db.prepare(`
    INSERT INTO events (id, space_id, creator_id, title, about, starts_at, ends_at, channel_id, place, created_at, updated_at, repeats, tz, series)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, e.space_id, e.creator_id, e.title, e.about, at, e.ends_at ? at + (e.ends_at - e.starts_at) : null, e.channel_id, e.place, now, now, e.repeats, e.tz, e.series || e.id);
  answer(id, e.creator_id, 'going', now);
  return one(id);
}

// Those that have started and haven't had their next made: made now.
function spawnDue(now = Date.now()) {
  return db.prepare("SELECT * FROM events WHERE repeats <> '' AND spawned = 0 AND starts_at <= ?").all(now)
    .map((e) => spawnFrom(e, now)).filter(Boolean);
}

// What's asked for, checked: a name; when (not gone by, up to a year ahead, a week long at most:
// was, an event being changed, keeps its start even if that's gone by); where (one of the voice
// channels given, or a few words); and a little about it.
function clean(b, voiceChannels, was = null, now = Date.now()) {
  const title = oneLine(b.title, TITLE_MAX);
  if (!title) throw new EventError(400, 'Give it a name.');
  const startsAt = Math.round(Number(b.startsAt));
  if (!Number.isFinite(startsAt) || startsAt <= 0) throw new EventError(400, 'Pick when it starts.');
  if (!(was && was.starts_at === startsAt) && startsAt < now - 5 * 60_000) throw new EventError(400, "Pick a time that hasn't been yet.");
  if (startsAt > now + AHEAD) throw new EventError(400, 'Pick a time within the next year.');
  const endsAt = b.endsAt === null || b.endsAt === undefined || b.endsAt === '' ? null : Math.round(Number(b.endsAt));
  if (endsAt !== null && (!Number.isFinite(endsAt) || endsAt <= startsAt)) throw new EventError(400, 'It has to end after it starts.');
  if (endsAt !== null && endsAt - startsAt > LONGEST) throw new EventError(400, 'An event can be a week long at most.');
  const channelId = b.channelId ? String(b.channelId) : null;
  if (channelId && !voiceChannels.includes(channelId) && !(was && was.channel_id === channelId)) throw new EventError(400, "That voice channel isn't there.");
  const place = channelId ? '' : oneLine(b.place, PLACE_MAX);
  const about = String(b.about || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, ABOUT_MAX);
  // (Repeating: how often, and where it was planned, for its time of day there.)
  const repeats = REPEATS.includes(b.repeats) ? b.repeats : '';
  const tz = cleanTz(b.tz) || (was && was.tz) || 'UTC';
  return { title, startsAt, endsAt, channelId, place, about, repeats, tz };
}

// A new one (its maker's going).
function create(spaceId, creatorId, f, now = Date.now()) {
  const n = db.prepare('SELECT COUNT(*) n FROM events WHERE space_id = ? AND COALESCE(ends_at, starts_at + ?) > ?').get(spaceId, NO_END, now).n;
  if (n >= COMING_MAX) throw new EventError(400, `A space can have ${COMING_MAX} events coming up at once.`);
  const id = newId();
  db.prepare(`
    INSERT INTO events (id, space_id, creator_id, title, about, starts_at, ends_at, channel_id, place, created_at, updated_at, repeats, tz, series)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, spaceId, creatorId, f.title, f.about, f.startsAt, f.endsAt, f.channelId, f.place, now, now, f.repeats, f.tz, f.repeats ? id : null);
  answer(id, creatorId, 'going', now);
  return one(id);
}

// Changed (moved: said again to be starting, when it is). One that repeats: just this one (the rest
// go on as they were, its next made first if it hasn't been; it repeats no more itself), or all of
// them (those after it go, and are made again from it). Returns it, and any others gone or made.
function update(id, f, { all = false } = {}, now = Date.now()) {
  const was = get(id);
  if (!was) throw new EventError(404, "That event isn't there.");
  const made = [];
  const gone = [];
  if (was.repeats && !all) {
    const next = spawnFrom(was, now);
    if (next) made.push(next);
    f = { ...f, repeats: '' };
  }
  const series = f.repeats ? was.series || was.id : was.series;
  db.prepare(`
    UPDATE events SET title = ?, about = ?, starts_at = ?, ends_at = ?, channel_id = ?, place = ?, updated_at = ?, repeats = ?, tz = ?, series = ?,
      reminded_at = CASE WHEN ? = starts_at THEN reminded_at ELSE NULL END
    WHERE id = ?
  `).run(f.title, f.about, f.startsAt, f.endsAt, f.channelId, f.place, now, f.repeats, f.tz, series, f.startsAt, id);
  if (all && was.series && was.repeats) {
    for (const r of db.prepare('SELECT id FROM events WHERE series = ? AND id <> ? AND starts_at > ?').all(was.series, id, Math.max(now, was.starts_at))) gone.push(r.id);
    for (const g of gone) db.prepare('DELETE FROM events WHERE id = ?').run(g);
    db.prepare('UPDATE events SET spawned = 0 WHERE id = ?').run(id);
  }
  return { event: one(id), gone, made };
}

// Cancelled. One that repeats: just this one (its next made first, so the rest go on), or all of
// them that haven't ended. Returns the ones gone, and any made.
function remove(id, { all = false } = {}, now = Date.now()) {
  const e = get(id);
  if (!e) return { gone: [], made: [] };
  if (all && e.series && e.repeats) {
    const gone = db.prepare('SELECT id FROM events WHERE series = ? AND COALESCE(ends_at, starts_at + ?) > ?').all(e.series, NO_END, now).map((r) => r.id);
    if (!gone.includes(e.id)) gone.push(e.id);
    for (const g of gone) db.prepare('DELETE FROM events WHERE id = ?').run(g);
    return { gone, made: [] };
  }
  const next = e.repeats ? spawnFrom(e, now) : null;
  db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
  return { gone: [e.id], made: next ? [next] : [] };
}

// Going, maybe, can't ('no'), or nothing ('').
function answer(eventId, userId, a, now = Date.now()) {
  if (!a) {
    db.prepare('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?').run(eventId, userId);
    return;
  }
  if (!ANSWERS.includes(a)) throw new EventError(400, 'Going, maybe, or not?');
  db.prepare(`
    INSERT INTO event_rsvps (event_id, user_id, answer, at) VALUES (?, ?, ?, ?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET answer = excluded.answer, at = CASE WHEN answer = excluded.answer THEN at ELSE excluded.at END
  `).run(eventId, userId, a, now);
}

// Those starting now (or a little while ago, while the server was away) that haven't been said to
// be: they're marked said.
function starting(now = Date.now()) {
  const rows = db.prepare('SELECT * FROM events WHERE reminded_at IS NULL AND starts_at <= ? AND starts_at > ?').all(now, now - LATE);
  for (const e of rows) db.prepare('UPDATE events SET reminded_at = ? WHERE id = ?').run(now, e.id);
  return rows.map(json);
}

// When the next one starts (0: none), to wake for it.
function nextStart(now = Date.now()) {
  return db.prepare('SELECT MIN(starts_at) t FROM events WHERE reminded_at IS NULL AND starts_at > ?').get(now).t || 0;
}

// Long over: gone.
function prune(now = Date.now()) {
  db.prepare('DELETE FROM events WHERE COALESCE(ends_at, starts_at + ?) < ?').run(NO_END, now - KEEP);
}

// ----- Free times -----

function freeTimes(userId) {
  const r = db.prepare('SELECT tz, hours, updated_at FROM free_times WHERE user_id = ?').get(String(userId));
  return r ? { tz: r.tz, hours: r.hours, at: r.updated_at } : null;
}

// hours: 168 of 0 and 1, Monday midnight first, in time zone tz (none free: none kept).
function setFreeTimes(userId, tz, hours, now = Date.now()) {
  if (typeof hours !== 'string' || hours.length !== HOURS || /[^01]/.test(hours)) throw new EventError(400, "Those free times don't look right.");
  if (!hours.includes('1')) {
    db.prepare('DELETE FROM free_times WHERE user_id = ?').run(userId);
    return;
  }
  db.prepare(`
    INSERT INTO free_times (user_id, tz, hours, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET tz = excluded.tz, hours = excluded.hours, updated_at = excluded.updated_at
  `).run(userId, tz, hours, now);
}

// The free times of a space's members (those who've set them).
function freeTimesIn(spaceId) {
  return db.prepare(`
    SELECT f.user_id AS id, f.tz, f.hours FROM free_times f
    JOIN space_members m ON m.space_id = ? AND m.user_id = f.user_id
  `).all(String(spaceId));
}

// For their data export: their free times, the events they've planned, and what they've said.
function exported(userId) {
  const when = (t) => (t ? new Date(t).toISOString() : null);
  const free = freeTimes(userId);
  return {
    freeTimes: free ? { timeZone: free.tz, mondayMidnightFirst: free.hours, updated: when(free.at) } : null,
    planned: db.prepare('SELECT e.*, s.name space FROM events e LEFT JOIN spaces s ON s.id = e.space_id WHERE e.creator_id = ? ORDER BY e.starts_at').all(userId)
      .map((e) => ({ title: e.title, about: e.about || null, space: e.space, starts: when(e.starts_at), ends: when(e.ends_at), place: e.place || null, repeats: e.repeats || null })),
    answered: db.prepare(`
      SELECT r.answer, r.at, e.title, e.starts_at, s.name space FROM event_rsvps r
      JOIN events e ON e.id = r.event_id LEFT JOIN spaces s ON s.id = e.space_id
      WHERE r.user_id = ? ORDER BY e.starts_at
    `).all(userId).map((r) => ({ event: r.title, space: r.space, starts: when(r.starts_at), answer: r.answer, at: when(r.at) })),
  };
}

module.exports = {
  EventError, TITLE_MAX, ABOUT_MAX, PLACE_MAX, COMING_MAX, NO_END, HOURS, REPEATS,
  get, one, json, coming, past, clean, create, update, remove, answer, starting, nextStart, prune, nextTime, spawnDue,
  freeTimes, setFreeTimes, freeTimesIn, exported,
};
