'use strict';

// The call debug log. With Settings > Call debug log on, a device notes what happens to its
// calls' connections (its link to this server, the call's own link and route, the app being
// paused, hidden or started again, the network changing) and sends the notes here, and the
// server adds what it saw of the same calls. Whoever runs the server can download a pair of
// people's notes as one timeline, to see why a call dropped. Never what's said or shared, and
// no addresses. Notes are kept for a week.

const { db, transaction } = require('./db');

const KEEP_MS = 7 * 24 * 3600_000;
const MAX_BATCH = 120; // notes per request (requests can be 32 KB at most)
const KIND_RE = /^[a-z][a-z0-9-]{0,39}$/;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

const pairOf = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

const insert = db.prepare(`INSERT OR IGNORE INTO trace_events (pair, user_id, device, note_id, call_id, t, kind, data)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

function detail(data) {
  if (!data || typeof data !== 'object') return null;
  const json = JSON.stringify(data);
  if (json === '{}') return null;
  return json.length > 1500 ? JSON.stringify({ note: 'too long to keep' }) : json;
}

// What the server saw of a pair's call, or ('*') of itself: starting and stopping.
function add({ pair, callId = null, kind, data = null, t = Date.now() }) {
  insert.run(pair, null, 'server', null, callId, t, kind, detail(data));
}

// Notes from someone's device about their calls with a friend (w). Each note has its own id
// (i), so one sent twice (the page couldn't tell whether it arrived) is only kept once.
// Returns how many were new.
function addFromDevice(userId, device, entries) {
  const now = Date.now();
  let kept = 0;
  transaction(() => {
    for (const e of entries.slice(0, MAX_BATCH)) {
      if (!e || typeof e !== 'object') continue;
      const { t, k, w, c, i, ...rest } = e;
      if (!KIND_RE.test(String(k)) || !ID_RE.test(String(w)) || !Number.isFinite(t)) continue;
      if (t < now - KEEP_MS || t > now + 3600_000) continue; // too old to keep, or a clock far off
      const noteId = ID_RE.test(String(i)) ? String(i) : null;
      const callId = ID_RE.test(String(c)) ? String(c) : null;
      kept += Number(insert.run(pairOf(userId, String(w)), userId, device, noteId, callId, Math.round(t), String(k), detail(rest)).changes);
    }
  });
  return kept;
}

// Pairs of people with notes this week, the most recent first.
function pairs() {
  return db.prepare(`SELECT pair, MIN(t) AS first, MAX(t) AS last, COUNT(*) AS notes FROM trace_events
    WHERE pair != '*' GROUP BY pair ORDER BY last DESC`).all();
}

const day = (t) => new Date(t).toISOString().slice(0, 10);
const clock = (t) => new Date(t).toISOString().slice(11, 23);

function describe(json) {
  if (!json) return '';
  let data;
  try { data = JSON.parse(json); } catch { return json; }
  return Object.entries(data).map(([k, v]) => `${k}=${v && typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
}

// One pair's notes since a time (with the server's own starts and stops), as text: one line
// a note, oldest first, in UTC. nameOf turns a user id into a name.
function timeline(pair, since, nameOf) {
  const rows = db.prepare(`SELECT * FROM trace_events WHERE (pair = ? OR pair = '*') AND t >= ? ORDER BY t, id`).all(pair, since);
  const people = pair.split(':');
  const who = (r) => (r.user_id ? nameOf(r.user_id) : 'server');
  const width = Math.max(6, ...people.map((id) => nameOf(id).length));
  const devices = db.prepare(`SELECT user_id, device, COUNT(*) AS notes, MIN(t) AS first, MAX(t) AS last FROM trace_events
    WHERE pair = ? AND t >= ? AND user_id IS NOT NULL GROUP BY user_id, device ORDER BY first`).all(pair, since);
  const lines = [
    'Rainlit call debug log',
    `People: ${people.map(nameOf).join(' and ')}`,
    `From ${day(since)} ${clock(since).slice(0, 8)} to ${day(Date.now())} ${clock(Date.now()).slice(0, 8)} (times in UTC)`,
    'Devices:',
    ...(devices.length
      ? devices.map((d) => `  ${nameOf(d.user_id)}: ${d.device || 'unknown'} (${d.notes} note${d.notes === 1 ? '' : 's'}, ${clock(d.first).slice(0, 5)} to ${clock(d.last).slice(0, 5)})`)
      : ['  (no notes from either device yet)']),
    '',
  ];
  let lastDay = '';
  for (const r of rows) {
    if (day(r.t) !== lastDay) {
      lastDay = day(r.t);
      lines.push(`---- ${lastDay} ----`);
    }
    lines.push(`${clock(r.t)}  ${who(r).padEnd(width)}  ${r.kind}${r.data ? `  ${describe(r.data)}` : ''}${r.call_id ? `  [call ${r.call_id.slice(0, 8)}]` : ''}`);
  }
  if (!rows.length) lines.push('(nothing in this time)');
  return `${lines.join('\n')}\n`;
}

function prune() {
  db.prepare('DELETE FROM trace_events WHERE t < ?').run(Date.now() - KEEP_MS);
}
prune();
setInterval(prune, 6 * 3600_000).unref();

module.exports = { MAX_BATCH, pairOf, add, addFromDevice, pairs, timeline };
