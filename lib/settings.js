'use strict';

// The admin's settings, kept in the database: open sign-ups (lib/signups.js), and how much room
// files get (lib/storage.js).

const { db } = require('./db');

function get(key, dflt) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : dflt;
}

function set(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

module.exports = { get, set };
