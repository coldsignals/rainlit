'use strict';

// The database: one SQLite file in the data folder. On Render the data folder is
// the attached disk, so everything in it survives restarts and deploys.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'porchlight.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Each step upgrades the database by one version, in order. Once a step has gone
// live, never change it: add a new one at the end instead.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    status_text   TEXT NOT NULL DEFAULT '',
    presence      TEXT NOT NULL DEFAULT 'auto', -- what they picked: auto | away | invisible
    avatar        TEXT,                         -- file name in the avatars folder
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  -- Signed-in devices. Only a hash of each token is kept, so a copy of the
  -- database can't be used to sign in as anyone.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE invites (
    code       TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    used_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_at    INTEGER
  );

  -- One row per pair of people, stored with user_a < user_b so each pair has exactly one row.
  CREATE TABLE friendships (
    user_a       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL,
    status       TEXT NOT NULL, -- pending | accepted
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (user_a, user_b)
  );
  CREATE INDEX friendships_b ON friendships(user_b);

  -- One-time links for setting a new password. For now the admin makes them;
  -- later they can be emailed.
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
  );
  `,
  `
  -- A conversation between two people. Its id is their two user ids, sorted, joined by ":".
  CREATE TABLE dms (
    id         TEXT PRIMARY KEY,
    user_a     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    save       INTEGER NOT NULL DEFAULT 1, -- keep new messages and files?
    created_at INTEGER NOT NULL
  );

  -- In the order they were sent (rowid), which is also how pages of history are fetched.
  CREATE TABLE messages (
    id         TEXT PRIMARY KEY,
    dm_id      TEXT NOT NULL REFERENCES dms(id) ON DELETE CASCADE,
    author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL, -- text | file | call | saving | removed
    text       TEXT NOT NULL DEFAULT '',
    file_name  TEXT,
    file_size  INTEGER,
    file_type  TEXT,
    file_path  TEXT, -- file name in the files folder
    meta       TEXT, -- JSON: call length, saving on/off, what was removed
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_dm ON messages(dm_id);

  -- How far each person has read in each conversation.
  CREATE TABLE dm_reads (
    dm_id   TEXT NOT NULL REFERENCES dms(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (dm_id, user_id)
  );
  `,
  // 3: where to send push notifications, for each phone (see lib/push.js).
  `
  CREATE TABLE push_subs (
    endpoint   TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX push_subs_user ON push_subs(user_id);
  `,
  // 4: editing messages.
  `
  ALTER TABLE messages ADD COLUMN edited_at INTEGER;
  `,
  // 5: emoji reactions on messages.
  `
  CREATE TABLE reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );
  CREATE INDEX reactions_user ON reactions(user_id);
  `,
];

const { user_version: current } = db.prepare('PRAGMA user_version').get();
for (let v = current; v < MIGRATIONS.length; v++) {
  db.exec('BEGIN');
  try {
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Runs fn inside a transaction: all of it happens, or none of it does.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, transaction, DATA_DIR, AVATAR_DIR };
