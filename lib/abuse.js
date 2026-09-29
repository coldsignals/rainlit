'use strict';

// Keeping the free tier from being used up by accounts made to fill it (bots, mostly).
//  - A slower start: in its first week, an account can send up to 250 MB of files a day, and so
//    can a flagged one until the admin says it's fine. Real people rarely notice; an account
//    made to fill its 1.5 GB in an hour can't.
//  - Flags for the admin (Admin > Flagged accounts), each with what was noticed: a new account
//    hitting that limit, the same file sent again and again, a lot in files nobody else has ever
//    opened, several accounts made from one place in a day. A flag never suspends anyone by
//    itself: the admin looks, and decides.
//  - A daily count of how much was sent in and out, with a warning when it jumps.

const fs = require('fs');
const crypto = require('crypto');
const { db } = require('./db');
const settings = require('./settings');

const MB = 1024 * 1024;
const DAY = 86_400_000;
const NEW_DAYS = Number(process.env.NEW_ACCOUNT_DAYS) || 7;
const DAILY_MB = Number(process.env.NEW_ACCOUNT_DAILY_MB) || 250;
const REPEATS = 5; // the same file sent this many times
const UNOPENED_MB = 300; // in files (a day old or more) nobody else has opened: 80% or more of theirs
const PLACE_ACCOUNTS = 3; // accounts made from one place within a day

const KINDS = {
  fast: 'Filling up fast',
  repeats: 'The same file, again and again',
  unopened: 'Files nobody else opens',
  place: 'Several accounts from one place',
};

let onFlag = () => {};
const whenFlagged = (fn) => { onFlag = fn; };

const isNew = (user) => Date.now() - user.created_at < NEW_DAYS * DAY;
const flagged = (userId) => Boolean(db.prepare('SELECT 1 FROM flags WHERE user_id = ? AND cleared_at IS NULL').get(userId));
const exempt = (user) => Boolean(user.is_admin) || Boolean(user.supporter_since); // (see lib/supporters.js)
const paced = (user) => !exempt(user) && (isNew(user) || flagged(user.id));
const ago = (t) => {
  const days = Math.floor((Date.now() - t) / DAY);
  return days < 1 ? 'less than a day' : days === 1 ? 'a day' : `${days} days`;
};
const size = (b) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : b >= MB ? `${Math.round(b / MB)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// What someone's sent in the last day (files in conversations, and homepage pictures and songs).
function sentToday(userId) {
  const since = Date.now() - DAY;
  return db.prepare('SELECT COALESCE(SUM(file_size), 0) n FROM messages WHERE author_id = ? AND file_path IS NOT NULL AND created_at > ?').get(userId, since).n
    + db.prepare('SELECT COALESCE(SUM(bytes), 0) n FROM homepage_files WHERE user_id = ? AND created_at > ?').get(userId, since).n;
}

// Whether someone may send `bytes` more today: null, or the words saying why not.
function checkPace(user, bytes) {
  if (!paced(user) || sentToday(user.id) + bytes <= DAILY_MB * MB) return null;
  if (isNew(user)) flag(user.id, 'fast', `Hit the new-account limit of ${DAILY_MB} MB of files a day, ${ago(user.created_at)} after joining.`);
  return isNew(user)
    ? `New accounts can send up to ${DAILY_MB} MB of files a day, for their first week. Try again tomorrow.`
    : `Your account can send up to ${DAILY_MB} MB of files a day for now. Try again tomorrow.`;
}

// Flags someone for the admin to look at. Not twice while one's open, and not again for a month
// once the admin's said it's fine. Returns whether it did.
function flag(userId, kind, detail) {
  const recent = db.prepare('SELECT 1 FROM flags WHERE user_id = ? AND kind = ? AND (cleared_at IS NULL OR cleared_at > ?)')
    .get(userId, kind, Date.now() - 30 * DAY);
  if (recent) return false;
  db.prepare('INSERT INTO flags (user_id, kind, detail, created_at) VALUES (?, ?, ?, ?)').run(userId, kind, detail, Date.now());
  onFlag(userId, kind, detail);
  return true;
}

// A file someone's just sent (still on this disk): its fingerprint kept, to notice the same one
// sent again and again, and a look at how much of theirs nobody else opens.
async function afterUpload(user, messageId, file, bytes) {
  try {
    const hash = await new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
    db.prepare('UPDATE messages SET file_hash = ? WHERE id = ?').run(hash, messageId);
    const n = db.prepare('SELECT COUNT(*) n FROM messages WHERE author_id = ? AND file_hash = ?').get(user.id, hash).n;
    if (n >= REPEATS) flag(user.id, 'repeats', `Sent the same file ${n} times (${size(bytes)} each).`);
  } catch {}
  checkUnopened(user);
}

// Someone other than its sender opened a file (just the first time is kept, not who).
function opened(messageId) {
  db.prepare('UPDATE messages SET opened_at = ? WHERE id = ? AND opened_at IS NULL').run(Date.now(), String(messageId));
}

// A lot in files (a day old or more) that nobody else has opened: storage, not sharing.
function checkUnopened(user) {
  const old = Date.now() - DAY;
  const all = db.prepare('SELECT COALESCE(SUM(file_size), 0) n FROM messages WHERE author_id = ? AND file_path IS NOT NULL AND created_at < ?').get(user.id, old).n;
  if (all < UNOPENED_MB * MB) return;
  const unopened = db.prepare('SELECT COALESCE(SUM(file_size), 0) n FROM messages WHERE author_id = ? AND file_path IS NOT NULL AND created_at < ? AND opened_at IS NULL').get(user.id, old).n;
  if (unopened < UNOPENED_MB * MB || unopened < all * 0.8) return;
  const notes = db.prepare('SELECT COALESCE(SUM(file_size), 0) n FROM messages WHERE author_id = ? AND dm_id = ? AND file_path IS NOT NULL AND created_at < ?').get(user.id, `${user.id}:${user.id}`, old).n;
  const friends = db.prepare("SELECT COUNT(*) n FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'").get(user.id, user.id).n;
  flag(user.id, 'unopened', `${size(unopened)} in files nobody else has opened${notes ? ` (${size(notes)} of it in their Notes)` : ''}. ${friends} friend${friends === 1 ? '' : 's'}; joined ${ago(user.created_at)} ago.`);
}

// Accounts made from one place (told apart by a scrambled address, kept in memory for a day).
// Addresses that can't tell people apart (this computer, a home or office network behind one
// router) don't count.
const places = new Map(); // scrambled address -> [{ id, at }]
const sharedAddress = (ip) => /^(::1|127\.|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:(10|192\.168)\.|f[cd][0-9a-f]{2}:|fe80:)/i.test(String(ip || ''));
function noteSignup(ip, userId) {
  if (!ip || sharedAddress(ip)) return;
  const key = crypto.createHash('sha256').update(`signup:${ip}`).digest('hex').slice(0, 16);
  const since = Date.now() - DAY;
  const list = (places.get(key) || []).filter((s) => s.at > since);
  list.push({ id: userId, at: Date.now() });
  places.set(key, list);
  if (places.size > 20_000) places.clear();
  if (list.length >= PLACE_ACCOUNTS) {
    for (const s of list) flag(s.id, 'place', `One of ${list.length} accounts made from the same place within a day.`);
  }
}

// ---------- For the Admin panel ----------

function openFlags() {
  return db.prepare(`
    SELECT f.*, u.username, u.display_name, u.avatar, u.suspended_at FROM flags f JOIN users u ON u.id = f.user_id
    WHERE f.cleared_at IS NULL ORDER BY f.created_at DESC LIMIT 200
  `).all().map((f) => ({
    id: f.id, kind: f.kind, label: KINDS[f.kind] || f.kind, detail: f.detail, at: f.created_at,
    user: { id: f.user_id, username: f.username, displayName: f.display_name, avatar: f.avatar ? `/avatars/${f.avatar}` : null, suspended: Boolean(f.suspended_at) },
  }));
}
const openCount = () => db.prepare('SELECT COUNT(*) n FROM flags WHERE cleared_at IS NULL').get().n;

// The admin's looked, and it's fine (or dealt with): cleared, and the account's pace is back to
// normal if it has no other flags (and isn't new).
function clear(flagId, byId) {
  return db.prepare('UPDATE flags SET cleared_at = ?, cleared_by = ? WHERE id = ? AND cleared_at IS NULL').run(Date.now(), byId, Number(flagId)).changes > 0;
}

// ---------- How much goes in and out, a day ----------

const today = () => new Date().toISOString().slice(0, 10);
let counts = { day: today(), in: 0, out: 0 };
function load(day) {
  try {
    return { day, ...JSON.parse(settings.get(`usage:${day}`, '{"in":0,"out":0}')) };
  } catch {
    return { day, in: 0, out: 0 };
  }
}
counts = load(today());
function save() {
  settings.set(`usage:${counts.day}`, JSON.stringify({ in: counts.in, out: counts.out }));
}
function roll() {
  if (counts.day === today()) return;
  save();
  counts = load(today());
}
const noteIn = (bytes) => { roll(); counts.in += Number(bytes) || 0; };
const noteOut = (bytes) => { roll(); counts.out += Number(bytes) || 0; };
setInterval(() => { roll(); save(); }, 60_000).unref();

// The last 8 days (today's so far first), and whether today's sending is well above the week's usual.
function usage() {
  roll();
  const days = [];
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    days.push(i === 0 ? { ...counts } : load(day));
  }
  const week = days.slice(1);
  const usual = week.reduce((s, d) => s + d.out, 0) / week.length;
  return { days, jump: days[0].out > 1024 * MB && days[0].out > usual * 3 };
}

module.exports = {
  DAILY_MB, NEW_DAYS, KINDS, whenFlagged, paced, checkPace, flag, afterUpload, opened, checkUnopened, noteSignup,
  openFlags, openCount, clear, noteIn, noteOut, usage,
};
