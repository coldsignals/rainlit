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
  `
  -- Moderation. Someone in a timeout can read but not post or react until it ends.
  ALTER TABLE space_members ADD COLUMN timeout_until INTEGER;
  -- Banned people can't come back, even with an invite link.
  CREATE TABLE space_bans (
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    by_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    reason     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (space_id, user_id)
  );
  -- What's been done in each space, and by whom (its newest 1000 things).
  CREATE TABLE space_log (
    id         INTEGER PRIMARY KEY,
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    target_id  TEXT,
    details    TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX space_log_space ON space_log(space_id, id);
  `,
  `
  -- Blocking: someone you've blocked can't be your friend or ask to be, and their messages in
  -- spaces you share fold away in your app.
  CREATE TABLE blocks (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, blocked_id)
  );
  CREATE INDEX blocks_blocked ON blocks(blocked_id);
  -- Reports about a message or a person. Ones from a space go to its moderators, and all of
  -- them to the server's admin. What a message said is kept, in case it's deleted.
  CREATE TABLE reports (
    id          INTEGER PRIMARY KEY,
    reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    space_id    TEXT REFERENCES spaces(id) ON DELETE SET NULL,
    conv_id     TEXT,  -- the channel or DM the message was in
    message_id  TEXT,
    reason      TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    snapshot    TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL,
    resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at INTEGER
  );
  CREATE INDEX reports_space ON reports(space_id, id);
  CREATE INDEX reports_reporter ON reports(reporter_id, created_at);
  `,
  `
  -- Who a channel message mentions: people, or '*' for @everyone.
  CREATE TABLE message_mentions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  CREATE INDEX message_mentions_user ON message_mentions(user_id);
  -- What each member wants to hear about from a space: all | mentions | none.
  ALTER TABLE space_members ADD COLUMN notify TEXT NOT NULL DEFAULT 'mentions';
  `,
  `
  -- Voice channels: everyone can join them and talk, unless a space says otherwise (the new
  -- Connect and Speak permissions, bits 14 and 15). Each voice channel has its own key, so
  -- the media service in the middle can't listen in.
  UPDATE spaces SET everyone_perms = everyone_perms | 49152;
  ALTER TABLE channels ADD COLUMN voice_key TEXT;
  `,
  `
  -- The call debug log (lib/traces.js): notes from people's devices about their calls'
  -- connections, and the server's own. Kept for a week.
  CREATE TABLE trace_events (
    id      INTEGER PRIMARY KEY,
    pair    TEXT NOT NULL,     -- the two people's ids, 'a:b' (sorted), or '*' for the server itself
    user_id TEXT,              -- whose device it came from; NULL: the server
    device  TEXT NOT NULL DEFAULT '',
    note_id TEXT,              -- the device's id for the note, so one sent twice is kept once
    call_id TEXT,
    t       INTEGER NOT NULL,  -- when, in the server's time (ms)
    kind    TEXT NOT NULL,
    data    TEXT,              -- details, as JSON
    UNIQUE (user_id, note_id)
  );
  CREATE INDEX trace_events_pair_t ON trace_events(pair, t);
  CREATE INDEX trace_events_t ON trace_events(t);
  `,
  `
  -- Group chats: a few friends with a chat and a call of their own. Underneath, a group is
  -- a small space of this kind (with no roles, invite links or channels of its own making).
  ALTER TABLE spaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'space';
  `,
  // 17: custom emoji, each space's own (see lib/emoji.js).
  `
  CREATE TABLE space_emoji (
    id         TEXT PRIMARY KEY,
    space_id   TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    file       TEXT NOT NULL,              -- file name in the emoji folder
    animated   INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX space_emoji_name ON space_emoji(space_id, name COLLATE NOCASE);
  `,
  // Homepages (lib/homepages.js): each person's own page, and the pictures on it.
  `
  CREATE TABLE homepages (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    doc        TEXT,                           -- the page (JSON), or NULL if they haven't made one yet
    visibility TEXT NOT NULL DEFAULT 'spaces', -- friends | spaces | everyone
    views      INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE homepage_files (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL DEFAULT 'image',  -- image | audio (a song for its music player)
    file       TEXT NOT NULL,                  -- file name in the homepages folder
    bytes      INTEGER NOT NULL,
    animated   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX homepage_files_user ON homepage_files(user_id);
  CREATE TABLE guestbook (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- whose page it's on
    author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX guestbook_owner ON guestbook(owner_id, created_at);
  CREATE INDEX guestbook_author ON guestbook(author_id, created_at);
  `,
  // Email (lib/mail.js): confirming addresses, and which reset links went by email.
  `
  ALTER TABLE users ADD COLUMN email_confirmed_at INTEGER;
  ALTER TABLE password_resets ADD COLUMN by_email INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX password_resets_user ON password_resets(user_id, created_at);
  CREATE TABLE email_confirms (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL, -- the address it confirms (a newer one may have replaced it since)
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
  );
  CREATE INDEX email_confirms_user ON email_confirms(user_id, created_at);
  `,
  // Suspending an account (Admin): it can't sign in until the admin lets it back.
  `
  ALTER TABLE users ADD COLUMN suspended_at INTEGER;
  ALTER TABLE users ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '';
  `,
  // Open sign-ups (lib/signups.js): the admin's settings, the waitlist, and who signed up without
  // an invite (they confirm their email before adding friends or joining spaces).
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE waitlist (
    email      TEXT PRIMARY KEY COLLATE NOCASE,
    created_at INTEGER NOT NULL,
    invited_at INTEGER,     -- when an invite went to them
    code       TEXT         -- that invite
  );
  ALTER TABLE users ADD COLUMN open_signup INTEGER NOT NULL DEFAULT 0;
  `,
  // Room for files (lib/storage.js): someone the admin's given a different amount than everyone
  // gets, and adding up what each person's sent, quickly.
  `
  ALTER TABLE users ADD COLUMN storage_mb INTEGER;
  CREATE INDEX messages_files_by ON messages(author_id) WHERE file_path IS NOT NULL;
  `,
  // A homepage's "ask me anything" box (lib/homepages.js): the questions visitors ask, and the
  // owner's answers. Who asked is kept even when they asked anonymously (the owner isn't told),
  // for reports, limits, and deleting their own; and whose questions an owner has stopped.
  `
  CREATE TABLE questions (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- whose page it was asked on
    asker_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anonymous   INTEGER NOT NULL DEFAULT 0,
    text        TEXT NOT NULL,
    answer      TEXT,             -- NULL until the owner answers it (only answered ones are shown)
    created_at  INTEGER NOT NULL,
    answered_at INTEGER
  );
  CREATE INDEX questions_owner ON questions(owner_id, answered_at);
  CREATE INDEX questions_asker ON questions(asker_id, created_at);
  CREATE TABLE question_stops (
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asker_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, asker_id)
  );
  `,
  // 18+ channels (lib/spaces.js): a channel its space has marked 18+, and when someone said
  // they're 18 or older (they're asked once, the first time they open one).
  `
  ALTER TABLE channels ADD COLUMN adult INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN adult_at INTEGER;
  `,
  // Announcements (lib/announcements.js): whoever runs the server telling everyone something (a
  // change to the terms, say), and the newest one each person's pressed "Got it" on.
  `
  CREATE TABLE announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    link       TEXT NOT NULL DEFAULT '', -- where to read more (/terms, say), or ''
    starts_on  TEXT,                     -- the day the change it's about starts (2026-10-02), or NULL for news
    by_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  ALTER TABLE users ADD COLUMN announcements_seen INTEGER NOT NULL DEFAULT 0;
  `,
  // Files on Cloudflare R2 (lib/blobs.js): which are there (the rest are on this disk), and
  // deletes that didn't reach R2 at the time, to try again.
  `
  CREATE TABLE blobs (
    key       TEXT PRIMARY KEY, -- kind/name: files/<id>, avatars/<name>, previews/<id>.webp...
    bytes     INTEGER NOT NULL,
    stored_at INTEGER NOT NULL
  );
  CREATE TABLE blobs_gone (
    key   TEXT PRIMARY KEY,
    since INTEGER NOT NULL
  );
  `,
  // Keeping the free tier from being filled up (lib/abuse.js): flags for the admin, each file's
  // fingerprint (to notice the same one sent again and again), and when someone besides its
  // sender first opened it (not who).
  `
  CREATE TABLE flags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL, -- fast | repeats | unopened | place
    detail     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    cleared_at INTEGER,
    cleared_by TEXT
  );
  CREATE INDEX flags_user ON flags(user_id, kind);
  ALTER TABLE messages ADD COLUMN file_hash TEXT;
  ALTER TABLE messages ADD COLUMN opened_at INTEGER;
  CREATE INDEX messages_hash ON messages(author_id, file_hash) WHERE file_hash IS NOT NULL;
  `,
  // Supporting Rainlit (lib/supporters.js): since when someone's supporting now (NULL: they
  // aren't), how long they did before (for the badge), when they first did, their plan and when
  // it renews or ends, and Stripe's ids for them. Stripe's events, each handled once, and tips
  // (for this month's total; their account can go, the amount stays).
  `
  ALTER TABLE users ADD COLUMN supporter_since INTEGER;
  ALTER TABLE users ADD COLUMN supporter_ms INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN supporter_first INTEGER;
  ALTER TABLE users ADD COLUMN supporter_plan TEXT;    -- month | year | gift
  ALTER TABLE users ADD COLUMN supporter_until INTEGER; -- paid (or gifted) until
  ALTER TABLE users ADD COLUMN supporter_cancels INTEGER; -- when it stops, if they've cancelled
  ALTER TABLE users ADD COLUMN stripe_customer TEXT;
  ALTER TABLE users ADD COLUMN stripe_subscription TEXT;
  CREATE INDEX users_stripe ON users(stripe_customer) WHERE stripe_customer IS NOT NULL;
  CREATE TABLE stripe_events (
    id   TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    at   INTEGER NOT NULL
  );
  CREATE TABLE tips (
    session_id TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    cents      INTEGER NOT NULL,
    at         INTEGER NOT NULL
  );
  `,
  // Someone who was under 18 when they made their account: the day they turn 18 (their birthday
  // itself isn't kept), so 18+ channels stay closed until then.
  `
  ALTER TABLE users ADD COLUMN adult_from INTEGER;
  `,
  // Someone's theme (lib/themes.js), the same on all their devices (NULL: they've never picked one).
  `
  ALTER TABLE users ADD COLUMN theme TEXT;
  `,
  // Feedback (lib/feedback.js): a bug, an idea or anything else, from someone to the server's
  // admins, with a bug's diagnostics if they sent them, and the admin's reply. It goes with the
  // sender's account.
  `
  CREATE TABLE feedback (
    id         INTEGER PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,  -- bug | idea | other
    text       TEXT NOT NULL,
    details    TEXT,           -- a bug's diagnostics (JSON), if they ticked the box
    created_at INTEGER NOT NULL,
    seen_at    INTEGER,        -- when an admin first saw it
    done_at    INTEGER,
    reply      TEXT,
    replied_at INTEGER,
    replied_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX feedback_user ON feedback(user_id, created_at);
  `,
  // Someone's pet (lib/pets.js): what kind, its name and colours, whether it's on their homepage,
  // how full and how happy it was when that last changed (they wear off from there), how many
  // times it's been petted, and when its owner last fed it and played with it.
  `
  CREATE TABLE pets (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    coat       TEXT NOT NULL,
    home       INTEGER NOT NULL DEFAULT 1,  -- on their homepage
    full       REAL NOT NULL,               -- 0 (hungry) to 1, at full_at
    full_at    INTEGER NOT NULL,
    happy      REAL NOT NULL,               -- 0 to 1, at happy_at
    happy_at   INTEGER NOT NULL,
    pets       INTEGER NOT NULL DEFAULT 0,
    fed_at     INTEGER,
    played_at  INTEGER,
    adopted_at INTEGER NOT NULL
  );
  `,
  // How someone's pet's room is done up (lib/pets.js: its wallpaper, floor, rug and things), as JSON.
  // It's theirs, not the pet's, so it stays if they let their pet go and adopt another.
  `
  ALTER TABLE users ADD COLUMN pet_room TEXT;
  `,
  // Someone's profile card (lib/cards.js: its colours, pattern, font and weather), as JSON.
  `
  ALTER TABLE users ADD COLUMN card TEXT;
  `,
  // A space's picture, kept with profile pictures (AVATAR_DIR, "<space id>-<random>.<ext>"), or
  // null: its initials instead.
  `
  ALTER TABLE spaces ADD COLUMN icon TEXT;
  `,
  // The cloudlet became the droplet (Rainlit's own little drop): a cloudlet someone has is now a
  // droplet, in the nearest of its colours.
  `
  UPDATE pets SET kind = 'drop', coat = CASE coat WHEN 'dusk' THEN 'dusk' WHEN 'candy' THEN 'dusk' ELSE 'rain' END
    WHERE kind = 'cloud';
  `,
  // Channels someone's muted (lib/spaces.js): their new messages don't light anything up, make a
  // sound or reach that person's phone, unless they mention them.
  `
  CREATE TABLE channel_mutes (
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, user_id)
  );
  CREATE INDEX channel_mutes_user ON channel_mutes(user_id);
  `,
];

const { user_version: current } = db.prepare('PRAGMA user_version').get();

// Before an update changes anything, a copy of the database as it was goes in the backups
// folder, in case the update goes wrong. The newest three are kept, for 30 days at most (the
// privacy policy promises that something deleted is gone from them within a month).
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_DAYS = 30;

function pruneBackups() {
  let copies;
  try {
    copies = fs.readdirSync(BACKUP_DIR).filter((f) => /^porchlight-v\d+-.+\.db$/.test(f));
  } catch {
    return;
  }
  copies.sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs);
  const tooOld = Date.now() - BACKUP_DAYS * 86_400_000;
  copies.forEach((f, i) => {
    if (i >= 3 || fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs < tooOld) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  });
}

if (current > 0 && current < MIGRATIONS.length) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `porchlight-v${current}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
}
pruneBackups();
setInterval(pruneBackups, 86_400_000).unref();

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
