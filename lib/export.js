'use strict';

// Your data, to take with you (GET /api/me/export): a .zip of what's yours on this server. Your
// account and profile (its picture too), every message you've sent (your notes too), the reactions
// you've given, your friends and who you've blocked, your spaces and groups, your homepage with its
// pictures and songs, what you've written on other people's pages, your pet and its room, the
// feedback you've sent, and a list of your files. The files themselves are saved one by one, from
// Your files: all of them at once could be gigabytes. What other people sent isn't in it: that's
// theirs.

const zlib = require('zlib');
const fs = require('fs');
const { db } = require('./db');
const blobs = require('./blobs');
const spaces = require('./spaces');
const homepages = require('./homepages');
const pets = require('./pets');

// ---------- A .zip, written out whole ----------
// (Stored as they are, or squeezed: pictures and songs are already as small as they'll get.)

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function zip(entries, at = new Date()) {
  const { time, date } = dosTime(at);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const squeezed = e.store ? null : zlib.deflateRawSync(raw, { level: 9 });
    const deflate = Boolean(squeezed && squeezed.length < raw.length);
    const body = deflate ? squeezed : raw;
    const crc = zlib.crc32(raw) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // (names in UTF-8)
    head.writeUInt16LE(deflate ? 8 : 0, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    parts.push(head, name, body);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(deflate ? 8 : 0, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + body.length;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// ---------- What's in it ----------

const when = (ms) => (ms ? new Date(ms).toISOString() : null);
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const ext = (name) => (/\.([a-z0-9]{2,5})$/i.exec(name || '') || [])[1] || 'bin';

function who(id, cache) {
  if (!cache.has(id)) {
    const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(id);
    cache.set(id, u ? { username: u.username, name: u.display_name } : { username: null, name: 'someone whose account is gone' });
  }
  return cache.get(id);
}

// Where a message was: your notes, a DM with someone, a group, or a channel in a space.
function whereOf(dmId, me, cache) {
  if (String(dmId).includes(':')) {
    const [a, b] = String(dmId).split(':');
    if (a === b) return { kind: 'notes' };
    return { kind: 'dm', with: who(a === me ? b : a, cache) };
  }
  const channel = spaces.channel(dmId);
  const space = channel && spaces.getSpace(channel.space_id);
  if (!space) return { kind: 'channel', gone: true };
  if (space.kind === 'group') return { kind: 'group', group: space.name || null, groupId: space.id };
  return { kind: 'channel', space: space.name, spaceId: space.id, channel: channel.name };
}

async function build(userId) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const cache = new Map();
  const files = [];
  const entries = [];
  const put = (name, value) => entries.push({ name, data: `${JSON.stringify(value, null, 2)}\n` });

  // Your account.
  const badges = db.prepare('SELECT badge, given_at FROM user_badges WHERE user_id = ?').all(userId).map((b) => ({ badge: b.badge, given: when(b.given_at) }));
  const devices = db.prepare('SELECT created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC').all(userId).map((s) => ({ signedIn: when(s.created_at), lastUsed: when(s.last_seen) }));
  const tips = db.prepare('SELECT cents, at FROM tips WHERE user_id = ? ORDER BY at').all(userId).map((t) => ({ amount: `$${(t.cents / 100).toFixed(2)}`, at: when(t.at) }));
  put('account.json', {
    username: u.username, displayName: u.display_name, email: u.email, emailConfirmed: when(u.email_confirmed_at),
    joined: when(u.created_at), status: u.status_text, presence: u.presence, theme: u.theme || null,
    birthday: u.birthday ? { day: u.birthday, celebratedWhereOthersSee: Boolean(u.birthday_shown), timeZone: u.tz || null } : null,
    card: json(u.card), over18Since: when(u.adult_at), badges,
    glow: u.supporter_since ? { plan: u.supporter_plan || null, since: when(u.supporter_since), until: when(u.supporter_until), cancels: Boolean(u.supporter_cancels) } : null,
    tips, signedInDevices: devices,
  });
  if (u.avatar) {
    const src = await blobs.localCopy('avatars', u.avatar);
    if (src) entries.push({ name: `profile-picture.${ext(u.avatar)}`, data: fs.readFileSync(src), store: true });
  }

  // Your friends (and requests), and who you've blocked.
  const friends = db.prepare('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?').all(userId, userId).map((f) => ({
    ...who(f.user_a === userId ? f.user_b : f.user_a, cache),
    status: f.status === 'accepted' ? 'friends' : f.requested_by === userId ? 'you asked' : 'they asked',
    since: when(f.created_at),
  }));
  const blocked = db.prepare('SELECT blocked_id, created_at FROM blocks WHERE user_id = ?').all(userId).map((b) => ({ ...who(b.blocked_id, cache), since: when(b.created_at) }));
  put('friends.json', { friends, blocked });

  // Your spaces and groups.
  put('spaces.json', db.prepare('SELECT s.id, s.name, s.kind, m.role, m.joined_at FROM space_members m JOIN spaces s ON s.id = m.space_id WHERE m.user_id = ? ORDER BY m.joined_at').all(userId).map((s) => {
    const me = spaces.memberOf(s.id, userId);
    return {
      kind: s.kind === 'group' ? 'group' : 'space', name: s.name || null, id: s.id, joined: when(s.joined_at),
      ...(s.kind === 'group' ? {} : { owner: s.role === 'owner', roles: (me ? me.roleIds : []).map((id) => (spaces.role(id) || {}).name).filter(Boolean) }),
    };
  }));

  // Everything you've sent, oldest first, and your reactions.
  const messages = db.prepare(`
    SELECT id, dm_id, kind, text, file_name, file_size, file_type, meta, reply_to, created_at, edited_at FROM messages
    WHERE author_id = ? AND kind IN ('text', 'file', 'gif') ORDER BY created_at, rowid
  `).all(userId).map((m) => {
    const meta = m.kind === 'gif' ? json(m.meta) : null;
    const out = { id: m.id, at: when(m.created_at), where: whereOf(m.dm_id, userId, cache), text: m.text || '' };
    if (m.kind === 'file') {
      out.file = { name: m.file_name, size: m.file_size, type: m.file_type };
      files.push({ name: m.file_name, size: m.file_size, type: m.file_type, sent: out.at, where: out.where });
    }
    if (meta) out.gif = { title: meta.title || '', url: meta.mp4 || meta.img || '' };
    if (m.reply_to) out.replyTo = m.reply_to;
    if (m.edited_at) out.edited = when(m.edited_at);
    return out;
  });
  put('messages.json', messages);
  put('reactions.json', db.prepare('SELECT message_id, emoji, created_at FROM reactions WHERE user_id = ? ORDER BY created_at').all(userId)
    .map((r) => ({ message: r.message_id, emoji: r.emoji, at: when(r.created_at) })));
  put('files.json', { note: 'Your files themselves are saved from Your profile, then Your files, in Rainlit.', files });

  // Your homepage (its pictures, videos and songs beside it), and what you've written on other people's.
  const page = homepages.get(userId);
  const pageFiles = db.prepare('SELECT id, kind, file, bytes, created_at FROM homepage_files WHERE user_id = ? ORDER BY created_at').all(userId);
  for (const f of pageFiles) {
    const src = await blobs.localCopy('homepages', f.file);
    if (src) entries.push({ name: `homepage/${f.file}`, data: fs.readFileSync(src), store: true });
  }
  put('homepage.json', {
    page: page.doc, visibility: page.visibility, views: page.views, updated: when(page.updatedAt),
    files: pageFiles.map((f) => ({ id: f.id, kind: f.kind, file: `homepage/${f.file}`, bytes: f.bytes, added: when(f.created_at) })),
    answered: db.prepare('SELECT text, answer, created_at, answered_at FROM questions WHERE owner_id = ? AND answer IS NOT NULL ORDER BY answered_at').all(userId)
      .map((q) => ({ question: q.text, asked: when(q.created_at), answer: q.answer, answered: when(q.answered_at) })),
    yourGuestbookEntries: db.prepare('SELECT owner_id, text, created_at FROM guestbook WHERE author_id = ? ORDER BY created_at').all(userId)
      .map((g) => ({ on: who(g.owner_id, cache), text: g.text, at: when(g.created_at) })),
    yourQuestions: db.prepare('SELECT owner_id, text, anonymous, answer, created_at, answered_at FROM questions WHERE asker_id = ? ORDER BY created_at').all(userId)
      .map((q) => ({ to: who(q.owner_id, cache), text: q.text, anonymous: Boolean(q.anonymous), asked: when(q.created_at), answer: q.answer || null, answered: when(q.answered_at) })),
  });

  // Your pet, and its room.
  const pet = pets.get(userId);
  put('pet.json', { pet: pet ? { ...pet, since: when(pet.since), fedAt: when(pet.fedAt) } : null, room: json(u.pet_room) });

  // The feedback you've sent, and the replies.
  put('feedback.json', db.prepare('SELECT kind, text, created_at, reply, replied_at, done_at FROM feedback WHERE user_id = ? ORDER BY created_at').all(userId)
    .map((f) => ({ kind: f.kind, text: f.text, sent: when(f.created_at), reply: f.reply || null, replied: when(f.replied_at), dealtWith: when(f.done_at) })));

  const day = new Date().toISOString().slice(0, 10);
  entries.unshift({ name: 'README.txt', data: [
    `Your Rainlit data, @${u.username}, as it was on ${day}.`,
    '',
    'account.json      your account and profile (and profile-picture, if you have one)',
    'friends.json      your friends, friend requests, and who you\'ve blocked',
    'spaces.json       the spaces and groups you\'re in, and your roles',
    'messages.json     every message you\'ve sent, oldest first, and where (your notes too)',
    'reactions.json    the reactions you\'ve given',
    'files.json        the files you\'ve sent (save the files themselves from Your files, in Rainlit)',
    'homepage.json     your homepage (its pictures, videos and songs are in homepage/), the questions you\'ve',
    '                  answered, and what you\'ve written on other people\'s pages',
    'pet.json          your pet, and its room',
    'feedback.json     the feedback you\'ve sent, and the replies',
    '',
    'Times are in UTC. What other people sent isn\'t here: that\'s theirs.',
    '',
  ].join('\r\n') });
  return { name: `rainlit-${u.username}-${day}.zip`, buf: zip(entries) };
}

module.exports = { build, zip };
