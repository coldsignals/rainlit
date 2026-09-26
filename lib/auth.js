'use strict';

// Passwords, sign-in sessions and the cookie that carries them.

const crypto = require('crypto');
const { promisify } = require('util');
const { db } = require('./db');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

const COOKIE = 'pl_session';
const SESSION_DAYS = 365;

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// ---------- Passwords ----------

// Stored as "scrypt$N$r$p$salt$hash", so the settings can be raised later without breaking old passwords.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function checkPassword(password, stored) {
  const [kind, N, r, p, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, actual);
}

// ---------- Sessions ----------

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, now, now);
  return token;
}

const getSession = db.prepare(`
  SELECT s.token_hash, s.last_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.created_at > ?
`);
const touchSession = db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?');

// The signed-in user for a session token, or null.
function userForToken(token) {
  if (!token) return null;
  const row = getSession.get(sha256(token), Date.now() - SESSION_DAYS * 86_400_000);
  if (!row) return null;
  // Remember when each device was last used, but don't write on every request.
  if (Date.now() - row.last_seen > 3600_000) touchSession.run(Date.now(), row.token_hash);
  delete row.token_hash;
  delete row.last_seen;
  return row;
}

function endSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

function endOtherSessions(userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(keepToken || ''));
}

// ---------- Cookies ----------

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function tokenFrom(req) {
  return parseCookies(req.headers.cookie)[COOKIE] || '';
}

function setSessionCookie(req, res, token) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`);
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// True if the request came from one of this site's own pages. Browsers always say
// where a WebSocket or a POST/PATCH/DELETE comes from, and the sign-in cookie is sent
// along automatically, so anything from another site (or that won't say) is refused.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// ---------- Too many tries ----------

// Slows down password guessing: after `max` failures for the same key within
// the window, further tries are refused until the window passes.
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  }, windowMs).unref();
  return {
    blocked(key) {
      const h = hits.get(key);
      return Boolean(h && h.count >= max && h.until > Date.now());
    },
    fail(key) {
      const h = hits.get(key);
      if (h && h.until > Date.now()) h.count++;
      else hits.set(key, { count: 1, until: Date.now() + windowMs });
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

module.exports = {
  newId, sha256, hashPassword, checkPassword,
  createSession, userForToken, endSession, endOtherSessions,
  tokenFrom, setSessionCookie, clearSessionCookie, sameOrigin, limiter,
};
