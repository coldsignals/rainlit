'use strict';

// Conversations between two friends: their messages and files, and how far each
// person has read. When a conversation's saving is off, messages still pass
// between you, but only in memory (see "passing" below), never on disk.

const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const FILES_DIR = path.join(DATA_DIR, 'files');
fs.mkdirSync(FILES_DIR, { recursive: true });

// Pictures, videos and audio the app can show or play in place. Anything else is
// only ever offered as a download.
const SHOWABLE_TYPES = /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp3|ogg|wav|x-wav|wave|webm|mp4|x-m4a|aac|flac|x-flac))$/;

const pairOf = (x, y) => (x < y ? [x, y] : [y, x]);

function dmIdOf(x, y) {
  return pairOf(x, y).join(':');
}

function inDm(dmId, userId) {
  return String(dmId).split(':').includes(userId);
}

// The conversation between two people, made the first time it's needed.
function getDm(x, y) {
  const [a, b] = pairOf(x, y);
  const id = `${a}:${b}`;
  db.prepare('INSERT OR IGNORE INTO dms (id, user_a, user_b, save, created_at) VALUES (?, ?, ?, 1, ?)').run(id, a, b, Date.now());
  return db.prepare('SELECT * FROM dms WHERE id = ?').get(id);
}

function setSave(dmId, save) {
  db.prepare('UPDATE dms SET save = ? WHERE id = ?').run(save ? 1 : 0, dmId);
}

// ---------- Messages ----------

function fileUrl(id, name) {
  return `/files/${id}/${encodeURIComponent(name)}`;
}

function messageJson(r) {
  return {
    id: r.id,
    dm: r.dm_id,
    author: r.author_id,
    kind: r.kind,
    text: r.text,
    meta: r.meta ? JSON.parse(r.meta) : null,
    file: r.kind === 'file' ? { name: r.file_name, size: r.file_size, type: r.file_type, url: fileUrl(r.id, r.file_name) } : null,
    at: r.created_at,
    editedAt: r.edited_at || null,
    seq: r.rowid ?? null, // position in the saved history; null if it wasn't saved
    saved: r.rowid != null,
  };
}

function addMessage({ id, dm, author = null, kind, text = '', file = null, meta = null, at = Date.now() }) {
  db.prepare(`
    INSERT INTO messages (id, dm_id, author_id, kind, text, file_name, file_size, file_type, file_path, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, dm, author, kind, text, file ? file.name : null, file ? file.size : null, file ? file.type : null,
    file ? file.path : null, meta ? JSON.stringify(meta) : null, at);
  return messageJson(db.prepare('SELECT rowid, * FROM messages WHERE id = ?').get(id));
}

function getRow(id) {
  return db.prepare('SELECT rowid, * FROM messages WHERE id = ?').get(String(id)) || null;
}

function getMessage(id) {
  const r = getRow(id);
  return r ? withReactions([messageJson(r)])[0] : null;
}

// A page of history, oldest first. `before` is a seq from an earlier page.
function history(dmId, before, limit = 50) {
  const rows = before
    ? db.prepare('SELECT rowid, * FROM messages WHERE dm_id = ? AND rowid < ? ORDER BY rowid DESC LIMIT ?').all(dmId, before, limit + 1)
    : db.prepare('SELECT rowid, * FROM messages WHERE dm_id = ? ORDER BY rowid DESC LIMIT ?').all(dmId, limit + 1);
  return { messages: withReactions(rows.slice(0, limit).reverse().map(messageJson)), more: rows.length > limit };
}

// Everything after `after` (a seq), oldest first: what someone missed while disconnected.
function since(dmId, after, limit = 200) {
  return withReactions(db.prepare('SELECT rowid, * FROM messages WHERE dm_id = ? AND rowid > ? ORDER BY rowid ASC LIMIT ?')
    .all(dmId, after, limit).map(messageJson));
}

// Replaces a message or file with "removed", keeping who and when, and deletes the file itself.
function removeMessage(id) {
  const r = getRow(id);
  if (!r) return;
  const was = r.kind === 'file' ? 'file' : 'message';
  db.prepare(`
    UPDATE messages SET kind = 'removed', text = '', file_name = NULL, file_size = NULL, file_type = NULL,
      file_path = NULL, meta = ? WHERE id = ?
  `).run(JSON.stringify({ was }), id);
  if (r.file_path) fs.rm(path.join(FILES_DIR, r.file_path), { force: true }, () => {});
  db.prepare('DELETE FROM reactions WHERE message_id = ?').run(id);
}

// Changes what a text message says (its sender edited it).
function editMessage(id, text, at = Date.now()) {
  db.prepare('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, at, id);
}

// ---------- Reactions ----------

// The three quick reactions before someone has favourites of their own.
const DEFAULT_QUICK = ['👍', '❤️', '😄'];
const MAX_EMOJI_PER_MESSAGE = 20;

// Each message's reactions: [{ emoji, users: [ids] }], in the order they were first used.
function reactionsFor(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const rows = db.prepare(`SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).all(...ids);
  for (const r of rows) {
    const list = out.get(r.message_id) || [];
    let entry = list.find((e) => e.emoji === r.emoji);
    if (!entry) list.push((entry = { emoji: r.emoji, users: [] }));
    entry.users.push(r.user_id);
    out.set(r.message_id, list);
  }
  return out;
}

function withReactions(messages) {
  const map = reactionsFor(messages.filter((m) => m.seq).map((m) => m.id));
  for (const m of messages) m.reactions = map.get(m.id) || [];
  return messages;
}

const reactionsOf = (messageId) => reactionsFor([messageId]).get(messageId) || [];

// false if the message already has as many different emoji as it may.
function react(messageId, userId, emoji, on) {
  if (!on) {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(messageId, userId, emoji);
    return true;
  }
  const kinds = db.prepare('SELECT COUNT(DISTINCT emoji) n, SUM(emoji = ?) mine FROM reactions WHERE message_id = ?').get(emoji, messageId);
  if (kinds.n >= MAX_EMOJI_PER_MESSAGE && !kinds.mine) return false;
  db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)').run(messageId, userId, emoji, Date.now());
  return true;
}

// Someone's three quick reactions: the ones they use most, then the defaults.
function quickReactions(userId) {
  const top = db.prepare(`
    SELECT emoji FROM reactions WHERE user_id = ? GROUP BY emoji ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT 3
  `).all(userId).map((r) => r.emoji);
  for (const e of DEFAULT_QUICK) if (top.length < 3 && !top.includes(e)) top.push(e);
  return top;
}

// ---------- Messages that aren't being saved ----------
//
// Kept in memory for a day, only so their sender can still remove them.

const passingById = new Map();

function passing({ id, dm, author = null, kind, text = '', meta = null, at = Date.now() }) {
  passingById.set(id, { dm, author, kind, at });
  return { id, dm, author, kind, text, meta, file: null, at, seq: null, saved: false };
}

function passingMessage(id) {
  return passingById.get(String(id)) || null;
}

function forgetPassing(id) {
  passingById.delete(String(id));
}

setInterval(() => {
  const old = Date.now() - 86_400_000;
  for (const [id, m] of passingById) if (m.at < old) passingById.delete(id);
}, 3600_000).unref();

// ---------- Reading ----------

function markRead(dmId, userId, at) {
  db.prepare(`
    INSERT INTO dm_reads (dm_id, user_id, read_at) VALUES (?, ?, ?)
    ON CONFLICT (dm_id, user_id) DO UPDATE SET read_at = MAX(read_at, excluded.read_at)
  `).run(dmId, userId, at);
}

function readAt(dmId, userId) {
  const r = db.prepare('SELECT read_at FROM dm_reads WHERE dm_id = ? AND user_id = ?').get(dmId, userId);
  return r ? r.read_at : 0;
}

// For each of your conversations: whether it's saving, how many unread messages
// from them, and when the last message was. Keyed by the other person's id.
function summariesFor(userId) {
  const rows = db.prepare(`
    SELECT d.id, d.save, COALESCE(r.read_at, 0) AS read_at,
      (SELECT COUNT(*) FROM messages m
        WHERE m.dm_id = d.id AND m.author_id IS NOT ? AND m.kind IN ('text', 'file', 'gif')
          AND m.created_at > COALESCE(r.read_at, 0)) AS unread,
      (SELECT MAX(created_at) FROM messages m WHERE m.dm_id = d.id) AS last_at
    FROM dms d LEFT JOIN dm_reads r ON r.dm_id = d.id AND r.user_id = ?
    WHERE d.user_a = ? OR d.user_b = ?
  `).all(userId, userId, userId, userId);
  const out = {};
  for (const r of rows) {
    const other = r.id.split(':').find((id) => id !== userId);
    out[other] = { id: r.id, save: Boolean(r.save), unread: r.unread, readAt: r.read_at, lastAt: r.last_at || 0 };
  }
  return out;
}

module.exports = {
  FILES_DIR, SHOWABLE_TYPES, dmIdOf, inDm, getDm, setSave,
  addMessage, getRow, getMessage, history, since, removeMessage, editMessage, react, reactionsOf, quickReactions,
  passing, passingMessage, forgetPassing, markRead, readAt, summariesFor,
};
