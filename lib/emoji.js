'use strict';

// Custom emoji: each space can have its own (up to 50), uploaded by people allowed to manage
// them. Its members can use them anywhere they chat, free (on Discord, using a server's emoji
// elsewhere takes Nitro).
//
// In a message, one is written <:name:id> (<a:name:id> if it moves), like Discord. Its picture
// is at /emoji/<id>, which anyone can load: whoever sees a message sees its emoji, even if
// they're not in the space it's from. (If the emoji's deleted, it shows as :name:.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');
const { imageKind, animated } = require('./images');

const EMOJI_DIR = path.join(DATA_DIR, 'emoji');
fs.mkdirSync(EMOJI_DIR, { recursive: true });

const MAX_PER_SPACE = 50;
const MAX_BYTES = 256 * 1024;
const TOKEN_RE = /^<(a?):([A-Za-z0-9_]{2,32}):([a-f0-9]{8,32})>$/;

class EmojiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// A name for an emoji (letters, numbers and underscores), or null.
function nameOf(input) {
  const s = String(input || '').trim().replace(/^:+|:+$/g, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z0-9_]{2,32}$/.test(s) ? s : null;
}

const json = (r) => ({ id: r.id, name: r.name, animated: Boolean(r.animated), url: `/emoji/${r.id}` });

function list(spaceId) {
  return db.prepare('SELECT * FROM space_emoji WHERE space_id = ? ORDER BY created_at, rowid').all(spaceId).map(json);
}

const byId = (id) => db.prepare('SELECT * FROM space_emoji WHERE id = ?').get(String(id)) || null;

function add(spaceId, userId, name, buf) {
  const clean = nameOf(name);
  if (!clean) throw new EmojiError('Emoji names are 2 to 32 letters, numbers or underscores.');
  const kind = imageKind(buf);
  if (!kind) throw new EmojiError('Emoji can be PNG, GIF, WebP or JPG pictures.');
  if (buf.length > MAX_BYTES) throw new EmojiError('Emoji can be up to 256 KB.', 413);
  if (db.prepare('SELECT COUNT(*) n FROM space_emoji WHERE space_id = ?').get(spaceId).n >= MAX_PER_SPACE) {
    throw new EmojiError(`A space can have up to ${MAX_PER_SPACE} emoji. Delete one to make room.`, 409);
  }
  if (db.prepare('SELECT 1 FROM space_emoji WHERE space_id = ? AND name = ? COLLATE NOCASE').get(spaceId, clean)) {
    throw new EmojiError(`There's already a :${clean}: here.`, 409);
  }
  const id = crypto.randomBytes(12).toString('hex');
  const file = `${id}.${kind}`;
  fs.writeFileSync(path.join(EMOJI_DIR, file), buf);
  db.prepare('INSERT INTO space_emoji (id, space_id, name, file, animated, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, spaceId, clean, file, animated(buf, kind) ? 1 : 0, userId, Date.now());
  return json(byId(id));
}

function rename(spaceId, id, name) {
  const e = byId(id);
  if (!e || e.space_id !== spaceId) throw new EmojiError("That emoji isn't here any more.", 404);
  const clean = nameOf(name);
  if (!clean) throw new EmojiError('Emoji names are 2 to 32 letters, numbers or underscores.');
  if (db.prepare('SELECT 1 FROM space_emoji WHERE space_id = ? AND name = ? COLLATE NOCASE AND id != ?').get(spaceId, clean, id)) {
    throw new EmojiError(`There's already a :${clean}: here.`, 409);
  }
  db.prepare('UPDATE space_emoji SET name = ? WHERE id = ?').run(clean, id);
  return { was: e.name, emoji: json(byId(id)) };
}

function remove(spaceId, id) {
  const e = byId(id);
  if (!e || e.space_id !== spaceId) throw new EmojiError("That emoji isn't here any more.", 404);
  db.prepare('DELETE FROM space_emoji WHERE id = ?').run(id);
  fs.rm(path.join(EMOJI_DIR, e.file), { force: true }, () => {});
  return e;
}

// A space that's going: its emoji's pictures go too (the rows go with the space).
function filesOf(spaceId) {
  return db.prepare('SELECT file FROM space_emoji WHERE space_id = ?').all(spaceId).map((r) => r.file);
}
function removeFiles(files) {
  for (const f of files) fs.rm(path.join(EMOJI_DIR, f), { force: true }, () => {});
}

// A reaction made of a custom emoji: the emoji, written the way it is now, if this person can
// use it (they're in its space). Otherwise null.
function tokenFor(value, userId) {
  const m = TOKEN_RE.exec(String(value || ''));
  const e = m && byId(m[3]);
  if (!e || !db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(e.space_id, userId)) return null;
  return `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
}

module.exports = { EMOJI_DIR, MAX_PER_SPACE, EmojiError, nameOf, list, byId, add, rename, remove, filesOf, removeFiles, tokenFor };
