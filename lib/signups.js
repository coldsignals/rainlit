'use strict';

// Signing up without an invite ("open sign-ups", which the admin turns on in Admin), and what
// keeps that from sinking the server or filling it with bots:
//   - a daily cap on new accounts made without an invite; past it, people join a waitlist,
//     and get an invite by email (lib/mail.js) as room opens up each day;
//   - a bot check: the browser proves it did a little work (a second or two, unseen) before the
//     server takes a sign-up, which makes making accounts by the thousand slow and costly;
//   - no throwaway email addresses (disposable-domains.txt);
//   - a few sign-ups a day from any one visitor;
//   - an account made this way confirms its email before it can add friends or join spaces.
// An invite from someone always works, whatever the cap.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');
const settings = require('./settings');

const DEFAULT_CAP = 10;
const PROOF_MAX = 120_000; // (the bot check: how many tries, at most, it can take)
const PROOF_MINUTES = 15;

// ---------- The admin's settings ----------

const isOpen = () => settings.get('openSignups', 'off') === 'on';
const dailyCap = () => Math.max(0, Number(settings.get('dailyCap', DEFAULT_CAP)) || 0);

function configure({ open, cap } = {}) {
  if (typeof open === 'boolean') settings.set('openSignups', open ? 'on' : 'off');
  if (cap !== undefined && Number.isFinite(Number(cap))) settings.set('dailyCap', Math.max(0, Math.min(100_000, Math.round(Number(cap)))));
}

// How many more can sign up without an invite today (the last 24 hours): the cap, less those who
// did, and less those the waitlist invited (signed up with it yet or not).
function roomToday() {
  const since = Date.now() - 86_400_000;
  const joined = db.prepare('SELECT COUNT(*) n FROM users WHERE open_signup = 1 AND created_at > ?').get(since).n;
  const invited = db.prepare('SELECT COUNT(*) n FROM waitlist WHERE invited_at > ?').get(since).n;
  return Math.max(0, dailyCap() - joined - invited);
}

// ---------- Throwaway addresses ----------

const DISPOSABLE = new Set(fs.readFileSync(path.join(__dirname, 'disposable-domains.txt'), 'utf8')
  .split('\n').map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')));

// An address at a throwaway domain (or any part of one: x.mailinator.com too).
function throwaway(email) {
  const parts = String(email || '').toLowerCase().split('@').pop().split('.');
  for (let i = 0; i < parts.length - 1; i++) if (DISPOSABLE.has(parts.slice(i).join('.'))) return true;
  return false;
}

// ---------- The bot check ----------
// The server picks a number and gives the browser a salt and the hash of salt + number, signed;
// the browser finds the number by trying them all (the work), and the server checks it, once.

const KEY_FILE = path.join(DATA_DIR, 'signup-key');
let key;
try {
  key = fs.readFileSync(KEY_FILE);
  if (key.length < 32) throw new Error('too short');
} catch {
  key = crypto.randomBytes(32);
  try { fs.writeFileSync(KEY_FILE, key, { mode: 0o600 }); } catch {}
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sign = (s) => crypto.createHmac('sha256', key).update(s).digest('hex');

function challenge() {
  const salt = `${crypto.randomBytes(12).toString('hex')}.${Date.now() + PROOF_MINUTES * 60_000}`;
  const hash = sha(salt + crypto.randomInt(0, PROOF_MAX));
  return { salt, hash, max: PROOF_MAX, sig: sign(hash) };
}

const usedProofs = new Map(); // hash -> when it stops mattering
function checkProof(p) {
  if (!p || typeof p !== 'object') return false;
  const salt = String(p.salt || '');
  const hash = String(p.hash || '');
  const expires = Number(salt.split('.')[1]);
  const sig = String(p.sig || '');
  if (!/^[a-f0-9]{64}$/.test(hash) || sig.length !== 64 || !(expires > Date.now())) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(hash)))) return false;
  if (sha(salt + Number(p.number)) !== hash || usedProofs.has(hash)) return false;
  usedProofs.set(hash, expires);
  for (const [h, until] of usedProofs) if (until < Date.now()) usedProofs.delete(h);
  return true;
}

// ---------- The waitlist ----------

const waiting = () => db.prepare('SELECT COUNT(*) n FROM waitlist WHERE invited_at IS NULL').get().n;

// Returns false if they're already on it.
function join(email) {
  const r = db.prepare('INSERT OR IGNORE INTO waitlist (email, created_at) VALUES (?, ?)').run(email, Date.now());
  return r.changes > 0;
}

// Invites the next few on the waitlist (oldest first): up to `count`, or as many as there's room
// for today. `send(email, code)` emails each their invite. Returns how many were invited.
function release(count, send) {
  const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at LIMIT 1').get();
  if (!admin) return 0;
  const people = require('./people');
  const next = db.prepare('SELECT email FROM waitlist WHERE invited_at IS NULL ORDER BY created_at LIMIT ?').all(Math.max(0, count));
  for (const { email } of next) {
    const code = people.createInvite(admin.id);
    db.prepare('UPDATE waitlist SET invited_at = ?, code = ? WHERE email = ?').run(Date.now(), code, email);
    send(email, code);
  }
  return next.length;
}

// Someone the waitlist invited is only kept on it for 30 days after (privacy.html).
function tidy() {
  db.prepare('DELETE FROM waitlist WHERE invited_at < ?').run(Date.now() - 30 * 86_400_000);
}

module.exports = { isOpen, dailyCap, configure, roomToday, throwaway, challenge, checkProof, waiting, join, release, tidy };
