'use strict';

// Spaces: places for more than two people, like a Discord server. Each has members, roles,
// text channels and invite links. A channel's messages are kept like a DM's (lib/dms.js),
// with the channel's id where a DM's would be.
//
// Who can do what: everyone in a space has what @everyone has (the space's everyone_perms),
// plus what each of their roles allows. The owner, and anyone with Administrator, can do
// anything and see every channel. Roles are in an order: someone who manages roles can only
// manage the ones below their own highest role, and only people whose highest role is below
// theirs (or themselves).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, transaction } = require('./db');
const { oneLine, publicUser, userById, userByUsername } = require('./people');

const NAME_MAX = 40;
const MAX_CHANNELS = 50;
const MAX_ROLES = 50;
const ROLE_NAME_MAX = 32;

// Each permission is one bit. They're stored, so a bit never changes meaning.
const PERMS = {
  administrator: 1 << 0,
  manageSpace: 1 << 1,
  manageChannels: 1 << 2,
  manageRoles: 1 << 3,
  invite: 1 << 4,
  send: 1 << 5,
  files: 1 << 6,
  react: 1 << 7,
  manageMessages: 1 << 8,
  kick: 1 << 9,
  ban: 1 << 10,
  timeout: 1 << 11,
  viewLog: 1 << 12,
  mentionEveryone: 1 << 13,
};
const ALL_PERMS = Object.values(PERMS).reduce((a, b) => a | b, 0);
const permNames = (bits) => Object.keys(PERMS).filter((name) => bits & PERMS[name]);
const permBits = (names) => (Array.isArray(names) ? names : []).reduce((bits, name) => bits | (PERMS[name] || 0), 0);

const newId = () => crypto.randomBytes(12).toString('hex');

// "Game Night!" -> "game-night", like Discord's channel names.
function channelName(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

const spaceName = (value) => oneLine(value, NAME_MAX);
const roleName = (value) => oneLine(value, ROLE_NAME_MAX);
// A role's color: "#rrggbb", or null for none.
const roleColor = (value) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : null);

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

function setEveryonePerms(id, bits) {
  db.prepare('UPDATE spaces SET everyone_perms = ? WHERE id = ?').run(bits, id);
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

// ---------- Members, and what they can do ----------

// One member of a space, and what they can do there, or null if they aren't in it:
// { userId, owner, joinedAt, roleIds, perms (bits), top (their highest role's place),
//   timeoutUntil (0 unless they're in a timeout) }.
function memberOf(spaceId, userId) {
  const m = db.prepare(`
    SELECT m.role, m.joined_at, m.timeout_until, s.everyone_perms FROM space_members m JOIN spaces s ON s.id = m.space_id
    WHERE m.space_id = ? AND m.user_id = ?
  `).get(String(spaceId), String(userId));
  if (!m) return null;
  const roles = db.prepare(`
    SELECT r.id, r.perms, r.position FROM member_roles mr JOIN space_roles r ON r.id = mr.role_id
    WHERE mr.space_id = ? AND mr.user_id = ?
  `).all(String(spaceId), String(userId));
  const owner = m.role === 'owner';
  let perms = roles.reduce((bits, r) => bits | r.perms, m.everyone_perms);
  if (owner || perms & PERMS.administrator) perms = ALL_PERMS;
  return {
    userId: String(userId),
    owner,
    joinedAt: m.joined_at,
    roleIds: roles.map((r) => r.id),
    perms,
    top: owner ? Infinity : roles.reduce((top, r) => Math.max(top, r.position), 0),
    timeoutUntil: m.timeout_until > Date.now() ? m.timeout_until : 0,
  };
}

const can = (member, perm) => Boolean(member && member.perms & PERMS[perm]);

// Someone who manages roles can manage a role below their own highest one.
const canManageRole = (member, role) => can(member, 'manageRoles') && role.position < member.top;

// ...and change the roles of people below them (or their own), never the owner's.
const canManageMember = (member, target) => can(member, 'manageRoles') && !target.owner
  && (member.owner || target.userId === member.userId || target.top < member.top);

// Moderating someone (a timeout, a kick, a ban) takes the permission, and they have to be
// below you: never the owner, or yourself. Administrators can't be timed out (it wouldn't
// stop them).
function canModerate(member, target, perm) {
  if (!can(member, perm) || target.owner || target.userId === member.userId) return false;
  if (!member.owner && target.top >= member.top) return false;
  return !(perm === 'timeout' && target.perms & PERMS.administrator);
}

// Moderators, for reports from their space: anyone who can delete messages, time people
// out, kick or ban.
const canHandleReports = (member) => ['manageMessages', 'timeout', 'kick', 'ban'].some((perm) => can(member, perm));

// Changing what a role (or @everyone) allows: only the permissions you have yourself can be
// switched on or off. The rest stay as they were.
const allowedPerms = (member, wanted, before) => (wanted & member.perms) | (before & ~member.perms);

const isMember = (spaceId, userId) => Boolean(db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(String(spaceId), String(userId)));

function memberIds(spaceId) {
  return db.prepare('SELECT user_id FROM space_members WHERE space_id = ?').all(spaceId).map((r) => r.user_id);
}

// Everyone in a space, with their roles.
function members(spaceId) {
  const rows = db.prepare('SELECT user_id, role, joined_at, timeout_until FROM space_members WHERE space_id = ? ORDER BY joined_at').all(spaceId);
  const roles = new Map();
  for (const r of db.prepare('SELECT user_id, role_id FROM member_roles WHERE space_id = ?').all(spaceId)) {
    if (!roles.has(r.user_id)) roles.set(r.user_id, []);
    roles.get(r.user_id).push(r.role_id);
  }
  return rows.map((r) => {
    const u = userById(r.user_id);
    return u && {
      ...publicUser(u), owner: r.role === 'owner', roles: roles.get(r.user_id) || [], joinedAt: r.joined_at,
      timeoutUntil: r.timeout_until > Date.now() ? r.timeout_until : 0,
    };
  }).filter(Boolean);
}

function addMember(spaceId, userId) {
  db.prepare("INSERT OR IGNORE INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
    .run(spaceId, userId, Date.now());
}

// (Their roles go with them.)
function removeMember(spaceId, userId) {
  db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(spaceId, userId);
  db.prepare('DELETE FROM dm_reads WHERE user_id = ? AND dm_id IN (SELECT id FROM channels WHERE space_id = ?)').run(userId, spaceId);
}

// Do these two people share a space? (Then they can see each other's profiles.)
function shareSpace(a, b) {
  return Boolean(db.prepare(`
    SELECT 1 FROM space_members x JOIN space_members y ON y.space_id = x.space_id
    WHERE x.user_id = ? AND y.user_id = ? LIMIT 1
  `).get(a, b));
}

// Everyone who shares at least one space with this person.
function coMembersOf(userId) {
  return db.prepare(`
    SELECT DISTINCT y.user_id AS id FROM space_members x JOIN space_members y ON y.space_id = x.space_id
    WHERE x.user_id = ? AND y.user_id != x.user_id
  `).all(userId).map((r) => r.id);
}

// ---------- Roles ----------

function rolesOf(spaceId) {
  return db.prepare('SELECT * FROM space_roles WHERE space_id = ? ORDER BY position DESC').all(spaceId);
}

function role(id) {
  return db.prepare('SELECT * FROM space_roles WHERE id = ?').get(String(id)) || null;
}

const roleJson = (r) => ({ id: r.id, name: r.name, color: r.color, perms: permNames(r.perms), position: r.position, hoist: Boolean(r.hoist) });

// Keeps a space's roles numbered 1, 2, 3… from the bottom, in their order.
function renumber(spaceId) {
  const set = db.prepare('UPDATE space_roles SET position = ? WHERE id = ?');
  db.prepare('SELECT id FROM space_roles WHERE space_id = ? ORDER BY position, created_at').all(spaceId)
    .forEach((r, i) => set.run(i + 1, r.id));
}

// A new role goes at the bottom, just above @everyone. null if there's no room for another.
function createRole(spaceId, { name, color = null, perms = 0, hoist = false }) {
  if (db.prepare('SELECT COUNT(*) n FROM space_roles WHERE space_id = ?').get(spaceId).n >= MAX_ROLES) return null;
  const id = newId();
  transaction(() => {
    db.prepare('INSERT INTO space_roles (id, space_id, name, color, perms, position, hoist, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
      .run(id, spaceId, name, color, perms, hoist ? 1 : 0, Date.now());
    renumber(spaceId);
  });
  return id;
}

function updateRole(id, { name, color, perms, hoist }) {
  const r = role(id);
  if (!r) return;
  db.prepare('UPDATE space_roles SET name = ?, color = ?, perms = ?, hoist = ? WHERE id = ?').run(
    name ?? r.name, color === undefined ? r.color : color, perms ?? r.perms, hoist === undefined ? r.hoist : hoist ? 1 : 0, id);
}

// (It comes off everyone who had it, and off the channels it opened.)
function deleteRole(id) {
  const r = role(id);
  if (!r) return;
  transaction(() => {
    db.prepare('DELETE FROM space_roles WHERE id = ?').run(id);
    renumber(r.space_id);
  });
}

// The role just above (or below) this one, which it would swap places with.
function neighbour(r, up) {
  return db.prepare(`SELECT * FROM space_roles WHERE space_id = ? AND position ${up ? '>' : '<'} ? ORDER BY position ${up ? 'ASC' : 'DESC'} LIMIT 1`)
    .get(r.space_id, r.position) || null;
}

function swapRoles(a, b) {
  transaction(() => {
    db.prepare('UPDATE space_roles SET position = ? WHERE id = ?').run(b.position, a.id);
    db.prepare('UPDATE space_roles SET position = ? WHERE id = ?').run(a.position, b.id);
  });
}

function giveRole(spaceId, userId, roleId) {
  db.prepare('INSERT OR IGNORE INTO member_roles (space_id, user_id, role_id) VALUES (?, ?, ?)').run(spaceId, userId, roleId);
}

function takeRole(spaceId, userId, roleId) {
  db.prepare('DELETE FROM member_roles WHERE space_id = ? AND user_id = ? AND role_id = ?').run(spaceId, userId, roleId);
}

// ---------- Channels ----------

function channel(id) {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(String(id)) || null;
}

function channelsOf(spaceId) {
  return db.prepare('SELECT * FROM channels WHERE space_id = ? ORDER BY position, created_at').all(spaceId);
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

// The roles a channel is open to: { see: [ids], send: [ids] }.
function channelRoles(channelId) {
  const out = { see: [], send: [] };
  for (const r of db.prepare('SELECT role_id, can FROM channel_roles WHERE channel_id = ?').all(channelId)) out[r.can]?.push(r.role_id);
  return out;
}

// Private (only the roles in `see` see it) and read-only (only the roles in `send` post in it).
function setChannelAccess(id, { isPrivate, readonly, see, send }) {
  transaction(() => {
    db.prepare('UPDATE channels SET private = ?, readonly = ? WHERE id = ?').run(isPrivate ? 1 : 0, readonly ? 1 : 0, id);
    db.prepare('DELETE FROM channel_roles WHERE channel_id = ?').run(id);
    const add = db.prepare('INSERT OR IGNORE INTO channel_roles (channel_id, role_id, can) VALUES (?, ?, ?)');
    for (const r of see) add.run(id, r, 'see');
    for (const r of send) add.run(id, r, 'send');
  });
}

// What a member can do in a channel: { see, send, files, react }. Someone who can't see a
// channel can't do anything in it (and isn't told it's there).
function channelAccess(c, member, roles = channelRoles(c.id)) {
  if (!member) return null;
  if (member.perms & PERMS.administrator) return { see: true, send: true, files: true, react: true };
  const hasOne = (ids) => ids.some((id) => member.roleIds.includes(id));
  const see = !c.private || hasOne(roles.see);
  const timedOut = member.timeoutUntil > Date.now(); // they can read, but that's all
  const send = see && !timedOut && can(member, 'send') && (!c.readonly || hasOne(roles.send));
  const access = { see, send, files: send && can(member, 'files'), react: see && !timedOut && can(member, 'react') };
  if (timedOut) access.timedOut = true;
  return access;
}

// Everyone who can see a channel, to send what happens in it to.
function channelAudience(c) {
  if (!c.private) return memberIds(c.space_id);
  return db.prepare(`
    SELECT m.user_id FROM space_members m JOIN spaces s ON s.id = m.space_id
    WHERE m.space_id = ? AND (
      m.role = 'owner' OR (s.everyone_perms & 1)
      OR EXISTS (SELECT 1 FROM member_roles mr JOIN space_roles r ON r.id = mr.role_id
                 WHERE mr.space_id = m.space_id AND mr.user_id = m.user_id AND (r.perms & 1))
      OR EXISTS (SELECT 1 FROM member_roles mr JOIN channel_roles cr ON cr.role_id = mr.role_id
                 WHERE mr.space_id = m.space_id AND mr.user_id = m.user_id AND cr.channel_id = ? AND cr.can = 'see')
    )
  `).all(c.space_id, c.id).map((r) => r.user_id);
}

// ---------- Moderation ----------

function setTimeoutUntil(spaceId, userId, until) {
  db.prepare('UPDATE space_members SET timeout_until = ? WHERE space_id = ? AND user_id = ?').run(until || null, spaceId, userId);
}

function ban(spaceId, userId, byId, reason) {
  transaction(() => {
    db.prepare('INSERT OR REPLACE INTO space_bans (space_id, user_id, by_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(spaceId, userId, byId, reason, Date.now());
    removeMember(spaceId, userId);
  });
}

// false if they weren't banned.
function unban(spaceId, userId) {
  return db.prepare('DELETE FROM space_bans WHERE space_id = ? AND user_id = ?').run(String(spaceId), String(userId)).changes > 0;
}

const isBanned = (spaceId, userId) => Boolean(db.prepare('SELECT 1 FROM space_bans WHERE space_id = ? AND user_id = ?').get(String(spaceId), String(userId)));

function bansOf(spaceId) {
  return db.prepare('SELECT * FROM space_bans WHERE space_id = ? ORDER BY created_at DESC').all(spaceId).map((b) => {
    const u = userById(b.user_id);
    const by = b.by_id && userById(b.by_id);
    return u && { user: publicUser(u), by: by ? { id: by.id, name: by.display_name } : null, reason: b.reason, at: b.created_at };
  }).filter(Boolean);
}

// Everything someone sent in a space's channels since a time, gone for good (for spam, when
// they're banned): { byChannel: { channelId: [ids] }, count (of real messages, not notes) }.
function purgeMessages(spaceId, userId, since) {
  const rows = db.prepare(`
    SELECT m.id, m.dm_id, m.kind, m.file_path FROM messages m JOIN channels c ON c.id = m.dm_id
    WHERE c.space_id = ? AND m.author_id = ? AND m.created_at >= ?
  `).all(spaceId, userId, since);
  if (!rows.length) return { byChannel: {}, count: 0 };
  transaction(() => {
    const del = db.prepare('DELETE FROM messages WHERE id = ?');
    for (const r of rows) del.run(r.id);
  });
  removeFiles(rows.filter((r) => r.file_path));
  const byChannel = {};
  for (const r of rows) (byChannel[r.dm_id] ||= []).push(r.id);
  return { byChannel, count: rows.filter((r) => ['text', 'file', 'gif'].includes(r.kind)).length };
}

// ---------- The log ----------
// What's been done in a space, and by whom: moderation, and changes to roles, channels and
// settings. Details keep the names as they were then.

const LOG_KEEP = 1000;

function log(spaceId, actorId, action, targetId = null, details = {}) {
  db.prepare('INSERT INTO space_log (space_id, actor_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(spaceId, actorId, action, targetId, JSON.stringify(details), Date.now());
  db.prepare(`
    DELETE FROM space_log WHERE space_id = ? AND id <= (SELECT id FROM space_log WHERE space_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)
  `).run(spaceId, spaceId, LOG_KEEP);
}

// Newest first, a page at a time (before: the oldest id you already have).
function logOf(spaceId, before = 0, limit = 50) {
  const rows = db.prepare('SELECT * FROM space_log WHERE space_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT ?')
    .all(spaceId, before, before, limit);
  const names = new Map();
  const nameOf = (id) => {
    if (!names.has(id)) names.set(id, (userById(id) || {}).display_name || 'Someone');
    return names.get(id);
  };
  return rows.map((r) => {
    let details = {};
    try { details = JSON.parse(r.details); } catch {}
    return { id: r.id, action: r.action, at: r.created_at, actor: r.actor_id ? { id: r.actor_id, name: nameOf(r.actor_id) } : null, target: r.target_id, details };
  });
}

// ---------- Mentions and notifications ----------

// "@bea" in a message: a mention, if that's someone who can see the channel. "@everyone"
// mentions everyone who can, from people allowed to. (A trailing dot is left off, so "hi
// @bea." still works.)
const MENTION_RE = /(^|[^\w@.])@([a-z0-9_.]{2,32})/gi;

function mentionsIn(text, c, member) {
  const ids = new Set();
  let everyone = false;
  let audience = null;
  for (const match of String(text || '').matchAll(MENTION_RE)) {
    let name = match[2].toLowerCase();
    if (name === 'everyone') {
      if (can(member, 'mentionEveryone')) everyone = true;
      continue;
    }
    for (;;) {
      const u = userByUsername(name);
      if (u) {
        audience ||= new Set(channelAudience(c));
        if (audience.has(u.id)) ids.add(u.id);
        break;
      }
      if (!name.endsWith('.') || name.length <= 2) break;
      name = name.slice(0, -1);
    }
  }
  return { ids: [...ids], everyone };
}

function setMentions(messageId, { ids, everyone }) {
  db.prepare('DELETE FROM message_mentions WHERE message_id = ?').run(messageId);
  const add = db.prepare('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)');
  for (const id of ids) add.run(messageId, id);
  if (everyone) add.run(messageId, '*');
}

const NOTIFY_LEVELS = ['all', 'mentions', 'none'];

function setNotify(spaceId, userId, level) {
  db.prepare('UPDATE space_members SET notify = ? WHERE space_id = ? AND user_id = ?').run(level, spaceId, userId);
}

function notifyLevel(spaceId, userId) {
  const r = db.prepare('SELECT notify FROM space_members WHERE space_id = ? AND user_id = ?').get(spaceId, userId);
  return r ? r.notify : 'none';
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

// Your spaces, each with its roles, what you can do there, and the channels you can see:
// who they're open to, what you can do in each, and how many unread messages each has for
// you (counted from when you joined, for channels you've never opened).
function spacesFor(userId) {
  const spaces = db.prepare(`
    SELECT s.id, s.name, s.owner_id, s.everyone_perms FROM spaces s
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
    (SELECT MAX(created_at) FROM messages msg WHERE msg.dm_id = c.id) AS last_at,
    (
      SELECT COUNT(DISTINCT msg.id) FROM messages msg JOIN message_mentions mm ON mm.message_id = msg.id
      WHERE msg.dm_id = c.id AND (mm.user_id = ? OR mm.user_id = '*') AND msg.author_id IS NOT ?
        AND msg.created_at > COALESCE((SELECT read_at FROM dm_reads r WHERE r.dm_id = c.id AND r.user_id = ?), m.joined_at)
    ) AS mentions
    FROM channels c JOIN space_members m ON m.space_id = c.space_id AND m.user_id = ?
  `).all(userId, userId, userId, userId, userId, userId);
  const byChannel = new Map(unread.map((r) => [r.id, r]));
  return spaces.map((s) => {
    const me = memberOf(s.id, userId);
    return {
      id: s.id,
      name: s.name,
      role: me.owner ? 'owner' : 'member',
      ownerId: s.owner_id,
      memberCount: db.prepare('SELECT COUNT(*) n FROM space_members WHERE space_id = ?').get(s.id).n,
      perms: permNames(me.perms),
      myRoles: me.roleIds,
      top: me.owner ? null : me.top, // null: above every role (the owner)
      timeoutUntil: me.timeoutUntil,
      notify: notifyLevel(s.id, userId),
      // Open reports, for its moderators.
      reports: canHandleReports(me)
        ? db.prepare('SELECT COUNT(*) n FROM reports WHERE space_id = ? AND resolved_at IS NULL').get(s.id).n : undefined,
      everyonePerms: permNames(s.everyone_perms),
      roles: rolesOf(s.id).map(roleJson),
      channels: channelsOf(s.id).map((c) => {
        const roles = channelRoles(c.id);
        const access = channelAccess(c, me, roles);
        if (!access.see) return null;
        return {
          id: c.id, name: c.name, kind: c.kind,
          private: Boolean(c.private), readonly: Boolean(c.readonly),
          seeRoles: roles.see, sendRoles: roles.send,
          can: access,
          unread: (byChannel.get(c.id) || {}).unread || 0,
          mentions: (byChannel.get(c.id) || {}).mentions || 0,
          lastAt: (byChannel.get(c.id) || {}).last_at || 0,
        };
      }).filter(Boolean),
    };
  });
}

module.exports = {
  NAME_MAX, MAX_CHANNELS, MAX_ROLES, PERMS, ALL_PERMS, permNames, permBits,
  channelName, spaceName, roleName, roleColor,
  createSpace, getSpace, renameSpace, setEveryonePerms, deleteSpace,
  memberOf, can, canManageRole, canManageMember, canModerate, canHandleReports, allowedPerms,
  isMember, memberIds, members, addMember, removeMember, shareSpace, coMembersOf,
  rolesOf, role, roleJson, createRole, updateRole, deleteRole, neighbour, swapRoles, giveRole, takeRole,
  channel, channelsOf, createChannel, renameChannel, deleteChannel, channelRoles, setChannelAccess, channelAccess, channelAudience,
  setTimeoutUntil, ban, unban, isBanned, bansOf, purgeMessages, log, logOf,
  mentionsIn, setMentions, NOTIFY_LEVELS, setNotify, notifyLevel,
  createInvite, inviteByCode, useInvite,
  spacesFor,
};
