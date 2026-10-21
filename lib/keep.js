'use strict';

// Your own, kept, if you keep a record of your calls (Your profile > A record of your calls), when
// the conversation or channel it was in goes without you asking: your side of a conversation with a
// friend who deletes their account (your messages and files, and the notes of your calls: when, how
// long, who rang), and your own messages and files in a channel or space someone else deletes.
// Theirs goes, as they asked (a friend whose account is gone isn't named: they're someone whose
// account is gone). Yours stays in your record: in your data download, your record of your calls
// with them, and Your files (where they can go one by one). All of it goes with your record (Delete
// my call record) or your account.

const { db } = require('./db');
const callrecord = require('./callrecord');

const pair = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

const copy = db.prepare(`
  INSERT OR IGNORE INTO kept_messages (user_id, id, dm_id, author_id, kind, text, file_name, file_size, file_type, file_path, meta, reply_to, created_at, edited_at, place, gone_at, gone_why)
  SELECT ?, id, dm_id, author_id, kind, text, file_name, file_size, file_type, file_path, meta, reply_to, created_at, edited_at, ?, ?, ? FROM messages WHERE id = ?
`);

// A friend deleting their account: each friend of theirs keeping a record keeps their own side of
// their conversation, and the notes of its calls. Returns the files kept (not to go with it).
function fromAccount(goneId) {
  const files = new Set();
  const now = Date.now();
  for (const d of db.prepare('SELECT id, user_a, user_b FROM dms WHERE (user_a = ? OR user_b = ?) AND user_a != user_b').all(goneId, goneId)) {
    const friend = d.user_a === goneId ? d.user_b : d.user_a;
    if (!callrecord.keeping(friend)) continue;
    const rows = db.prepare(`SELECT id, file_path FROM messages WHERE dm_id = ?
      AND ((author_id = ? AND kind IN ('text', 'file', 'gif')) OR kind IN ('call', 'saving'))`).all(d.id, friend);
    for (const r of rows) {
      copy.run(friend, JSON.stringify({ kind: 'dm' }), now, 'account', r.id);
      if (r.file_path) files.add(r.file_path);
    }
  }
  return files;
}

// Channels going (one deleted, or its whole space): each one who wrote in them keeping a record
// keeps their own messages and files, and where they were, as it was called then. Returns the files
// kept. why: 'channel' or 'space'.
function fromChannels(channelIds, why) {
  const files = new Set();
  const now = Date.now();
  for (const id of channelIds) {
    const at = db.prepare('SELECT c.name channel, s.name space, s.kind FROM channels c JOIN spaces s ON s.id = c.space_id WHERE c.id = ?').get(id);
    const place = JSON.stringify(!at ? { kind: 'channel' } : at.kind === 'group' ? { kind: 'group', group: at.space || null } : { kind: 'channel', space: at.space, channel: at.channel });
    const authors = db.prepare("SELECT DISTINCT author_id FROM messages WHERE dm_id = ? AND author_id IS NOT NULL AND kind IN ('text', 'file', 'gif')").all(id);
    for (const { author_id: author } of authors) {
      if (!callrecord.keeping(author)) continue;
      for (const r of db.prepare("SELECT id, file_path FROM messages WHERE dm_id = ? AND author_id = ? AND kind IN ('text', 'file', 'gif')").all(id, author)) {
        copy.run(author, place, now, why, r.id);
        if (r.file_path) files.add(r.file_path);
      }
    }
  }
  return files;
}

const channelsOf = (spaceId) => db.prepare('SELECT id FROM channels WHERE space_id = ?').all(spaceId).map((c) => c.id);

// Where a kept one was, in words (for Your files).
function placeText(r) {
  let p = {};
  try { p = JSON.parse(r.place || '{}') || {}; } catch {}
  if (p.kind === 'dm') return 'To someone whose account is gone';
  if (p.kind === 'group') return `${p.group ? `${p.group}, a group` : 'A group'} that's gone`;
  return p.channel ? `#${p.channel}${p.space ? ` in ${p.space}` : ''}, deleted` : 'A channel that was deleted';
}

// A file kept in someone's record (to open, or delete), or null.
function fileOf(userId, id) {
  return db.prepare("SELECT * FROM kept_messages WHERE user_id = ? AND id = ? AND kind = 'file' AND file_path IS NOT NULL").get(userId, id) || null;
}

// (By its id alone: for a short-lived link, already given to whoever keeps it.)
function anyFile(id) {
  return db.prepare("SELECT * FROM kept_messages WHERE id = ? AND kind = 'file' AND file_path IS NOT NULL").get(String(id)) || null;
}

const filesOf = (userId) => db.prepare("SELECT * FROM kept_messages WHERE user_id = ? AND kind = 'file' AND file_path IS NOT NULL").all(userId);

// A kept file deleted (from Your files): returns the file itself, to delete, or null.
function removeFile(userId, id) {
  const r = fileOf(userId, id);
  if (!r) return null;
  db.prepare('DELETE FROM kept_messages WHERE user_id = ? AND id = ?').run(userId, id);
  return r.file_path;
}

// Everything kept in someone's record, gone (with their record, or their account): { n, files }.
function clear(userId) {
  const files = db.prepare('SELECT file_path FROM kept_messages WHERE user_id = ? AND file_path IS NOT NULL').all(userId).map((r) => r.file_path);
  const n = db.prepare('DELETE FROM kept_messages WHERE user_id = ?').run(userId).changes;
  return { n, files };
}

const hasAny = (userId, friendId) => Boolean(db.prepare('SELECT 1 FROM kept_messages WHERE user_id = ? AND dm_id = ? LIMIT 1').get(userId, pair(userId, friendId)));

// Conversations someone's record kept from friends whose accounts are gone (and calls in their
// record with them): [{ friend, messages, calls, first, last }], the latest first.
function formerFriends(userId) {
  const out = new Map();
  for (const r of db.prepare(`SELECT dm_id, SUM(kind IN ('text', 'file', 'gif')) n, MIN(created_at) first, MAX(created_at) last
    FROM kept_messages WHERE user_id = ? AND gone_why = 'account' GROUP BY dm_id`).all(userId)) {
    const friend = r.dm_id.split(':').find((id) => id !== userId);
    if (friend) out.set(friend, { friend, messages: r.n || 0, calls: 0, first: r.first, last: r.last });
  }
  for (const r of db.prepare(`SELECT friend_id, COUNT(*) n, MIN(started_at) first, MAX(started_at) last FROM call_log
    WHERE user_id = ? AND kind = 'call' AND friend_id IS NOT NULL AND friend_id NOT IN (SELECT id FROM users) GROUP BY friend_id`).all(userId)) {
    const f = out.get(r.friend_id) || { friend: r.friend_id, messages: 0, calls: 0, first: r.first, last: r.last };
    f.calls = r.n;
    f.first = Math.min(f.first, r.first);
    f.last = Math.max(f.last, r.last);
    out.set(r.friend_id, f);
  }
  return [...out.values()].sort((a, b) => b.last - a.last);
}

module.exports = { fromAccount, fromChannels, channelsOf, placeText, fileOf, anyFile, filesOf, removeFile, clear, hasAny, formerFriends };
