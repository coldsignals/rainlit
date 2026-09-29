'use strict';

// Homepages: everyone's own page, like the personal homepages of the old web (GeoCities,
// Angelfire) or a Strawpage. A background, and pieces put anywhere on it: text in fun fonts,
// pictures and GIFs, stickers, tape and paper. The little profile card stays as the quick look;
// the homepage is the whole page, at rainlit.app/@name.
//
// Shelves show off favourite games, music and shows, by their covers (uploaded, or found from a
// link to them, like a Steam page). 88x31 buttons, the little badges old sites linked to each
// other with, are made right on the page.
//
// Old-web touches: a visitor counter, a guestbook visitors sign (they can delete what they wrote;
// the page's owner can delete anything in it), a music player that plays the owner's song when a
// visitor presses play, and an "ask me anything" box (visitors ask, anonymously if the owner lets
// them, and what the owner answers shows on the page).
//
// A page is built from pieces, not code. It's kept as data, each piece checked against what
// that kind of piece can have (clean() below), and the app draws it (public/homepage.js), so
// nothing on a page can run a script or load anything from anywhere else. Its pictures are
// uploaded here.
//
// Who can see one is up to its owner: their friends, people in their spaces too (like the
// profile card, and to start with), or anyone with the link, even without a Rainlit account.
// Whoever runs the server can see them all, to act on reports.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');
const { imageKind, animated } = require('./images');
const { scrubData } = require('./scrub');
const blobs = require('./blobs');
const people = require('./people');
const spaces = require('./spaces');
const safety = require('./safety');
const outbound = require('./outbound');

const FILES_DIR = path.join(DATA_DIR, 'homepages');
fs.mkdirSync(FILES_DIR, { recursive: true });

const WIDTH = 800; // A page is this wide ("best viewed at 800x600"); smaller screens scale it down.
const HEIGHT_MIN = 600;
const HEIGHT_MAX = 6000;
const PIECES_MAX = 250;
const IMAGE_MAX = 5 * 1024 * 1024;
const AUDIO_MAX = 10 * 1024 * 1024;
const FILES_MB = 40; // everyone's pictures and songs, together
const GUESTBOOK_MAX = 300; // characters in an entry
const GUESTBOOK_KEEP = 500; // entries a guestbook keeps (the newest)
const QUESTION_MAX = 300; // characters in a question
const ANSWER_MAX = 1000; // ...and in its answer
const WAITING_KEEP = 200; // questions waiting for an answer that an owner keeps (the newest)
const ANSWERED_KEEP = 500; // answered ones they keep (the newest answers)
const VISIBILITY = ['friends', 'spaces', 'everyone'];

// What each kind of piece can be. public/homepage.js draws them, and has the same lists.
const FONTS = ['rainlit', 'times', 'comic', 'pixel', 'terminal', 'tiny', 'hand', 'script', 'typewriter', 'gothic', 'neon', 'bubble', 'spooky', 'marker'];
const EFFECTS = ['none', 'shadow', 'outline', 'glow', 'rainbow', 'blink', 'marquee', 'wave'];
const BOXES = ['none', 'note', 'label', 'box', 'highlight', 'hazard', 'bubble'];
const ALIGN = ['left', 'center', 'right'];
const FRAMES = ['none', 'photo', 'rounded', 'circle', 'stamp', 'window', 'sticker', 'heart'];
const TAPES = ['plain', 'stripes', 'dots', 'checks'];
const PAPERS = ['lined', 'grid', 'dotted', 'plain', 'sticky', 'kraft', 'torn'];
const ME_STYLES = ['card', 'sticker', 'plain'];
const COUNTER_STYLES = ['odometer', 'led', 'plain'];
const GUESTBOOK_STYLES = ['paper', 'retro', 'dark'];
const ASK_STYLES = ['paper', 'retro', 'dark'];
const MUSIC_STYLES = ['tunebox', 'cassette', 'plain'];
const SHELF_STYLES = ['wood', 'glass', 'pixel', 'white'];
const BUTTON_STYLES = ['bevel', 'shiny', 'stripes', 'dark'];
const SHELF_MAX = 8; // covers on a shelf
const PATTERNS = ['dots', 'stripes', 'checks', 'gingham', 'grid', 'hearts', 'stars', 'flowers', 'zigzag', 'clouds'];
const SKIES = ['none', 'rain', 'snow', 'sparkles', 'hearts'];

class HomepageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------- Checking a page ----------

const num = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n)) * 10) / 10 : dflt;
};
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const color = (v, dflt) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : dflt);
// Text as typed, lines and all, without invisible control characters.
const words = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max);
const oneLine = (v, max) => words(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);

// A link somewhere else on the web (https:// added if it's left off), or ''.
function link(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 500) return '';
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return '';
  }
  return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.') ? u.href : '';
}

// An emoji (as a sticker): one, however many characters it's made of.
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|‍|️|⃣|[\u{1F1E6}-\u{1F1FF}])+$/u;

const KINDS = {
  text(p, q) {
    q.text = words(p.text, 1000);
    if (!q.text.trim()) return false;
    q.font = pick(p.font, FONTS, 'rainlit');
    q.size = num(p.size, 8, 240, 24);
    q.color = color(p.color, '#2b2233');
    q.c2 = color(p.c2, '#fff59d'); // (its box: a sticky note, a label...)
    q.c3 = color(p.c3, '#ff7eb6'); // (its effect: a shadow, a glow...)
    q.fx = pick(p.fx, EFFECTS, 'none');
    q.box = pick(p.box, BOXES, 'none');
    q.align = pick(p.align, ALIGN, 'left');
    q.bold = Boolean(p.bold);
    q.italic = Boolean(p.italic);
    q.href = link(p.href);
    return true;
  },
  image(p, q, ctx) {
    if (ctx.files.get(p.file) !== 'image') return false;
    q.file = p.file;
    q.frame = pick(p.frame, FRAMES, 'none');
    q.caption = oneLine(p.caption, 60);
    q.href = link(p.href);
    return true;
  },
  sticker(p, q) {
    q.set = pick(p.set, ['pixel', 'emoji', 'custom'], null);
    if (q.set === 'pixel') {
      if (!/^[a-z0-9-]{1,24}$/.test(String(p.name))) return false;
      q.name = p.name;
    } else if (q.set === 'emoji') {
      const e = String(p.emoji || '');
      if (e.length > 32 || !EMOJI_RE.test(e)) return false;
      q.emoji = e;
    } else if (q.set === 'custom') {
      // One of a space's emoji: its picture loads for anyone (see lib/emoji.js).
      if (!/^[a-f0-9]{8,32}$/.test(String(p.emoji))) return false;
      q.emoji = p.emoji;
      q.name = /^[A-Za-z0-9_]{2,32}$/.test(String(p.name)) ? p.name : 'emoji';
    } else {
      return false;
    }
    q.outline = p.outline !== false;
    q.href = link(p.href);
    return true;
  },
  tape(p, q) {
    q.style = pick(p.style, TAPES, 'plain');
    q.color = color(p.color, '#f4a9c8');
    return true;
  },
  paper(p, q) {
    q.style = pick(p.style, PAPERS, 'lined');
    q.color = color(p.color, '#fffdf6');
    return true;
  },
  // The owner: their picture, name and status, as they are now.
  me(p, q) {
    q.style = pick(p.style, ME_STYLES, 'card');
    q.color = color(p.color, '#ffffff');
    q.font = pick(p.font, FONTS, 'rainlit');
    return true;
  },
  // How many visits the page has had.
  counter(p, q) {
    q.style = pick(p.style, COUNTER_STYLES, 'odometer');
    q.label = oneLine(p.label ?? 'visitors', 40);
    q.color = color(p.color, '#39ff6a');
    return true;
  },
  // What visitors wrote (the entries themselves are kept apart: see "The guestbook" below).
  guestbook(p, q) {
    q.style = pick(p.style, GUESTBOOK_STYLES, 'paper');
    q.title = oneLine(p.title ?? 'sign my guestbook!', 40);
    q.color = color(p.color, '#fffdf6');
    q.font = pick(p.font, FONTS, 'hand');
    return true;
  },
  // An "ask me anything" box: questions visitors asked, and the owner's answers. Asking
  // anonymously is up to the owner (the questions are kept apart: see "Questions" below).
  ask(p, q) {
    q.style = pick(p.style, ASK_STYLES, 'paper');
    q.title = oneLine(p.title ?? 'ask me anything!', 40);
    q.color = color(p.color, '#fffdf6');
    q.font = pick(p.font, FONTS, 'hand');
    q.anon = p.anon !== false;
    return true;
  },
  // Covers standing on a shelf, each with a name and maybe a link.
  shelf(p, q, ctx) {
    q.style = pick(p.style, SHELF_STYLES, 'wood');
    q.items = (Array.isArray(p.items) ? p.items : []).filter((it) => it && ctx.files.get(it.file) === 'image').slice(0, SHELF_MAX)
      .map((it) => ({ file: it.file, title: oneLine(it.title, 60), href: link(it.href) }));
    q.labels = p.labels !== false;
    return true;
  },
  // An 88x31 button: a few words (two lines at most), maybe a pixel sticker, and a link.
  button(p, q) {
    q.text = words(p.text, 40).split('\n').slice(0, 2).join('\n');
    q.icon = /^[a-z0-9-]{1,24}$/.test(String(p.icon || '')) ? p.icon : '';
    if (!q.text.trim() && !q.icon) return false;
    q.style = pick(p.style, BUTTON_STYLES, 'bevel');
    q.c1 = color(p.c1, '#000080');
    q.c2 = color(p.c2, '#ffffff');
    q.font = pick(p.font, FONTS, 'tiny');
    q.href = link(p.href);
    return true;
  },
  // A song of the owner's, for visitors to play (it never plays by itself).
  music(p, q, ctx) {
    if (ctx.files.get(p.file) !== 'audio') return false;
    q.file = p.file;
    q.title = oneLine(p.title, 80);
    q.style = pick(p.style, MUSIC_STYLES, 'tunebox');
    q.color = color(p.color, '#a57bff');
    return true;
  },
};

function cleanBackground(b, ctx) {
  b = b && typeof b === 'object' ? b : {};
  const out = {
    kind: pick(b.kind, ['color', 'pattern', 'image'], 'pattern'),
    c1: color(b.c1, '#1d2440'),
    c2: color(b.c2, '#2b3560'),
    pattern: pick(b.pattern, PATTERNS, 'stars'),
    sky: pick(b.sky, SKIES, 'none'),
  };
  if (out.kind === 'image') {
    if (ctx.files.get(b.file) === 'image') Object.assign(out, { file: b.file, fit: pick(b.fit, ['tile', 'cover'], 'cover') });
    else out.kind = 'pattern';
  }
  return out;
}

// A page as it's kept: only what each piece can have, in the order they're stacked (the last is
// on top). Pictures must be the owner's own.
function clean(doc, ownerId) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const ctx = { files: filesOfKind(ownerId) }; // id -> image | audio
  const pieces = [];
  const ids = new Set();
  for (const p of Array.isArray(d.pieces) ? d.pieces.slice(0, PIECES_MAX) : []) {
    if (!p || typeof p !== 'object' || !Object.hasOwn(KINDS, p.t)) continue;
    let id = typeof p.id === 'string' && /^[A-Za-z0-9]{1,16}$/.test(p.id) ? p.id : '';
    while (!id || ids.has(id)) id = crypto.randomBytes(4).toString('hex');
    ids.add(id);
    const q = {
      id, t: p.t,
      x: num(p.x, -WIDTH / 2, WIDTH * 1.5, 0), y: num(p.y, -200, HEIGHT_MAX, 0),
      w: num(p.w, 8, 2400, 120), h: num(p.h, 8, 3000, 120), r: num(p.r, -360, 360, 0),
    };
    if (KINDS[p.t](p, q, ctx)) pieces.push(q);
  }
  return {
    v: 1,
    title: oneLine(d.title, 60),
    height: num(d.height, HEIGHT_MIN, HEIGHT_MAX, 1400),
    bg: cleanBackground(d.bg, ctx),
    pieces,
  };
}

// ---------- Pages ----------

// Someone's page: { doc (null if they haven't made one yet), visibility, views, updatedAt }.
function get(userId) {
  const r = db.prepare('SELECT * FROM homepages WHERE user_id = ?').get(userId);
  let doc = null;
  if (r && r.doc) {
    try { doc = JSON.parse(r.doc); } catch {}
  }
  return { doc, visibility: r ? r.visibility : 'spaces', views: r ? r.views : 0, updatedAt: r ? r.updated_at : 0 };
}

function save(userId, doc, visibility) {
  const before = get(userId);
  const kept = doc === undefined ? before.doc : doc === null ? null : clean(doc, userId);
  const vis = pick(visibility, VISIBILITY, before.visibility);
  db.prepare(`
    INSERT INTO homepages (user_id, doc, visibility, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, visibility = excluded.visibility, updated_at = excluded.updated_at
  `).run(userId, kept ? JSON.stringify(kept) : null, vis, Date.now());
  sweep(userId);
  return get(userId);
}

// The admin taking a page down: back to the starter page, its pictures and song deleted now.
function clear(userId) {
  const files = filesOf(userId);
  db.prepare('UPDATE homepages SET doc = NULL, updated_at = ? WHERE user_id = ?').run(Date.now(), userId);
  db.prepare('DELETE FROM homepage_files WHERE user_id = ?').run(userId);
  removeFiles(files);
}

// Whoever it's for: by id, or @username.
function ownerFor(who) {
  const s = String(who || '');
  const u = s.startsWith('@') ? people.userByUsername(s.slice(1)) : people.userById(s);
  return u && !u.suspended_at ? u : null; // (a suspended account's page is hidden)
}

// Can this person (null: someone who isn't signed in) see this page?
function canView(viewer, owner, visibility) {
  if (viewer && (viewer.id === owner.id || viewer.is_admin)) return true;
  if (viewer && (safety.hasBlocked(owner.id, viewer.id) || safety.hasBlocked(viewer.id, owner.id))) return false;
  if (visibility === 'everyone') return true;
  if (!viewer) return false;
  if (people.areFriends(owner.id, viewer.id)) return true;
  return visibility === 'spaces' && spaces.shareSpace(owner.id, viewer.id);
}

// What a visitor gets: the page, and its owner as they are now.
function forViewer(owner, page, viewer) {
  const mine = Boolean(viewer && viewer.id === owner.id);
  const u = people.publicUser(owner);
  return {
    owner: { ...u, avatar: owner.avatar ? `/homepage-avatar/${owner.id}/${owner.avatar}` : null },
    doc: page.doc,
    views: page.views,
    mine,
    ...(mine ? { visibility: page.visibility, usage: usage(owner.id), limitMb: FILES_MB } : {}),
  };
}

// The visitor counter: each visitor counts once every 6 hours (not the owner). Returns whether
// this visit counted.
const counted = new Map(); // `${ownerId}:${visitor}` -> when
function countView(ownerId, visitor) {
  const key = `${ownerId}:${visitor}`;
  const at = counted.get(key);
  if (at && Date.now() - at < 6 * 3600_000) return false;
  if (counted.size > 50_000) counted.clear();
  counted.set(key, Date.now());
  db.prepare(`
    INSERT INTO homepages (user_id, views) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET views = views + 1
  `).run(ownerId);
  return true;
}
// Someone who isn't signed in, told apart without keeping their address.
const visitorKey = (ip) => crypto.createHash('sha256').update(`homepage:${ip}`).digest('hex').slice(0, 16);

// What's written on a page, for a report about it.
function textOf(doc) {
  return ((doc && doc.pieces) || []).filter((p) => p.t === 'text').map((p) => p.text.replace(/\s+/g, ' ')).join(' · ').slice(0, 2000);
}

// ---------- Pictures ----------

const fileById = (id) => db.prepare('SELECT * FROM homepage_files WHERE id = ?').get(String(id)) || null;
const filesOfKind = (userId) => new Map(db.prepare('SELECT id, kind FROM homepage_files WHERE user_id = ?').all(userId).map((r) => [r.id, r.kind]));
const usage = (userId) => db.prepare('SELECT COALESCE(SUM(bytes), 0) n FROM homepage_files WHERE user_id = ?').get(userId).n;

// What kind of sound a file really is, from its first bytes (or null).
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

const SOUND_TYPES = { mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', weba: 'audio/webm' };

// A picture, or a song for the music player, without its hidden details (lib/scrub.js: a
// homepage can be public).
async function addFile(userId, buf) {
  const picture = imageKind(buf);
  const sound = !picture && audioKind(buf);
  if (!picture && !sound) throw new HomepageError('Pictures can be PNG, JPG, GIF or WebP, and songs MP3, M4A, OGG, FLAC or WAV.');
  if (picture && buf.length > IMAGE_MAX) throw new HomepageError('Pictures can be up to 5 MB.', 413);
  if (sound && buf.length > AUDIO_MAX) throw new HomepageError('Songs can be up to 10 MB.', 413);
  buf = await scrubData(buf);
  if (usage(userId) + buf.length > FILES_MB * 1024 * 1024) {
    throw new HomepageError(`Your homepage's pictures and songs can add up to ${FILES_MB} MB. Take some off your page to make room.`, 413);
  }
  const id = crypto.randomBytes(12).toString('hex');
  const file = `${id}.${picture || sound}`;
  fs.writeFileSync(path.join(FILES_DIR, file), buf);
  blobs.offload('homepages', file, picture ? `image/${picture === 'jpg' ? 'jpeg' : picture}` : SOUND_TYPES[sound]); // (to R2, if it's set up)
  const moving = Boolean(picture) && animated(buf, picture);
  db.prepare('INSERT INTO homepage_files (id, user_id, kind, file, bytes, animated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, picture ? 'image' : 'audio', file, buf.length, moving ? 1 : 0, Date.now());
  return { id, kind: picture ? 'image' : 'audio', bytes: buf.length, animated: moving };
}

// Pictures that aren't on the page any more go (after an hour, in case one's on its way there:
// just uploaded, or brought back with Undo).
function sweep(userId) {
  const { doc } = get(userId);
  const used = new Set();
  if (doc) {
    if (doc.bg && doc.bg.file) used.add(doc.bg.file);
    for (const p of doc.pieces || []) {
      if (p.file) used.add(p.file);
      for (const it of p.items || []) used.add(it.file);
    }
  }
  const old = Date.now() - 3600_000;
  for (const f of db.prepare('SELECT id, file, created_at FROM homepage_files WHERE user_id = ?').all(userId)) {
    if (used.has(f.id) || f.created_at > old) continue;
    db.prepare('DELETE FROM homepage_files WHERE id = ?').run(f.id);
    blobs.remove('homepages', f.file);
  }
}

function sweepAll() {
  for (const r of db.prepare('SELECT DISTINCT user_id FROM homepage_files').all()) sweep(r.user_id);
}
setInterval(sweepAll, 6 * 3600_000).unref();

// A cover for a shelf, from a link to what it's of (a game's store page, an album, a film): the
// picture its page shows when it's shared, fetched from the web the safe way (see lib/outbound.js)
// and kept as one of the owner's pictures.
async function download(url) {
  const res = await outbound.open(url, { headers: { Accept: 'image/avif,image/webp,image/*;q=0.9' }, signal: AbortSignal.timeout(10_000) });
  if (res.statusCode !== 200) {
    res.resume();
    throw new HomepageError("Couldn't get that picture.", 502);
  }
  const chunks = [];
  let n = 0;
  for await (const chunk of res) {
    n += chunk.length;
    if (n > IMAGE_MAX) {
      res.destroy();
      throw new HomepageError('That picture is too big.', 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// A cover's name, from its page's: without the site's own name on the end ("Hypnospace Outlaw -
// Wikipedia", "The Matrix (1999) - IMDb", "Portal 2 on Steam").
function coverTitle(title, site, link) {
  let t = oneLine(title, 200).replace(/\s+on (Steam|Apple Music|Spotify|Bandcamp|itch\.io)$/i, '');
  let host = '';
  try {
    host = new URL(link).hostname.replace(/^www\./, '').split('.').slice(-2, -1)[0] || '';
  } catch {}
  const end = /\s*[-|–—:•·]\s*([^-|–—:•·]{1,40})$/.exec(t);
  const tail = end ? end[1].trim().toLowerCase() : '';
  if (end && tail && (tail === String(site || '').toLowerCase() || (host && tail.replace(/\s+/g, '').includes(host.toLowerCase())))) t = t.slice(0, end.index);
  return t.trim().slice(0, 60);
}

// ---------- The guestbook ----------

const hasGuestbook = (doc) => Boolean(doc && doc.pieces.some((p) => p.t === 'guestbook'));

// The newest entries first (without those by anyone the reader has blocked).
function guestbookFor(ownerId, reader) {
  const hidden = new Set(reader ? safety.blockedBy(reader.id) : []);
  return db.prepare(`
    SELECT g.*, u.username, u.display_name, u.avatar FROM guestbook g JOIN users u ON u.id = g.author_id
    WHERE g.owner_id = ? ORDER BY g.created_at DESC LIMIT 200
  `).all(ownerId).filter((r) => !hidden.has(r.author_id)).map((r) => ({
    id: r.id, text: r.text, at: r.created_at,
    // (Pictures are only for people who are signed in: see /avatars in server.js.)
    author: { id: r.author_id, username: r.username, displayName: r.display_name, avatar: reader && r.avatar ? `/avatars/${r.avatar}` : null },
    canDelete: Boolean(reader && (reader.id === r.author_id || reader.id === ownerId)),
  }));
}

function sign(ownerId, authorId, text) {
  const t = words(text, GUESTBOOK_MAX).trim();
  if (!t) throw new HomepageError('Write something first.');
  const since = Date.now() - 3600_000;
  if (db.prepare('SELECT COUNT(*) n FROM guestbook WHERE author_id = ? AND owner_id = ? AND created_at > ?').get(authorId, ownerId, since).n >= 3
    || db.prepare('SELECT COUNT(*) n FROM guestbook WHERE author_id = ? AND created_at > ?').get(authorId, since).n >= 20) {
    throw new HomepageError("You've signed a lot lately. Try again in a while.", 429);
  }
  db.prepare('INSERT INTO guestbook (id, owner_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.randomBytes(12).toString('hex'), ownerId, authorId, t, Date.now());
  db.prepare(`
    DELETE FROM guestbook WHERE owner_id = ? AND id NOT IN (SELECT id FROM guestbook WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?)
  `).run(ownerId, ownerId, GUESTBOOK_KEEP);
}

// Whoever wrote it can take it out, and so can the page's owner. Returns whether it was there.
function unsign(ownerId, entryId, byId) {
  const r = db.prepare('SELECT author_id FROM guestbook WHERE id = ? AND owner_id = ?').get(String(entryId), ownerId);
  if (!r) return false;
  if (byId !== r.author_id && byId !== ownerId) throw new HomepageError("That isn't yours to delete.", 403);
  db.prepare('DELETE FROM guestbook WHERE id = ?').run(String(entryId));
  return true;
}

// ---------- Questions (the "ask me anything" box) ----------
// Anyone signed in who can see a page with a box on it can ask its owner something. Only the owner
// sees a question until they answer it; then everyone who can see the page can read both. Someone
// who asks anonymously isn't shown to the owner or anyone else, but who asked is kept: for the
// limits, so they can take it back, and for whoever runs the server if it's reported.

// A page's box, as far as asking goes (null if there isn't one). If it has more than one,
// anonymous questions are only taken if they all take them.
function askBox(doc) {
  const boxes = doc ? doc.pieces.filter((p) => p.t === 'ask') : [];
  return boxes.length ? { anon: boxes.every((p) => p.anon !== false) } : null;
}

const questionById = (id) => db.prepare('SELECT * FROM questions WHERE id = ?').get(String(id)) || null;
const isStopped = (ownerId, askerId) => Boolean(db.prepare('SELECT 1 FROM question_stops WHERE owner_id = ? AND asker_id = ?').get(ownerId, askerId));
const stoppedCount = (ownerId) => db.prepare('SELECT COUNT(*) n FROM question_stops WHERE owner_id = ?').get(ownerId).n;

// What a reader sees: answered questions, the newest answers first. The owner also sees the ones
// waiting for an answer (first), and whoever asked one sees their own. Not those by anyone the
// reader has blocked, unless they were asked anonymously (leaving one of those out would give away
// who asked it).
function questionsFor(ownerId, reader) {
  const mine = Boolean(reader && reader.id === ownerId);
  const hidden = new Set(reader ? safety.blockedBy(reader.id) : []);
  return db.prepare(`
    SELECT q.*, u.username, u.display_name, u.avatar FROM questions q JOIN users u ON u.id = q.asker_id
    WHERE q.owner_id = ? AND (q.answered_at IS NOT NULL OR ? = 1 OR q.asker_id = ?)
    ORDER BY q.answered_at IS NOT NULL, COALESCE(q.answered_at, q.created_at) DESC LIMIT 300
  `).all(ownerId, mine ? 1 : 0, reader ? reader.id : '').filter((r) => r.anonymous || !hidden.has(r.asker_id)).map((r) => ({
    id: r.id, text: r.text, at: r.created_at, answer: r.answer, answeredAt: r.answered_at,
    anonymous: Boolean(r.anonymous),
    // (Pictures are only for people who are signed in: see /avatars in server.js.)
    asker: r.anonymous ? null : { id: r.asker_id, username: r.username, displayName: r.display_name, avatar: reader && r.avatar ? `/avatars/${r.avatar}` : null },
    yours: Boolean(reader && reader.id === r.asker_id),
    canDelete: Boolean(reader && (reader.id === r.asker_id || mine)),
  }));
}

function ask(ownerId, askerId, text, anonymous) {
  const t = words(text, QUESTION_MAX).trim();
  if (!t) throw new HomepageError('Write a question first.');
  if (isStopped(ownerId, askerId)) throw new HomepageError("They aren't taking questions from you.", 403);
  const since = Date.now() - 3600_000;
  if (db.prepare('SELECT COUNT(*) n FROM questions WHERE asker_id = ? AND owner_id = ? AND created_at > ?').get(askerId, ownerId, since).n >= 3
    || db.prepare('SELECT COUNT(*) n FROM questions WHERE asker_id = ? AND created_at > ?').get(askerId, since).n >= 20) {
    throw new HomepageError("You've asked a lot lately. Try again in a while.", 429);
  }
  if (db.prepare('SELECT COUNT(*) n FROM questions WHERE asker_id = ? AND owner_id = ? AND answered_at IS NULL').get(askerId, ownerId).n >= 10) {
    throw new HomepageError("You've asked them a lot already. Wait for some answers first.", 429);
  }
  db.prepare('INSERT INTO questions (id, owner_id, asker_id, anonymous, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(crypto.randomBytes(12).toString('hex'), ownerId, askerId, anonymous ? 1 : 0, t, Date.now());
  db.prepare(`
    DELETE FROM questions WHERE owner_id = ? AND answered_at IS NULL AND id NOT IN
      (SELECT id FROM questions WHERE owner_id = ? AND answered_at IS NULL ORDER BY created_at DESC LIMIT ?)
  `).run(ownerId, ownerId, WAITING_KEEP);
}

// The owner answering one (or changing their answer). Returns the question as it was before, or
// null if it isn't there.
function answerQuestion(ownerId, questionId, text) {
  const q = questionById(questionId);
  if (!q || q.owner_id !== ownerId) return null;
  const t = words(text, ANSWER_MAX).trim();
  if (!t) throw new HomepageError('Write an answer first.');
  db.prepare('UPDATE questions SET answer = ?, answered_at = COALESCE(answered_at, ?) WHERE id = ?').run(t, Date.now(), q.id);
  db.prepare(`
    DELETE FROM questions WHERE owner_id = ? AND answered_at IS NOT NULL AND id NOT IN
      (SELECT id FROM questions WHERE owner_id = ? AND answered_at IS NOT NULL ORDER BY answered_at DESC LIMIT ?)
  `).run(ownerId, ownerId, ANSWERED_KEEP);
  return q;
}

// Whoever asked it can take it back, and the owner can delete it. Returns whether it was there.
function unask(ownerId, questionId, byId) {
  const q = questionById(questionId);
  if (!q || q.owner_id !== ownerId) return false;
  if (byId !== q.asker_id && byId !== ownerId) throw new HomepageError("That isn't yours to delete.", 403);
  db.prepare('DELETE FROM questions WHERE id = ?').run(q.id);
  return true;
}

// The owner stopping whoever asked a question from asking them any more (without being told who
// it is), and letting everyone they've stopped ask again.
function stopAsker(ownerId, askerId) {
  db.prepare('INSERT OR IGNORE INTO question_stops (owner_id, asker_id, created_at) VALUES (?, ?, ?)').run(ownerId, askerId, Date.now());
}
function letAllAsk(ownerId) {
  db.prepare('DELETE FROM question_stops WHERE owner_id = ?').run(ownerId);
}

// An account that's going: its pictures go too (its rows go with it).
const filesOf = (userId) => db.prepare('SELECT file FROM homepage_files WHERE user_id = ?').all(userId).map((r) => r.file);
function removeFiles(files) {
  for (const f of files) blobs.remove('homepages', f);
}

module.exports = {
  FILES_DIR, WIDTH, IMAGE_MAX, AUDIO_MAX, FILES_MB, VISIBILITY, HomepageError,
  clean, get, save, clear, ownerFor, canView, forViewer, countView, visitorKey, textOf,
  fileById, addFile, usage, filesOf, removeFiles,
  hasGuestbook, guestbookFor, sign, unsign, download, coverTitle,
  QUESTION_MAX, ANSWER_MAX, askBox, questionById, isStopped, stoppedCount, questionsFor, ask, answerQuestion, unask, stopAsker, letAllAsk,
};
