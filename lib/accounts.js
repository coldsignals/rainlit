'use strict';

// Deleting an account, for good (Your profile > Delete account, or rainlit.app/delete-account).
// Everything of theirs goes:
//   - everything they sent, anywhere: messages, files and reactions;
//   - their conversations with friends, both sides (with them gone, the friend couldn't open
//     it again anyway);
//   - their friends and requests, blocks, profile and picture, homepage (and its pictures),
//     badges, sign-ins, phones, and their call debug log notes.
// Groups carry on without them. A space they own passes to its most senior member (their
// highest role, then whoever's been there longest), or goes if nobody else is in it.
// Reports about them, and space logs, keep the names they had then, for whoever looks after
// the space or the server.

const fs = require('fs');
const path = require('path');
const { db, transaction, AVATAR_DIR } = require('./db');
const { removeFile } = require('./dms');
const emoji = require('./emoji');
const homepages = require('./homepages');

// Who a space would pass to: its member with the highest role, then the one who's been in it
// longest. (null: nobody else is in it.)
function heirOf(spaceId, userId) {
  return db.prepare(`
    SELECT m.user_id AS id, u.display_name AS name, COALESCE(MAX(r.position), 0) AS top
    FROM space_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN member_roles mr ON mr.space_id = m.space_id AND mr.user_id = m.user_id
    LEFT JOIN space_roles r ON r.id = mr.role_id
    WHERE m.space_id = ? AND m.user_id != ?
    GROUP BY m.user_id
    ORDER BY top DESC, m.joined_at, m.rowid
    LIMIT 1
  `).get(spaceId, userId) || null;
}

// The only admin of this server can't go (nobody would be left to look after it).
function lastAdmin(userId) {
  const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all().map((r) => r.id);
  return admins.length === 1 && admins[0] === userId;
}

// What deleting would do, to show before anyone confirms it: the spaces they own, and who
// each one would pass to (or that it would go).
function preview(userId) {
  const owned = db.prepare(`
    SELECT s.id, s.name, (SELECT COUNT(*) FROM space_members x WHERE x.space_id = s.id) AS members
    FROM space_members m JOIN spaces s ON s.id = m.space_id
    WHERE m.user_id = ? AND m.role = 'owner' AND s.kind != 'group'
    ORDER BY s.name COLLATE NOCASE
  `).all(userId);
  return {
    lastAdmin: lastAdmin(userId),
    spaces: owned.map((s) => {
      const heir = heirOf(s.id, userId);
      return { id: s.id, name: s.name, members: s.members, heir: heir ? { id: heir.id, name: heir.name } : null };
    }),
  };
}

/**
 * Deletes the account. Returns who needs telling: { friends: [ids], spaces: [ids still
 * around that they were in], handedOver: [{ space, heir, heirName }], gone: { channelId: [message
 * ids] } } (or null if there was no such account).
 */
function deleteAccount(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const files = [];
  const emojiFiles = [];
  const spacePics = [];
  const pageFiles = homepages.filesOf(userId);
  const out = { friends: [], spaces: [], handedOver: [], gone: {} };

  transaction(() => {
    out.friends = db.prepare('SELECT user_a, user_b FROM friendships WHERE user_a = ? OR user_b = ?').all(userId, userId)
      .map((f) => (f.user_a === userId ? f.user_b : f.user_a));

    // Their spaces and groups.
    const memberships = db.prepare(`
      SELECT s.id, s.kind, s.icon, m.role FROM space_members m JOIN spaces s ON s.id = m.space_id WHERE m.user_id = ?
    `).all(userId);
    for (const s of memberships) {
      const heir = s.kind === 'group'
        ? db.prepare('SELECT user_id AS id FROM space_members WHERE space_id = ? AND user_id != ? ORDER BY joined_at, rowid LIMIT 1').get(s.id, userId)
        : heirOf(s.id, userId);
      if (!heir) {
        // Nobody else is in it: it goes, with its channels, their messages and files.
        for (const r of db.prepare(`
          SELECT m.file_path FROM messages m JOIN channels c ON c.id = m.dm_id WHERE c.space_id = ? AND m.file_path IS NOT NULL
        `).all(s.id)) files.push(r.file_path);
        emojiFiles.push(...emoji.filesOf(s.id));
        if (s.icon) spacePics.push(s.icon);
        db.prepare('DELETE FROM spaces WHERE id = ?').run(s.id);
        continue;
      }
      if (s.role === 'owner') {
        db.prepare('UPDATE spaces SET owner_id = ? WHERE id = ?').run(heir.id, s.id);
        db.prepare("UPDATE space_members SET role = 'owner' WHERE space_id = ? AND user_id = ?").run(s.id, heir.id);
        if (s.kind !== 'group') out.handedOver.push({ space: s.id, heir: heir.id, heirName: heir.name });
      }
      out.spaces.push(s.id);
    }

    // Everything they sent, anywhere (spaces they've left too).
    const sent = db.prepare('SELECT id, dm_id, file_path FROM messages WHERE author_id = ?').all(userId);
    const channelIds = new Set(db.prepare('SELECT id FROM channels').all().map((c) => c.id));
    const del = db.prepare('DELETE FROM messages WHERE id = ?');
    const unmention = db.prepare('DELETE FROM message_mentions WHERE message_id = ?');
    for (const m of sent) {
      if (m.file_path) files.push(m.file_path);
      del.run(m.id);
      unmention.run(m.id);
      if (channelIds.has(m.dm_id)) (out.gone[m.dm_id] ||= []).push(m.id);
    }
    db.prepare('DELETE FROM message_mentions WHERE user_id = ?').run(userId);

    // Their conversations with friends go with the account (the rest by the database itself),
    // so their files do too.
    for (const r of db.prepare(`
      SELECT m.file_path FROM messages m JOIN dms d ON d.id = m.dm_id
      WHERE (d.user_a = ? OR d.user_b = ?) AND m.file_path IS NOT NULL
    `).all(userId, userId)) files.push(r.file_path);

    db.prepare("DELETE FROM trace_events WHERE user_id = ? OR pair LIKE ? OR pair LIKE ?").run(userId, `${userId}:%`, `%:${userId}`);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  for (const f of files) removeFile(f);
  emoji.removeFiles(emojiFiles);
  homepages.removeFiles(pageFiles);
  const blobs = require('./blobs');
  for (const name of [user.avatar, ...spacePics]) if (name) blobs.remove('avatars', name);
  return out;
}

module.exports = { preview, lastAdmin, deleteAccount };
