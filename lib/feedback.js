'use strict';

// Feedback (Settings > Feedback): a bug, an idea or anything else, from someone straight to
// whoever runs this Rainlit (Admin > Feedback). A bug can bring diagnostics, if they tick the box:
// which app and browser, the screen, their Rainlit settings and Rainlit's own recent errors (never
// messages). The admin can reply, which the sender sees under what they sent, and mark it done.
// It goes with the sender's account; once it's been dealt with, it's deleted after a year. A
// screenshot can go with it too (one, kept with it, gone with it: setImage).

const { db } = require('./db');

const KINDS = ['bug', 'idea', 'other'];
const TEXT_MAX = 2000;
const REPLY_MAX = 1000;
const DETAILS_MAX = 12_000; // (characters of JSON)
const PER_DAY = 10;
const KEEP_DONE = 365 * 86_400_000;

class FeedbackError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const HAS_IMAGE = 'EXISTS(SELECT 1 FROM feedback_images i WHERE i.feedback_id = f.id) AS has_image';
const rowOf = (id) => db.prepare(`SELECT f.*, ${HAS_IMAGE} FROM feedback f WHERE f.id = ?`).get(Number(id)) || null;
function found(id) {
  const r = rowOf(id);
  if (!r) throw new FeedbackError("That feedback isn't there any more.", 404);
  return r;
}

// What the sender sees of it.
const mineJson = (r) => ({
  id: r.id, kind: r.kind, text: r.text, at: r.created_at, diagnostics: Boolean(r.details), image: Boolean(r.has_image),
  done: Boolean(r.done_at), reply: r.reply || null, repliedAt: r.replied_at || null,
});

function send(userId, { kind, text, diagnostics } = {}) {
  if (!KINDS.includes(kind)) throw new FeedbackError('Pick a bug, an idea or something else.');
  const t = clean(text, TEXT_MAX);
  if (!t) throw new FeedbackError("Say what it's about.");
  const today = db.prepare('SELECT COUNT(*) n FROM feedback WHERE user_id = ? AND created_at > ?').get(String(userId), Date.now() - 86_400_000).n;
  if (today >= PER_DAY) throw new FeedbackError("That's a lot of feedback for one day: thank you! Any more can wait for tomorrow.", 429);
  // (Diagnostics: only with a bug, and only an object of what the app gathered.)
  let details = null;
  if (kind === 'bug' && diagnostics && typeof diagnostics === 'object' && !Array.isArray(diagnostics)) {
    details = JSON.stringify(diagnostics);
    if (details.length > DETAILS_MAX) throw new FeedbackError('Those diagnostics are too big to send. Try without them.', 413);
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO feedback (user_id, kind, text, details, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(String(userId), kind, t, details, Date.now());
  return mineJson(rowOf(lastInsertRowid));
}

// What someone's sent, the newest first, with any reply.
function mine(userId) {
  return db.prepare(`SELECT f.*, ${HAS_IMAGE} FROM feedback f WHERE f.user_id = ? ORDER BY f.id DESC LIMIT 50`).all(String(userId)).map(mineJson);
}

// Everything sent, the newest first and what's done last, with who sent it (Admin > Feedback).
// Looking marks what's new as seen (`isNew` says which it was).
function all() {
  const rows = db.prepare(`
    SELECT f.*, ${HAS_IMAGE}, u.username, u.display_name, u.avatar FROM feedback f JOIN users u ON u.id = f.user_id
    ORDER BY (f.done_at IS NOT NULL), f.id DESC LIMIT 300
  `).all();
  db.prepare('UPDATE feedback SET seen_at = ? WHERE seen_at IS NULL').run(Date.now());
  return rows.map((r) => {
    let details = null;
    try {
      details = r.details ? JSON.parse(r.details) : null;
    } catch {}
    return {
      ...mineJson(r), details, isNew: !r.seen_at, doneAt: r.done_at || null, credited: Boolean(r.credited_at),
      user: { id: r.user_id, username: r.username, displayName: r.display_name, avatar: r.avatar ? `/avatars/${r.avatar}` : null },
    };
  });
}

const unseenCount = () => db.prepare('SELECT COUNT(*) n FROM feedback WHERE seen_at IS NULL').get().n;

// Done (or not after all). Returns what the sender sees of it, and who they are.
function setDone(id, done) {
  const r = found(id);
  db.prepare('UPDATE feedback SET done_at = ? WHERE id = ?').run(done ? r.done_at || Date.now() : null, r.id);
  return { item: mineJson(rowOf(r.id)), userId: r.user_id };
}

// A reply the sender sees under what they sent ('' takes it back).
function reply(id, text, byId) {
  const r = found(id);
  const t = clean(text, REPLY_MAX);
  db.prepare('UPDATE feedback SET reply = ?, replied_at = ?, replied_by = ? WHERE id = ?')
    .run(t || null, t ? Date.now() : null, t ? String(byId) : null, r.id);
  return { item: mineJson(rowOf(r.id)), userId: r.user_id };
}

// A bug report thanked with the Bug Finder badge (lib/badges.js), once: who sent it.
function credit(id) {
  const r = found(id);
  if (r.kind !== 'bug') throw new FeedbackError("That isn't a bug report.");
  if (r.credited_at) throw new FeedbackError('That bug report has been thanked with the badge already.', 409);
  db.prepare('UPDATE feedback SET credited_at = ? WHERE id = ?').run(Date.now(), r.id);
  return r.user_id;
}

// Its screenshot (made small and plain: lib/images.js screenshot), by who sent it, just after (in
// the ten minutes after), and only one.
const IMAGE_WITHIN = 10 * 60_000;
function setImage(id, userId, shot) {
  const r = found(id);
  if (r.user_id !== String(userId)) throw new FeedbackError("That feedback isn't there any more.", 404);
  if (Date.now() - r.created_at > IMAGE_WITHIN) throw new FeedbackError("It's too late to add a screenshot to that: send it again with one.", 409);
  if (r.has_image) throw new FeedbackError('That has a screenshot already.', 409);
  db.prepare('INSERT INTO feedback_images (feedback_id, data, width, height) VALUES (?, ?, ?, ?)').run(r.id, shot.data, shot.width, shot.height);
  return mineJson(rowOf(r.id));
}
// It, for whoever sent it or an admin (null: none, or not theirs to see).
function image(id, userId, admin) {
  const r = rowOf(id);
  if (!r || (!admin && r.user_id !== String(userId))) return null;
  return db.prepare('SELECT data FROM feedback_images WHERE feedback_id = ?').get(r.id) || null;
}

function remove(id) {
  return db.prepare('DELETE FROM feedback WHERE id = ?').run(Number(id)).changes > 0;
}

// Dealt with over a year ago: gone.
function sweep() {
  db.prepare('DELETE FROM feedback WHERE done_at IS NOT NULL AND done_at < ?').run(Date.now() - KEEP_DONE);
}
sweep();
setInterval(sweep, 86_400_000).unref();

// They've looked at what they've sent (and its replies): none unseen now.
function seen(userId) {
  db.prepare('UPDATE users SET feedback_seen_at = ? WHERE id = ?').run(Date.now(), userId);
}

module.exports = { seen, KINDS, TEXT_MAX, REPLY_MAX, PER_DAY, FeedbackError, send, mine, all, unseenCount, setDone, reply, credit, remove, setImage, image };
