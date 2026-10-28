'use strict';

// What's new: what Rainlit's got lately (public/whats-new.json, written with each update, the
// newest first). The newest is shown once to each person, the first time they open Rainlit after
// it's out, on whichever of their devices that is (public/app.js: maybeWhatsNew). Someone who
// makes an account afterwards isn't shown what came before.
//   A new one goes at the top of public/whats-new.json: its id the day it's out ("2026-10-28",
// with a letter after for a second one that day: "2026-10-28b"), a title, and its things, each
// a title, a few words, maybe glow: true, and a picture or a clip in public/whats-new/ (WebP, or
// a short MP4 with no sound; about 560 pixels wide, as small as they'll go).

const fs = require('fs');
const path = require('path');
const { db } = require('./db');

let entries = [];
try {
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'whats-new.json'), 'utf8')).entries;
  if (Array.isArray(list)) entries = list.filter((e) => e && typeof e.id === 'string');
} catch {}

const newest = () => (entries[0] && entries[0].id) || '';

// The newest one someone's seen ('': none).
const seenBy = (user) => (user && user.whatsnew_seen) || '';

// Seen, up to that one (ids sort as dates do, "2026-10-28").
function markSeen(userId, id) {
  const v = String(id || '');
  if (!entries.some((e) => e.id === v)) return;
  db.prepare('UPDATE users SET whatsnew_seen = ? WHERE id = ? AND whatsnew_seen < ?').run(v, String(userId), v);
}

// A new account: what's new already isn't news to it.
function skipOld(userId) {
  db.prepare('UPDATE users SET whatsnew_seen = ? WHERE id = ?').run(newest(), String(userId));
}

module.exports = { newest, seenBy, markSeen, skipOld };
