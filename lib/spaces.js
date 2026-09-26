'use strict';

// Spaces: places for more than two people, like a Discord server. Each has members (the
// owner, admins, everyone else), text channels, and invite links. A channel's messages are
// kept like a DM's (lib/dms.js), with the channel's id where a DM's would be.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, transaction } = require('./db');
const { oneLine, publicUser, userById } = require('./people');

const NAME_MAX = 40;
const MAX_CHANNELS = 50;
const ROLES = ['owner', 'admin', 'member'];

const newId = () => crypto.randomBytes(12).toString('hex');

// "Game Night!" -> "game-night", like Discord's channel names.
function channelName(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

const spaceName = (value) => oneLine(value, NAME_MAX);

// ---------- Spaces ----------

function createSpace(ownerId, name) {
  const now = Date.now();
  const id = newId();
  transaction(() => {
    db.prepare('INSERT INTO spaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').run(id, name, ownerId, now);
    db.prepare("INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(id, ownerId, now);
    db.prepare("INSERT INTO channels (id, space_id, name, position, created_at) VALUES (?, ?, 'general', 0, ?)").run(newId(), id, now);
  });
  return id;
}

function getSpace(id) {
  return db.prepare('SELECT * FROM spaces WHERE id = ?').get(String(id)) || null;
}

function renameSpace(id, name) {
  db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(name, id);
}

// Deletes a space, its channels, their messages (by trigger) and their files.
function deleteSpace(id) {
  const files = db.prepare(`
    SELECT m.file_path FROM messages m JOIN channels c ON c.id = m.dm_id
    WHERE c.space_id = ? AND m.file_path IS NOT NULL
  `).all(id);
  db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
  removeFiles(files);
}

function removeFiles(rows) {
  const { FILES_DIR } = require('./dms');
  for (const r of rows) fs.rm(path.join(FILES_DIR, r.file_path), { force: true }, () => {});
}

// ---------- Members ----------

function roleOf(spaceId, userId) {
  const r = db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?').get(String(spaceId), String(userId));
  return r ? r.role : null;
}

const isMember = (spaceId, userId) => Boolean(roleOf(spaceId, userId));
const canManage = (role) => role === 'owner' || role === 'admin';

function memberIds(spaceId) {
  return db.prepare('SELECT user_id FROM space_members WHERE space_id = ?').all(spaceId).map((r) => r.user_id);
}

function members(spaceId) {
  const rows = db.prepare(`
    SELECT m.user_id, m.role, m.joined_at FROM space_members m WHERE m.space_id = ?
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at
  `).all(spaceId);
  return rows.map((r) => {
    const u = userById(r.user_id);
    return u && { ...publicUser(u), role: r.role, joinedAt: r.joined_at };
  }).filter(Boolean);
}

function addMember(spaceId, userId) {
  db.prepare("INSERT OR IGNORE INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
    .run(spaceId, userId, Date.now());
}

function removeMember(spaceId, userId) {
  db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(spaceId, userId);
  db.prepare('DELETE FROM dm_reads WHERE user_id = ? AND dm_id IN (SELECT id FROM channels WHERE space_id = ?)').run(userId, spaceId);
}

function setRole(spaceId, userId, role) {
  if (!ROLES.includes(role) || role === 'owner') return;
  db.prepare('UPDATE space_members SET role = ? WHERE space_id = ? AND user_id = ?').run(role, spaceId, userId);
}

// Do these two people share a space? (Then they can see each other's profiles.)
function shareSpace(a, b) {
  return Boolean(db.prepare(`
    SELECT 1 FROM space_members x JOIN space_members y ON y.space_id = x.space_id
    WHERE x.user_id = ? AND y.user_id = ? LIMIT 1
  `).get(a, b));
}

// ---------- Channels ----------

function channel(id) {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(String(id)) || null;
}

function channelsOf(spaceId) {
  return db.prepare('SELECT id, name, kind, position FROM channels WHERE space_id = ? ORDER BY position, created_at').all(spaceId);
}

// null if there's no room for another.
function createChannel(spaceId, name) {
  const count = db.prepare('SELECT COUNT(*) n, MAX(position) top FROM channels WHERE space_id = ?').get(spaceId);
  if (count.n >= MAX_CHANNELS) return null;
  const id = newId();
  db.prepare('INSERT INTO channels (id, space_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, spaceId, name, (count.top ?? -1) + 1, Date.now());
  return id;
}

function renameChannel(id, name) {
  db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, id);
}

// Deletes a channel, its messages (by trigger) and their files.
function deleteChannel(id) {
  const files = db.prepare('SELECT file_path FROM messages WHERE dm_id = ? AND file_path IS NOT NULL').all(id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  removeFiles(files);
}

// ---------- Invite links ----------

function createInvite(spaceId, userId) {
  const code = crypto.randomBytes(6).toString('base64url'); // 8 characters
  db.prepare('INSERT INTO space_invites (code, space_id, created_by, created_at) VALUES (?, ?, ?, ?)').run(code, spaceId, userId, Date.now());
  return code;
}

function inviteByCode(code) {
  if (!/^[A-Za-z0-9_-]{8}$/.test(String(code || ''))) return null;
  return db.prepare('SELECT * FROM space_invites WHERE code = ?').get(String(code)) || null;
}

function useInvite(code) {
  db.prepare('UPDATE space_invites SET uses = uses + 1 WHERE code = ?').run(code);
}

// ---------- What you see ----------

// Your spaces, each with its channels, your role, and how many unread messages each channel
// has for you (counted from when you joined, for channels you've never opened).
function spacesFor(userId) {
  const spaces = db.prepare(`
    SELECT s.id, s.name, s.owner_id, m.role, m.joined_at FROM spaces s
    JOIN space_members m ON m.space_id = s.id AND m.user_id = ?
    ORDER BY m.joined_at
  `).all(userId);
  if (!spaces.length) return [];
  const unread = db.prepare(`
    SELECT c.id, (
      SELECT COUNT(*) FROM messages msg
      WHERE msg.dm_id = c.id AND msg.author_id IS NOT ? AND msg.kind IN ('text', 'file', 'gif')
        AND msg.created_at > COALESCE((SELECT read_at FROM dm_reads r WHERE r.dm_id = c.id AND r.user_id = ?), m.joined_at)
    ) AS unread,
    (SELECT MAX(created_at) FROM messages msg WHERE msg.dm_id = c.id) AS last_at
    FROM channels c JOIN space_members m ON m.space_id = c.space_id AND m.user_id = ?
  `).all(userId, userId, userId);
  const byChannel = new Map(unread.map((r) => [r.id, r]));
  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    ownerId: s.owner_id,
    memberCount: db.prepare('SELECT COUNT(*) n FROM space_members WHERE space_id = ?').get(s.id).n,
    channels: channelsOf(s.id).map((c) => ({
      id: c.id, name: c.name, kind: c.kind,
      unread: (byChannel.get(c.id) || {}).unread || 0,
      lastAt: (byChannel.get(c.id) || {}).last_at || 0,
    })),
  }));
}

module.exports = {
  NAME_MAX, MAX_CHANNELS, channelName, spaceName,
  createSpace, getSpace, renameSpace, deleteSpace,
  roleOf, isMember, canManage, memberIds, members, addMember, removeMember, setRole, shareSpace,
  channel, channelsOf, createChannel, renameChannel, deleteChannel,
  createInvite, inviteByCode, useInvite,
  spacesFor,
};
