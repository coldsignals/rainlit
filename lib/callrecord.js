'use strict';

// Someone's own record of their calls, if they've turned it on (Your profile > Keep a record of
// my calls): when each call with a friend started and ended (and who rang), and each visit to a
// voice channel or group call, with how long they were there with each person. It's theirs, for
// their own records, like a phone's call history: in their data download and their records of
// time with a friend (lib/record.js), until they delete it (or their account). A call's kept even
// where the conversation isn't saving its messages; nothing that's said is ever kept.
//
// Calls and visits still going are marked as seen every minute. If Rainlit's server stops (an
// update), one that doesn't pick up again soon after (calls carry on after an update) ended when
// it was last seen.

const crypto = require('crypto');
const { db } = require('./db');

const STALE_MS = 30 * 60_000;
const newId = () => crypto.randomBytes(12).toString('hex');

const keeping = (userId) => Boolean((db.prepare('SELECT call_log_since FROM users WHERE id = ?').get(String(userId)) || {}).call_log_since);
const since = (userId) => (db.prepare('SELECT call_log_since FROM users WHERE id = ?').get(String(userId)) || {}).call_log_since || null;

// ---------- Calls with a friend ----------

const calls = new Map(); // row id -> user id (calls going on now, to mark as seen)

function callStarted(userId, friendId, call, callerId = null) {
  if (!keeping(userId)) return;
  const now = Date.now();
  // (Picked up again after a restart: the same call.)
  const row = db.prepare('SELECT id FROM call_log WHERE user_id = ? AND call_id = ? AND ended_at IS NULL').get(userId, call.id);
  if (row) {
    db.prepare('UPDATE call_log SET seen_at = ? WHERE id = ?').run(now, row.id);
    calls.set(row.id, userId);
    return;
  }
  const id = newId();
  db.prepare("INSERT INTO call_log (id, user_id, kind, call_id, friend_id, caller_id, started_at, seen_at) VALUES (?, ?, 'call', ?, ?, ?, ?, ?)")
    .run(id, userId, call.id, friendId, callerId, call.startedAt, now);
  calls.set(id, userId);
}

function callEnded(userId, call, endedAt) {
  const row = db.prepare('SELECT id FROM call_log WHERE user_id = ? AND call_id = ? AND ended_at IS NULL').get(userId, call.id);
  if (!row) return;
  db.prepare('UPDATE call_log SET ended_at = ?, seen_at = ? WHERE id = ?').run(endedAt, endedAt, row.id);
  calls.delete(row.id);
}

// ---------- Voice channels and group calls ----------
// Who's in each (everyone, kept or not: time together counts both ways), since when; and the
// visits being kept, with each one's time so far with each person there.

const present = new Map(); // channel id -> Map(user id -> when they came in)
const visits = new Map(); // user id -> { id, channelId, together: Map(user id -> ms) }

// Time two people have been in a channel together, from when the later of them came in.
const overlap = (here, a, b, now) => now - Math.max(here.get(a), here.get(b));

// place: where, as it's called then ("#hangout · Night Owls", or a group's name).
function voiceIn(userId, channelId, place) {
  if (!present.has(channelId)) present.set(channelId, new Map());
  const here = present.get(channelId);
  if (here.has(userId)) return; // (already there: back after a blip)
  const now = Date.now();
  here.set(userId, now);
  if (!keeping(userId)) return;
  // (After a restart: their visit carries on, if it was still open.)
  const row = db.prepare("SELECT id, together FROM call_log WHERE user_id = ? AND kind = 'voice' AND channel_id = ? AND ended_at IS NULL AND seen_at > ?")
    .get(userId, channelId, now - STALE_MS);
  let together = new Map();
  let id;
  if (row) {
    id = row.id;
    try { together = new Map(Object.entries(JSON.parse(row.together || '{}'))); } catch {}
    db.prepare('UPDATE call_log SET seen_at = ? WHERE id = ?').run(now, id);
  } else {
    id = newId();
    db.prepare("INSERT INTO call_log (id, user_id, kind, channel_id, place, started_at, seen_at, together) VALUES (?, ?, 'voice', ?, ?, ?, ?, '{}')")
      .run(id, userId, channelId, String(place || '').slice(0, 120), now, now);
  }
  visits.set(userId, { id, channelId, together });
}

function voiceOut(userId, channelId) {
  const here = present.get(channelId);
  if (!here || !here.has(userId)) return;
  const now = Date.now();
  const mine = visits.get(userId);
  for (const other of here.keys()) {
    if (other === userId) continue;
    const t = overlap(here, userId, other, now);
    if (mine && mine.channelId === channelId) mine.together.set(other, (mine.together.get(other) || 0) + t);
    const theirs = visits.get(other);
    if (theirs && theirs.channelId === channelId) theirs.together.set(userId, (theirs.together.get(userId) || 0) + t);
  }
  here.delete(userId);
  if (!here.size) present.delete(channelId);
  if (mine && mine.channelId === channelId) {
    visits.delete(userId);
    db.prepare('UPDATE call_log SET ended_at = ?, seen_at = ?, together = ? WHERE id = ?').run(now, now, JSON.stringify(Object.fromEntries(mine.together)), mine.id);
  }
}

// What a visit's time together is so far (what's ended, and what's still going).
function soFar(userId, v, now) {
  const all = new Map(v.together);
  const here = present.get(v.channelId);
  if (here && here.has(userId)) {
    for (const other of here.keys()) if (other !== userId) all.set(other, (all.get(other) || 0) + overlap(here, userId, other, now));
  }
  return Object.fromEntries(all);
}

// ---------- Turning it on and off, and deleting it ----------

function setKeeping(userId, on) {
  if (on) {
    db.prepare('UPDATE users SET call_log_since = COALESCE(call_log_since, ?) WHERE id = ?').run(Date.now(), userId);
    return;
  }
  db.prepare('UPDATE users SET call_log_since = NULL WHERE id = ?').run(userId);
  stopFor(userId);
}

// (What was going on ends now: nothing more is kept.)
function stopFor(userId) {
  const now = Date.now();
  const v = visits.get(userId);
  if (v) {
    visits.delete(userId);
    db.prepare('UPDATE call_log SET ended_at = ?, seen_at = ?, together = ? WHERE id = ?').run(now, now, JSON.stringify(soFar(userId, v, now)), v.id);
  }
  for (const [id, owner] of calls) {
    if (owner !== userId) continue;
    calls.delete(id);
    db.prepare('UPDATE call_log SET ended_at = ?, seen_at = ? WHERE id = ? AND ended_at IS NULL').run(now, now, id);
  }
}

function clear(userId) {
  stopFor(userId);
  return db.prepare('DELETE FROM call_log WHERE user_id = ?').run(userId).changes;
}

// ---------- Kept up to date ----------

function markSeen() {
  const now = Date.now();
  for (const id of calls.keys()) db.prepare('UPDATE call_log SET seen_at = ? WHERE id = ?').run(now, id);
  for (const [userId, v] of visits) db.prepare('UPDATE call_log SET seen_at = ?, together = ? WHERE id = ?').run(now, JSON.stringify(soFar(userId, v, now)), v.id);
  // (Left open by a server that stopped, and not picked up again: ended when last seen.)
  db.prepare('UPDATE call_log SET ended_at = seen_at WHERE ended_at IS NULL AND seen_at < ?').run(now - STALE_MS);
}
setInterval(markSeen, 60_000).unref();

// ---------- Reading it ----------

const json = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// Someone's calls with a friend, and their visits where that friend was there too (with how long).
function withFriend(userId, friendId) {
  const rows = db.prepare('SELECT * FROM call_log WHERE user_id = ? ORDER BY started_at').all(userId);
  return {
    calls: rows.filter((r) => r.kind === 'call' && r.friend_id === friendId)
      .map((r) => ({ start: r.started_at, end: r.ended_at, by: r.caller_id })),
    voice: rows.filter((r) => r.kind === 'voice' && json(r.together)[friendId] > 0)
      .map((r) => ({ start: r.started_at, end: r.ended_at, place: r.place, together: json(r.together)[friendId] })),
  };
}

// All of someone's record (for their data download).
function all(userId) {
  return db.prepare('SELECT * FROM call_log WHERE user_id = ? ORDER BY started_at').all(userId).map((r) => ({
    kind: r.kind, start: r.started_at, end: r.ended_at, friend: r.friend_id, caller: r.caller_id, place: r.place, together: json(r.together),
  }));
}

const hasAny = (userId, friendId) => Boolean(db.prepare("SELECT 1 FROM call_log WHERE user_id = ? AND kind = 'call' AND friend_id = ? LIMIT 1").get(userId, friendId));

module.exports = { keeping, since, setKeeping, clear, callStarted, callEnded, voiceIn, voiceOut, markSeen, withFriend, all, hasAny };
