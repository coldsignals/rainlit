// Notifications: the small, friendly things that happened while you weren't looking, kept in one
// place (the bell by your profile: public/app.js). Someone signed your guestbook, asked you a
// question, answered one you asked, or petted your pet. Not messages, mentions or friend requests:
// those have their own places. Calm: no sound and nothing pushed, just a dot on the bell (which can
// be turned off). Kept for 30 days.
const crypto = require('node:crypto');
const { db } = require('./db');
const people = require('./people');

const KEEP_MS = 30 * 86400_000;
const SHOWN = 80;
// (Petting: one line for each person's petting in a while, counting up, not a line a pet.)
const PETTING_MS = 6 * 3600_000;
const KINDS = ['guestbook', 'question', 'answer', 'petted'];

const add = (userId, kind, fromId, ref, pet, now) => db.prepare('INSERT INTO notices (id, user_id, kind, from_id, ref, pet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(crypto.randomBytes(12).toString('hex'), userId, kind, fromId || null, String(ref || ''), String(pet || ''), now);

// Something for userId to hear of. fromId: who did it (null: they asked anonymously). ref: the
// guestbook entry or the question it's about (gone with it: forget). Returns true (it's new).
function record(userId, kind, fromId, ref = '') {
  if (!KINDS.includes(kind) || userId === fromId) return false;
  const now = Date.now();
  db.prepare('DELETE FROM notices WHERE user_id = ? AND created_at < ?').run(userId, now - KEEP_MS);
  add(userId, kind, fromId, ref, '', now);
  return true;
}

// Someone petted userId's pet (fromId null: a visitor to their homepage without an account, all of
// them counted together). Returns whether that's a new line, not one more on a line that's there.
function petted(userId, fromId, petName) {
  if (userId === fromId) return false;
  const now = Date.now();
  const r = db.prepare("SELECT id FROM notices WHERE user_id = ? AND kind = 'petted' AND from_id IS ? AND pet = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1")
    .get(userId, fromId || null, String(petName || ''), now - PETTING_MS);
  if (r) {
    db.prepare('UPDATE notices SET n = n + 1 WHERE id = ?').run(r.id);
    return false;
  }
  add(userId, 'petted', fromId, '', petName, now);
  return true;
}

// What it was about is gone (the guestbook entry deleted, the question taken back): so is it.
function forget(ref) {
  if (ref) db.prepare('DELETE FROM notices WHERE ref = ?').run(String(ref));
}

// (Not from anyone they've blocked since.)
const FROM_OK = '(from_id IS NULL OR from_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = notices.user_id))';
const seenAt = (userId) => (db.prepare('SELECT notices_seen_at t FROM users WHERE id = ?').get(userId) || { t: 0 }).t;
const unread = (userId) => db.prepare(`SELECT COUNT(*) n FROM notices WHERE user_id = ? AND created_at > ? AND created_at > ? AND ${FROM_OK}`)
  .get(userId, seenAt(userId), Date.now() - KEEP_MS).n;

// Theirs, newest first, and when they last looked (anything after it is new).
function list(userId) {
  const rows = db.prepare(`SELECT * FROM notices WHERE user_id = ? AND created_at > ? AND ${FROM_OK} ORDER BY created_at DESC LIMIT ?`).all(userId, Date.now() - KEEP_MS, SHOWN);
  return {
    seenAt: seenAt(userId),
    notices: rows.map((r) => {
      const from = r.from_id ? people.userById(r.from_id) : null;
      return { id: r.id, kind: r.kind, from: from ? people.publicUser(from) : null, n: r.n, pet: r.pet || undefined, at: r.created_at };
    }),
  };
}

function seen(userId) {
  db.prepare('UPDATE users SET notices_seen_at = ? WHERE id = ?').run(Date.now(), userId);
}

// For a copy of their data (lib/export.js).
function exported(userId) {
  return list(userId).notices.map((n) => ({ kind: n.kind, from: n.from ? `@${n.from.username}` : null, times: n.n, pet: n.pet, at: new Date(n.at).toISOString() }));
}

module.exports = { KEEP_MS, record, petted, forget, list, unread, seen, exported };
