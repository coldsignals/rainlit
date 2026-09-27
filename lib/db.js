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
  // 6: replying to a message.
  `
  ALTER TABLE messages ADD COLUMN reply_to TEXT;
  `,
  // 7: messages (and who's read up to where) can belong to a space's channel too, not only a
  // DM. SQLite can't loosen a link on a table in place, so these two are copied into new
  // ones without it, keeping every message's position (its rowid, which the apps page by).
  // A DM that goes (with an account) still takes its messages along, now by trigger.
  {
    foreignKeysOff: true,
    sql: `
  CREATE TABLE messages_new (
    id         TEXT PRIMARY KEY,
    dm_id      TEXT NOT NULL, -- the conversation: a DM ("alice:bea") or a channel
    author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL, -- text | file | gif | call | saving | removed
    text       TEXT NOT NULL DEFAULT '',
    file_name  TEXT,
    file_size  INTEGER,
    file_type  TEXT,
    file_path  TEXT,
    meta       TEXT,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER,
    reply_to   TEXT
  );
  INSERT INTO messages_new (rowid, id, dm_id, author_id, kind, text, file_name, file_size, file_type, file_path, meta, created_at, edited_at, reply_to)
    SELECT rowid, id, dm_id, author_id, kind, text, file_name, file_size, file_type, file_path, meta, created_at, edited_at, reply_to FROM messages;
  DROP TABLE messages;
  ALTER TABLE messages_new RENAME TO messages;
  CREATE INDEX messages_dm ON messages(dm_id);

  CREATE TABLE dm_reads_new (
    dm_id   TEXT NOT NULL, -- a DM or a channel
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (dm_id, user_id)
  );
  INSERT INTO dm_reads_new (dm_id, user_id, read_at) SELECT dm_id, user_id, read_at FROM dm_reads;
  DROP TABLE dm_reads;
  ALTER TABLE dm_reads_new RENAME TO dm_reads;

  CREATE TRIGGER dm_gone AFTER DELETE ON dms BEGIN
    DELETE FROM messages WHERE dm_id = OLD.id;
    DELETE FROM dm_reads WHERE dm_id = OLD.id;
  END;
  `,
  },
  // 8: spaces: places for more than two people, with channels, members and invite links.
  `
  CREATE TABLE spaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE space_members (
    space_id  TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member', -- owner | admin | member
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (space_id, user_id)
  );
  CREATE INDEX space_members_user ON space_members(user_id);
  CREATE TABLE channels (
    id         TEXT PRIMARY KEY,
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'text', -- (voice ones come later)
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX channels_space ON channels(space_id);
  CREATE TABLE space_invites (
    code       TEXT PRIMARY KEY,
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    uses       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX space_invites_space ON space_invites(space_id);
  -- A channel that goes (or its whole space) takes its messages along.
  CREATE TRIGGER channel_gone AFTER DELETE ON channels BEGIN
    DELETE FROM messages WHERE dm_id = OLD.id;
    DELETE FROM dm_reads WHERE dm_id = OLD.id;
  END;
  `,
  `
  -- Badges on people's profiles.
  CREATE TABLE user_badges (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge    TEXT NOT NULL,
    given_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, badge)
  );
  -- Everyone here so far joined during the alpha.
  INSERT INTO user_badges (user_id, badge, given_at) SELECT id, 'alpha', created_at FROM users;
  `,
  `
  -- Roles in spaces, like Discord's: a name, a color, what the role allows (bits, see
  -- lib/spaces.js) and a place in the order (higher is more senior). What everyone in a
  -- space may do is kept on the space: invite, send, send files, react.
  ALTER TABLE spaces ADD COLUMN everyone_perms INTEGER NOT NULL DEFAULT 240;
  CREATE TABLE space_roles (
    id         TEXT PRIMARY KEY,
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT,                       -- #rrggbb, or none
    perms      INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL,
    hoist      INTEGER NOT NULL DEFAULT 0, -- shown as its own group in the members list
    created_at INTEGER NOT NULL
  );
  CREATE INDEX space_roles_space ON space_roles(space_id);
  CREATE TABLE member_roles (
    space_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    role_id  TEXT NOT NULL REFERENCES space_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (space_id, user_id, role_id),
    FOREIGN KEY (space_id, user_id) REFERENCES space_members(space_id, user_id) ON DELETE CASCADE
  );
  CREATE INDEX member_roles_role ON member_roles(role_id);

  -- A private channel is seen only by the roles it's open to; in a read-only one, only
  -- some roles post. (The owner and administrators always can.)
  ALTER TABLE channels ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE channels ADD COLUMN readonly INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE channel_roles (
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role_id    TEXT NOT NULL REFERENCES space_roles(id) ON DELETE CASCADE,
    can        TEXT NOT NULL, -- see | send
    PRIMARY KEY (channel_id, role_id, can)
  );

  -- Admins from before roles become an Admin role (with every permission) in their space.
  INSERT INTO space_roles (id, space_id, name, color, perms, position, hoist, created_at)
    SELECT lower(hex(randomblob(12))), space_id, 'Admin', '#f5b94a', 1, 1, 1, MIN(joined_at)
    FROM space_members WHERE role = 'admin' GROUP BY space_id;
  INSERT INTO member_roles (space_id, user_id, role_id)
    SELECT m.space_id, m.user_id, r.id FROM space_members m
    JOIN space_roles r ON r.space_id = m.space_id AND r.name = 'Admin'
    WHERE m.role = 'admin';
  UPDATE space_members SET role = 'member' WHERE role = 'admin';
  `,
];

const { user_version: current } = db.prepare('PRAGMA user_version').get();

// Before an update changes anything, a copy of the database as it was goes in the backups
// folder, in case the update goes wrong. The newest three are kept.
if (current > 0 && current < MIGRATIONS.length) {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `porchlight-v${current}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copies = fs.readdirSync(dir).filter((f) => /^porchlight-v\d+-.+\.db$/.test(f));
  copies.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  for (const old of copies.slice(3)) fs.rmSync(path.join(dir, old), { force: true });
}

for (let v = current; v < MIGRATIONS.length; v++) {
  const step = typeof MIGRATIONS[v] === 'string' ? { sql: MIGRATIONS[v] } : MIGRATIONS[v];
  // Rebuilding a table needs links unchecked for a moment (and they can only be switched off
  // outside a transaction). They're all checked again before it's kept.
  if (step.foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(step.sql);
    if (step.foreignKeysOff) {
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length) throw new Error(`Database update ${v + 1} would leave ${broken.length} broken links; nothing was changed.`);
    }
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    if (step.foreignKeysOff) db.exec('PRAGMA foreign_keys = ON');
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
