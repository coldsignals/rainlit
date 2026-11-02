'use strict';

// Events: something planned in a space, for a time, in one of its voice channels or somewhere else,
// and who's going (or might, or can't). And each person's free times: the hours of the week they're
// usually free, in their own time zone, so whoever plans an event can see when most can come.
// (Who can do what is server.js's to check: lib/spaces.js's "events" and "manageEvents".)

const crypto = require('crypto');
const { db } = require('./db');
const { oneLine } = require('./people');

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
  return { title, startsAt, endsAt, channelId, place, about };
}

// A new one (its maker's going).
function create(spaceId, creatorId, f, now = Date.now()) {
  const n = db.prepare('SELECT COUNT(*) n FROM events WHERE space_id = ? AND COALESCE(ends_at, starts_at + ?) > ?').get(spaceId, NO_END, now).n;
  if (n >= COMING_MAX) throw new EventError(400, `A space can have ${COMING_MAX} events coming up at once.`);
  const id = newId();
  db.prepare(`
    INSERT INTO events (id, space_id, creator_id, title, about, starts_at, ends_at, channel_id, place, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, spaceId, creatorId, f.title, f.about, f.startsAt, f.endsAt, f.channelId, f.place, now, now);
  answer(id, creatorId, 'going', now);
  return one(id);
}

// Changed (moved: said again to be starting, when it is).
function update(id, f, now = Date.now()) {
  const was = get(id);
  if (!was) throw new EventError(404, "That event isn't there.");
  db.prepare(`
    UPDATE events SET title = ?, about = ?, starts_at = ?, ends_at = ?, channel_id = ?, place = ?, updated_at = ?,
      reminded_at = CASE WHEN ? = starts_at THEN reminded_at ELSE NULL END
    WHERE id = ?
  `).run(f.title, f.about, f.startsAt, f.endsAt, f.channelId, f.place, now, f.startsAt, id);
  return one(id);
}

function remove(id) {
  db.prepare('DELETE FROM events WHERE id = ?').run(String(id));
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
      .map((e) => ({ title: e.title, about: e.about || null, space: e.space, starts: when(e.starts_at), ends: when(e.ends_at), place: e.place || null })),
    answered: db.prepare(`
      SELECT r.answer, r.at, e.title, e.starts_at, s.name space FROM event_rsvps r
      JOIN events e ON e.id = r.event_id LEFT JOIN spaces s ON s.id = e.space_id
      WHERE r.user_id = ? ORDER BY e.starts_at
    `).all(userId).map((r) => ({ event: r.title, space: r.space, starts: when(r.starts_at), answer: r.answer, at: when(r.at) })),
  };
}

module.exports = {
  EventError, TITLE_MAX, ABOUT_MAX, PLACE_MAX, COMING_MAX, NO_END, HOURS,
  get, one, json, coming, clean, create, update, remove, answer, starting, nextStart, prune,
  freeTimes, setFreeTimes, freeTimesIn, exported,
};
