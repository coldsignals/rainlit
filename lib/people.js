'use strict';

// Accounts, profiles, friendships and invite codes.

const crypto = require('crypto');
const { db } = require('./db');
const { badgesOf } = require('./badges');
const { statusOf } = require('./supporters');
const { themeOf } = require('./themes');
const { cardOf } = require('./cards');

const USERNAME_RE = /^[a-z0-9_.]{2,32}$/;
// (The domain's parts can't have dots in them, so checking a long made-up address takes no longer
// than reading it: a looser pattern could be made to stall the server, given one.)
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const STATUS_MAX = 120;
const NAME_MAX = 32;

// Letters and digits that can't be mistaken for each other when read aloud or typed (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode() {
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

// "abcd efgh-ijkl" -> "ABCD-EFGH-IJKL", so codes can be typed however.
function normalizeCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : '';
}

// Removes control characters (and line breaks) so names and statuses stay on one line.
function oneLine(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------- Profiles ----------

// What your friends see about you (and your card: lib/cards.js; null, so a card made plain again
// goes, wherever you were known).
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    statusText: u.status_text,
    avatar: u.avatar ? `/avatars/${u.avatar}` : null,
    badges: badgesOf(u),
    card: cardOf(u),
  };
}

// What you see about yourself.
function selfUser(u) {
  return {
    ...publicUser(u), email: u.email, emailConfirmed: Boolean(u.email_confirmed_at), presence: u.presence, isAdmin: Boolean(u.is_admin),
    adult: Boolean(u.adult_at), // (said they're 18 or older: see 18+ channels in lib/spaces.js)
    adultFrom: u.adult_from && u.adult_from > Date.now() ? u.adult_from : null, // (under 18 when they signed up: when they turn 18)
    supporter: statusOf(u), // (supporting Rainlit: lib/supporters.js)
    theme: themeOf(u), // (Settings > Theme: lib/themes.js)
  };
}

// Someone saying they're 18 or older, to open a channel marked 18+ (asked once, then kept). Not
// before the day they turn 18, if the birthday they signed up with says they're younger. Returns
// whether they can.
function confirmAdult(userId) {
  const now = Date.now();
  return db.prepare('UPDATE users SET adult_at = COALESCE(adult_at, ?) WHERE id = ? AND (adult_from IS NULL OR adult_from <= ?)')
    .run(now, String(userId), now).changes > 0;
}

// A birthday from the sign-up form ("2008-05-17"): { age, eighteenAt } (null: not a real date).
function birthdayAge(text, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const born = new Date(Date.UTC(y, mo, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo || born.getUTCDate() !== d) return null; // (like February 30th)
  if (y < 1900 || born > now) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < mo || (now.getUTCMonth() === mo && now.getUTCDate() < d)) age--;
  return { age, eighteenAt: Date.UTC(y + 18, mo, d) };
}

const byId = db.prepare('SELECT * FROM users WHERE id = ?');
const byUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const byLogin = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?');

function userById(id) {
  return byId.get(String(id)) || null;
}

function userByUsername(name) {
  return byUsername.get(String(name).toLowerCase().replace(/^@/, '')) || null;
}

function userByLogin(login) {
  const s = String(login).trim().toLowerCase().replace(/^@/, '');
  return byLogin.get(s, s) || null;
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// ---------- Friendships ----------

const pairOf = (x, y) => (x < y ? [x, y] : [y, x]);

function friendship(x, y) {
  const [a, b] = pairOf(x, y);
  return db.prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(a, b) || null;
}

function areFriends(x, y) {
  const f = friendship(x, y);
  return Boolean(f && f.status === 'accepted');
}

function requestFriend(from, to) {
  const [a, b] = pairOf(from, to);
  db.prepare('INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(a, b, from, 'pending', Date.now());
}

function acceptFriend(x, y) {
  const [a, b] = pairOf(x, y);
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?").run(a, b);
}

function removeFriendship(x, y) {
  const [a, b] = pairOf(x, y);
  db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
}

// Everyone you're connected to, with how: friends, requests you got, requests you sent.
function connectionsOf(userId) {
  const rows = db.prepare(`
    SELECT f.status, f.requested_by, f.created_at AS since, u.*
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
    WHERE f.user_a = ? OR f.user_b = ?
    ORDER BY u.display_name COLLATE NOCASE
  `).all(userId, userId, userId);
  return rows.map((r) => ({
    user: r,
    kind: r.status === 'accepted' ? 'friend' : r.requested_by === userId ? 'outgoing' : 'incoming',
    since: r.since,
  }));
}

function friendIdsOf(userId) {
  return db.prepare(`
    SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id
    FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'
  `).all(userId, userId, userId).map((r) => r.id);
}

// ---------- Invites ----------

function createInvite(createdBy) {
  const code = makeCode();
  db.prepare('INSERT INTO invites (code, created_by, created_at) VALUES (?, ?, ?)').run(code, createdBy, Date.now());
  return code;
}

function listInvites() {
  return db.prepare(`
    SELECT i.code, i.created_at AS createdAt, i.used_at AS usedAt, u.username AS usedBy
    FROM invites i LEFT JOIN users u ON u.id = i.used_by
    ORDER BY i.created_at DESC
  `).all();
}

module.exports = {
  USERNAME_RE, EMAIL_RE, STATUS_MAX, NAME_MAX,
  makeCode, normalizeCode, oneLine, publicUser, selfUser, confirmAdult, birthdayAge,
  userById, userByUsername, userByLogin, countUsers,
  friendship, areFriends, requestFriend, acceptFriend, removeFriendship, connectionsOf, friendIdsOf,
  createInvite, listInvites,
};
