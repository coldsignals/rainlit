'use strict';

// How much room files get, which the admin sets in Admin:
//   - the biggest file anyone can send (25 MB to start with; Discord's free limit is 10 MB);
//   - how much each person's files can add up to (1.5 GB to start with): everything they've
//     sent, in conversations, spaces and their notes, that's still there. It's not per month:
//     deleting files makes room straight away. (Their homepage has its own, in lib/homepages.js.)
//     The admin can give someone more, or less;
//   - and the disk itself is never let fill up: uploads stop while it's nearly full, so there's
//     always room for messages, and Admin says so.

const fs = require('fs');
const { db, DATA_DIR } = require('./db');
const settings = require('./settings');

const MB = 1024 * 1024;
const START_FILE_MB = Number(process.env.MAX_FILE_MB) || 25;
const START_PERSON_MB = Number(process.env.STORAGE_MB) || 1536;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));

const fileMb = () => Number(settings.get('fileMb', START_FILE_MB)) || START_FILE_MB;
const personMb = () => Number(settings.get('personMb', START_PERSON_MB)) || START_PERSON_MB;

function configure({ fileMb: f, personMb: p } = {}) {
  if (f != null && Number.isFinite(Number(f)) && Number(f) > 0) settings.set('fileMb', clamp(Number(f), 1, 4096));
  if (p != null && Number.isFinite(Number(p)) && Number(p) > 0) settings.set('personMb', clamp(Number(p), 1, 1024 * 1024));
}

// ---------- Each person's ----------

function used(userId) {
  return db.prepare('SELECT COALESCE(SUM(file_size), 0) n FROM messages WHERE author_id = ? AND file_path IS NOT NULL').get(userId).n;
}

// { used, limit } in bytes, and whether the admin set theirs.
function of(user) {
  const custom = user.storage_mb != null;
  return { used: used(user.id), limit: (custom ? user.storage_mb : personMb()) * MB, custom };
}

// Everyone's at once (for Admin's list of accounts): id -> bytes.
function usedByEveryone() {
  const rows = db.prepare('SELECT author_id id, SUM(file_size) n FROM messages WHERE file_path IS NOT NULL GROUP BY author_id').all();
  return new Map(rows.map((r) => [r.id, r.n]));
}

// The admin gives someone their own amount, in MB (or null: what everyone gets).
function setPersonal(userId, mb) {
  const value = mb == null || mb === '' ? null : clamp(Number(mb), 1, 1024 * 1024);
  if (value !== null && !Number.isFinite(value)) return;
  db.prepare('UPDATE users SET storage_mb = ? WHERE id = ?').run(value, userId);
}

// ---------- The disk ----------

// { total, free } in bytes, or null if it can't be told (then nothing's stopped).
function disk() {
  try {
    const s = fs.statfsSync(DATA_DIR);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

// What's kept free, always: a tenth of the disk, up to 1 GB.
const reserveOf = (total) => Math.min(1024 * MB, Math.floor(total / 10));

function diskHasRoom(bytes) {
  const d = disk();
  return !d || d.free - bytes > reserveOf(d.total);
}

// For Admin: the settings, what everyone's files take up, and the disk.
function overview() {
  const files = db.prepare('SELECT COALESCE(SUM(file_size), 0) n FROM messages WHERE file_path IS NOT NULL').get().n;
  const d = disk();
  return {
    fileMb: fileMb(), personMb: personMb(), files,
    disk: d ? { ...d, reserve: reserveOf(d.total), full: d.free <= reserveOf(d.total) } : null,
  };
}

// "1.5 GB", "320 MB", "900 KB".
function size(bytes) {
  if (bytes >= 1024 * MB) return `${+(bytes / 1024 / MB).toFixed(bytes >= 10 * 1024 * MB ? 0 : 1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

module.exports = { MB, fileMb, personMb, configure, used, of, usedByEveryone, setPersonal, disk, diskHasRoom, overview, size };
