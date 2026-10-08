'use strict';

// Soundboards: short sounds anyone in a call or a voice channel can play for everyone there,
// like Discord's. Rainlit has a few of its own (BUILT_IN: each app makes them as it plays them,
// so they aren't files), and each space can have its own (up to 24), uploaded by people allowed
// to manage them. Its members can play those in any call or voice channel, free (on Discord,
// using a server's sounds elsewhere takes Nitro).
//
// Playing one only passes it on (lib/realtime.js). Each app in the call fetches it from
// /sounds/<id>, which anyone can load (whoever's in the call hears it, even if they're not in its
// space), and plays it through a limiter, and stops it at MAX_MS whatever its file says, so a
// sound can't be made too loud or too long.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');
const blobs = require('./blobs');
const { cleanEmoji } = require('./emoji');
const { oneLine } = require('./people');

const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
fs.mkdirSync(SOUNDS_DIR, { recursive: true });

const MAX_PER_SPACE = 24;
const MAX_BYTES = 1024 * 1024;
const MAX_MS = 5200; // ("up to 5 seconds", and a little over for the quiet some files start or end with)
const NAME_MAX = 32;
const TYPES = { mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', weba: 'audio/webm' };

// Rainlit's own, made by each app as it plays them (public/app.js: SOUNDBOARD).
const BUILT_IN = new Set(['tada', 'drums', 'trombone', 'boop', 'crickets', 'applause', 'airhorn', 'rain']);

class SoundError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// What kind of sound a file really is, from its first bytes (or null). (Homepages' songs too.)
function audioKind(buf) {
  if (buf.length < 12) return null;
  const at = (a, b) => buf.subarray(a, b).toString('latin1');
  if (at(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (at(0, 4) === 'OggS') return 'ogg';
  if (at(0, 4) === 'fLaC') return 'flac';
  if (at(0, 4) === 'RIFF' && at(8, 12) === 'WAVE') return 'wav';
  if (at(4, 8) === 'ftyp') return 'm4a';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'weba';
  return null;
}

const nameOf = (input) => oneLine(input, NAME_MAX) || null;

// The emoji shown with a sound: one, or null for none ('' or nothing). Anything else is a mistake.
function emojiOf(input) {
  if (input == null || input === '') return null;
  const e = cleanEmoji(input);
  if (!e) throw new SoundError("That isn't an emoji.");
  return e;
}

const json = (r) => ({ id: r.id, name: r.name, emoji: r.emoji || null, ms: r.ms, url: `/sounds/${r.id}` });

function list(spaceId) {
  return db.prepare('SELECT * FROM space_sounds WHERE space_id = ? ORDER BY created_at, rowid').all(spaceId).map(json);
}

const byId = (id) => db.prepare('SELECT * FROM space_sounds WHERE id = ?').get(String(id)) || null;

// (ms: how long it is, which the app measured when it played it, before uploading it.)
function add(spaceId, userId, { name, emoji, ms }, buf) {
  const clean = nameOf(name);
  if (!clean) throw new SoundError('Give the sound a name.');
  const kind = audioKind(buf);
  if (!kind) throw new SoundError('Sounds can be MP3, OGG, WAV, M4A, FLAC or WebM files.');
  if (buf.length > MAX_BYTES) throw new SoundError('Sounds can be up to 1 MB.', 413);
  const length = Math.round(Number(ms));
  if (!(length > 0)) throw new SoundError("Couldn't tell how long that sound is. Try another file.");
  if (length > MAX_MS) throw new SoundError('Sounds can be up to 5 seconds long.');
  const mark = emojiOf(emoji);
  if (db.prepare('SELECT COUNT(*) n FROM space_sounds WHERE space_id = ?').get(spaceId).n >= MAX_PER_SPACE) {
    throw new SoundError(`A space can have up to ${MAX_PER_SPACE} sounds. Delete one to make room.`, 409);
  }
  const id = crypto.randomBytes(12).toString('hex');
  const file = `${id}.${kind}`;
  fs.writeFileSync(path.join(SOUNDS_DIR, file), buf);
  db.prepare('INSERT INTO space_sounds (id, space_id, name, emoji, file, ms, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, spaceId, clean, mark, file, length, userId, Date.now());
  blobs.offload('sounds', file, TYPES[kind]); // (to R2, if it's set up)
  return json(byId(id));
}

// A new name, or emoji, or both. ({ was }: its name before.)
function edit(spaceId, id, { name, emoji } = {}) {
  const s = byId(id);
  if (!s || s.space_id !== spaceId) throw new SoundError("That sound isn't here any more.", 404);
  const clean = name === undefined ? s.name : nameOf(name);
  if (!clean) throw new SoundError('Give the sound a name.');
  const mark = emoji === undefined ? s.emoji : emojiOf(emoji);
  db.prepare('UPDATE space_sounds SET name = ?, emoji = ? WHERE id = ?').run(clean, mark, id);
  return { was: s.name, sound: json(byId(id)) };
}

function remove(spaceId, id) {
  const s = byId(id);
  if (!s || s.space_id !== spaceId) throw new SoundError("That sound isn't here any more.", 404);
  db.prepare('DELETE FROM space_sounds WHERE id = ?').run(id);
  blobs.remove('sounds', s.file);
  return s;
}

// A space that's going: its sounds' files go too (the rows go with the space).
function filesOf(spaceId) {
  return db.prepare('SELECT file FROM space_sounds WHERE space_id = ?').all(spaceId).map((r) => r.file);
}
function removeFiles(files) {
  for (const f of files) blobs.remove('sounds', f);
}

// A sound someone can play: one of Rainlit's, or one from a space they're in. What everyone in
// the call is told about it, or null.
function playable(value, userId) {
  const v = String(value || '');
  if (BUILT_IN.has(v)) return { id: v };
  const s = /^[a-f0-9]{24}$/.test(v) && byId(v);
  if (!s || !db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(s.space_id, userId)) return null;
  return json(s);
}

module.exports = { SOUNDS_DIR, MAX_PER_SPACE, MAX_BYTES, MAX_MS, TYPES, BUILT_IN, SoundError, audioKind, list, byId, add, edit, remove, filesOf, removeFiles, playable };
