'use strict';

// Rainlit server.
// Serves the app, keeps accounts, profiles and friend lists in a small database
// (lib/db.js), and through lib/realtime.js shares who's online and helps two
// browsers connect for a call. Audio and video never pass through this server.

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pipeline, Transform } = require('stream');
const express = require('express');
const auth = require('./lib/auth');
const people = require('./lib/people');
const dms = require('./lib/dms');
const realtime = require('./lib/realtime');
const push = require('./lib/push');
const { getIceServers } = require('./lib/ice');
const { db, transaction, DATA_DIR, AVATAR_DIR } = require('./lib/db');

const PORT = Number(process.env.PORT) || 3000;
const AVATAR_MAX = 8 * 1024 * 1024;
const RESET_LINK_HOURS = 24;
const FILE_MAX_MB = Number(process.env.MAX_FILE_MB) || 100;
const MESSAGE_MAX = 4000;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
// GIFs come from KLIPY (https://klipy.com). Browsers search it and load its GIFs directly,
// as KLIPY requires; the server only keeps the link to what was sent.
const KLIPY_KEY = process.env.KLIPY_API_KEY || '';
// Anyone can run their own Rainlit (see SELF-HOSTING.md). Its name, if it has one, shows on
// the sign-in page and in the apps.
const SERVER_NAME = (process.env.SERVER_NAME || '').trim().slice(0, 60);
// Rainlit is free software (GNU AGPL). Anyone running a changed version for other people
// points this at their version's code, so the people using it can get it (Settings links
// to it).
const SOURCE_URL = /^https?:\/\//.test(process.env.SOURCE_URL || '') ? process.env.SOURCE_URL : 'https://github.com/coldsignals/rainlit';
const KLIPY_MEDIA = /^https:\/\/static\d*\.klipy\.com\/[^\s"'<>\\]{1,500}$/;

// Until the first account exists, signing up needs this one-time code instead of an
// invite. It's only printed in the server's logs, so only whoever runs the server
// can claim the first (admin) account.
let setupCode = people.countUsers() === 0 ? people.makeCode() : null;

const signupTries = auth.limiter(20, 3600_000);
const loginTries = auth.limiter(8, 15 * 60_000); // per person being signed in to
const ipTries = auth.limiter(40, 15 * 60_000); // per visitor, across everyone

// ---------- HTTP ----------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits in front: trust it about https and the visitor's address

// The page may only load its own scripts, and may only be shown on this site (not framed by another).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' blob: data: https://*.klipy.com",
  "media-src 'self' blob: https://*.klipy.com",
  "connect-src 'self' https://api.klipy.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CSP });
  next();
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));
// The apps live on GitHub; these keep the links short: rainlit.app/download and rainlit.app/android
// Android has its own repo, tagged with its own version numbers, so Obtainium can follow it.
const RELEASES = 'https://github.com/coldsignals/rainlit-releases/releases/latest/download';
const ANDROID_RELEASES = 'https://github.com/coldsignals/rainlit-android/releases/latest/download';
app.get('/download', (_req, res) => res.redirect(302, `${RELEASES}/Rainlit-Setup.exe`));
app.get('/android', (_req, res) => res.redirect(302, `${ANDROID_RELEASES}/Rainlit.apk`));
// The page, stamped with this version of Rainlit. Open apps compare it with the server's
// after an update and reload into the new one (see onHello in public/app.js).
const PUBLIC_DIR = path.join(__dirname, 'public');
const BUILD = crypto.createHash('sha256')
  .update(['index.html', 'app.js', 'style.css', 'boot.js', 'sw.js'].map((f) => fs.readFileSync(path.join(PUBLIC_DIR, f))).join('\n'))
  .digest('hex').slice(0, 12);
const attr = (s) => s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
  .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  <meta name="rainlit-build" content="${BUILD}" />` +
    `\n  <meta name="rainlit-source" content="${attr(SOURCE_URL)}" />` +
    (SERVER_NAME ? `\n  <meta name="rainlit-server-name" content="${attr(SERVER_NAME)}" />` : ''));
app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(INDEX_HTML);
});

app.get('/downloads', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('downloads.html', { root: path.join(__dirname, 'public') });
});

// ---------- API ----------

const api = express.Router();
api.use(express.json({ limit: '32kb' }));
api.use((req, res, next) => {
  // Anything that changes something has to come from this site's own pages.
  if (!['GET', 'HEAD'].includes(req.method) && !auth.sameOrigin(req)) return fail(res, 403, 'Refused.');
  res.set('Cache-Control', 'no-store');
  req.user = auth.userForToken(auth.tokenFrom(req));
  next();
});

function fail(res, status, error) {
  return res.status(status).json({ error });
}

const needUser = (req, res, next) => (req.user ? next() : fail(res, 401, 'Please sign in.'));
const needAdmin = (req, res, next) => (req.user && req.user.is_admin ? next() : fail(res, 403, 'Only the admin can do that.'));

function checkNewPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Passwords need at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

function signIn(req, res, userId) {
  auth.setSessionCookie(req, res, auth.createSession(userId));
  res.json({ user: people.selfUser(people.userById(userId)) });
}

api.get('/config', (_req, res) => {
  res.json({ setupNeeded: Boolean(setupCode) });
});

// For the apps, when you point one at a server: yes, this is Rainlit, and here's its name.
api.get('/server-info', (_req, res) => {
  res.json({ rainlit: true, name: SERVER_NAME || 'Rainlit', build: BUILD });
});

// ----- Signing up, in and out -----

api.post('/signup', async (req, res) => {
  if (signupTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait a while and try again.');
  const b = req.body || {};
  const code = people.normalizeCode(b.code);
  const username = String(b.username || '').trim().toLowerCase().replace(/^@/, '');
  const email = String(b.email || '').trim().toLowerCase();
  const displayName = people.oneLine(b.displayName || username, people.NAME_MAX);
  const firstAccount = Boolean(setupCode);

  if (!code || (firstAccount && code !== setupCode)) {
    signupTries.fail(req.ip);
    return fail(res, 400, firstAccount ? "That setup code isn't right. It's in the server's logs." : "That invite code isn't right.");
  }
  if (!people.USERNAME_RE.test(username)) return fail(res, 400, 'Usernames are 2 to 32 characters: letters, numbers, dots and underscores.');
  if (!people.EMAIL_RE.test(email) || email.length > 254) return fail(res, 400, "That email address doesn't look right.");
  const pwProblem = checkNewPassword(b.password);
  if (pwProblem) return fail(res, 400, pwProblem);
  if (people.userByUsername(username)) return fail(res, 409, 'That username is taken.');
  if (people.userByLogin(email)) return fail(res, 409, 'An account already uses that email.');

  const hash = await auth.hashPassword(b.password);
  const id = auth.newId();
  try {
    transaction(() => {
      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, display_name, is_admin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, email, hash, displayName, firstAccount ? 1 : 0, Date.now());
      if (!firstAccount) {
        const used = db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL')
          .run(id, Date.now(), code);
        if (!used.changes) throw Object.assign(new Error('bad invite'), { badInvite: true });
      }
    });
  } catch (err) {
    if (err.badInvite) {
      signupTries.fail(req.ip);
      return fail(res, 400, "That invite code isn't right, or it's already been used.");
    }
    if (/UNIQUE/.test(err.message)) return fail(res, 409, 'That username or email was just taken.');
    throw err;
  }
  if (firstAccount) {
    setupCode = null;
    console.log(`[accounts] Admin account created: @${username}`);
  } else {
    console.log(`[accounts] New account: @${username}`);
  }
  signIn(req, res, id);
});

api.post('/login', async (req, res) => {
  const b = req.body || {};
  const login = String(b.login || '').trim().toLowerCase();
  const key = `${req.ip}|${login}`;
  if (loginTries.blocked(key) || ipTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
  const user = people.userByLogin(login);
  // Take about as long whether or not the account exists, so timing doesn't give it away.
  const ok = user ? await auth.checkPassword(String(b.password || ''), user.password_hash) : (await auth.hashPassword('x'), false);
  if (!ok) {
    loginTries.fail(key);
    ipTries.fail(req.ip);
    return fail(res, 401, "That username or password isn't right.");
  }
  loginTries.clear(key);
  signIn(req, res, user.id);
});

api.post('/logout', (req, res) => {
  auth.endSession(auth.tokenFrom(req));
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// A one-time link from the admin (or, later, an email) to set a new password.
api.post('/reset', async (req, res) => {
  if (ipTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
  const b = req.body || {};
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(auth.sha256(String(b.token || '')));
  if (!row || row.used_at || row.expires_at < Date.now()) {
    ipTries.fail(req.ip);
    return fail(res, 400, 'This reset link has expired or was already used. Ask for a new one.');
  }
  const pwProblem = checkNewPassword(b.password);
  if (pwProblem) return fail(res, 400, pwProblem);
  const hash = await auth.hashPassword(b.password);
  transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // sign out everywhere else
  });
  realtime.closeOtherSessions(row.user_id, null);
  signIn(req, res, row.user_id);
});

// ----- Your profile -----

api.get('/me', needUser, (req, res) => {
  res.json({ user: people.selfUser(req.user) });
});

function profileChanged(userId) {
  const user = people.userById(userId);
  realtime.announceProfile(user);
  realtime.announcePresence(userId);
  realtime.sendToUser(userId, { type: 'me', user: people.selfUser(user) }); // your other devices
  return user;
}

api.patch('/me', needUser, (req, res) => {
  const b = req.body || {};
  const set = {};
  if ('displayName' in b) {
    set.display_name = people.oneLine(b.displayName, people.NAME_MAX);
    if (!set.display_name) return fail(res, 400, "Your display name can't be empty.");
  }
  if ('statusText' in b) set.status_text = people.oneLine(b.statusText, people.STATUS_MAX);
  if ('presence' in b) {
    if (!['auto', 'away', 'invisible'].includes(b.presence)) return fail(res, 400, 'Pick online, away or appear offline.');
    set.presence = b.presence;
  }
  const cols = Object.keys(set);
  if (cols.length) {
    db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => set[c]), req.user.id);
  }
  res.json({ user: people.selfUser(profileChanged(req.user.id)) });
});

api.post('/me/password', needUser, async (req, res) => {
  const b = req.body || {};
  if (ipTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
  if (!(await auth.checkPassword(String(b.current || ''), req.user.password_hash))) {
    ipTries.fail(req.ip);
    return fail(res, 400, "Your current password isn't right.");
  }
  const pwProblem = checkNewPassword(b.next);
  if (pwProblem) return fail(res, 400, pwProblem);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await auth.hashPassword(b.next), req.user.id);
  const token = auth.tokenFrom(req);
  auth.endOtherSessions(req.user.id, token);
  realtime.closeOtherSessions(req.user.id, token);
  res.json({ ok: true });
});

// What kind of picture a file really is, from its first bytes (not from what it claims to be).
function imageKind(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (/^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function removeAvatarFile(name) {
  if (name) fs.rm(path.join(AVATAR_DIR, name), { force: true }, () => {});
}

api.put('/me/avatar', needUser, express.raw({ type: () => true, limit: AVATAR_MAX }), (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const kind = imageKind(buf);
  if (!kind) return fail(res, 400, 'Profile pictures can be PNG, JPG, GIF or WebP.');
  // A new name each time, so everyone's browser fetches the new picture instead of a saved copy.
  const name = `${req.user.id}-${crypto.randomBytes(4).toString('hex')}.${kind}`;
  fs.writeFileSync(path.join(AVATAR_DIR, name), buf);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(name, req.user.id);
  removeAvatarFile(req.user.avatar);
  res.json({ user: people.selfUser(profileChanged(req.user.id)) });
});

api.delete('/me/avatar', needUser, (req, res) => {
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  removeAvatarFile(req.user.avatar);
  res.json({ user: people.selfUser(profileChanged(req.user.id)) });
});

// ----- Friends -----

api.get('/friends', needUser, (req, res) => {
  const out = { friends: [], incoming: [], outgoing: [], maxFileMb: FILE_MAX_MB, klipyKey: KLIPY_KEY, quickReactions: dms.quickReactions(req.user.id) };
  const convos = dms.summariesFor(req.user.id);
  for (const c of people.connectionsOf(req.user.id)) {
    const u = people.publicUser(c.user);
    if (c.kind === 'friend') {
      out.friends.push({ ...u, presence: realtime.presenceOf(u.id), dm: convos[u.id] || { save: true, unread: 0, readAt: 0, lastAt: 0 } });
    } else {
      out[c.kind].push(u);
    }
  }
  res.json(out);
});

api.post('/friends', needUser, (req, res) => {
  const target = people.userByUsername(String((req.body || {}).username || '').trim());
  if (!target) return fail(res, 404, 'No one has that username. Check the spelling?');
  if (target.id === req.user.id) return fail(res, 400, "That's you!");
  const f = people.friendship(req.user.id, target.id);
  if (f && f.status === 'accepted') return fail(res, 409, `You're already friends with ${target.display_name}.`);
  if (f && f.requested_by === req.user.id) return fail(res, 409, `You've already sent ${target.display_name} a request.`);
  // If they'd already asked you, asking them back just makes you friends.
  if (f) people.acceptFriend(req.user.id, target.id);
  else people.requestFriend(req.user.id, target.id);
  realtime.friendsChanged(req.user.id, target.id);
  res.json({ status: f ? 'friends' : 'requested', user: people.publicUser(target) });
});

api.post('/friends/:id/accept', needUser, (req, res) => {
  const f = people.friendship(req.user.id, req.params.id);
  if (!f || f.status !== 'pending' || f.requested_by === req.user.id) return fail(res, 404, "That request isn't there any more.");
  people.acceptFriend(req.user.id, req.params.id);
  realtime.friendsChanged(req.user.id, req.params.id);
  res.json({ ok: true });
});

// Declines a request, cancels one you sent, or removes a friend.
api.delete('/friends/:id', needUser, (req, res) => {
  if (people.friendship(req.user.id, req.params.id)) {
    people.removeFriendship(req.user.id, req.params.id);
    realtime.friendsChanged(req.user.id, req.params.id);
  }
  res.json({ ok: true });
});

// Push notifications for when the app is closed (lib/push.js). The phone asks for the
// server's public key, registers with its push app (ntfy, for example), then sends its address here.
api.get('/push', needUser, (_req, res) => res.json({ key: push.publicKey() }));
api.post('/push', needUser, async (req, res) => {
  if (!(await push.subscribe(req.user.id, req.body))) return fail(res, 400, "That push address can't be used.");
  res.json({ ok: true });
});
api.delete('/push', needUser, (req, res) => {
  push.unsubscribe(req.user.id, (req.body || {}).endpoint);
  res.json({ ok: true });
});

api.get('/users/:id', needUser, (req, res) => {
  const u = people.userById(req.params.id);
  const f = u && people.friendship(req.user.id, u.id);
  if (!u || (!f && u.id !== req.user.id)) return fail(res, 404, 'Not found.');
  const presence = f && f.status === 'accepted' ? realtime.presenceOf(u.id) : null;
  res.json({ user: { ...people.publicUser(u), presence } });
});

// ----- Conversations -----
//
// Everything new in a conversation goes out live to both people (every device they
// have open), whether or not it's being saved.

// Only friends can message each other. Puts the conversation on the request.
function needFriend(req, res, next) {
  const friendId = String(req.params.friendId);
  if (!people.areFriends(req.user.id, friendId)) return fail(res, 404, 'You can only message people on your friends list.');
  req.friendId = friendId;
  req.dm = dms.getDm(req.user.id, friendId);
  next();
}

function tellBoth(req, msg) {
  realtime.sendToUser(req.user.id, msg);
  realtime.sendToUser(req.friendId, msg);
  // A new message for a friend who has Rainlit closed: a push notification to their phone.
  // It says who it's from, never what it says.
  const m = msg.type === 'dm-message' && msg.message;
  if (m && m.author === req.user.id && ['text', 'file', 'gif'].includes(m.kind) && !realtime.isOnline(req.friendId)) {
    push.send(req.friendId, { type: 'message', from: { id: req.user.id, name: req.user.display_name } }, { ttl: 24 * 3600 });
  }
}

api.get('/dms/:friendId/messages', needUser, needFriend, (req, res) => {
  if (req.query.after) return res.json({ messages: dms.since(req.dm.id, Number(req.query.after) || 0) });
  const page = dms.history(req.dm.id, Number(req.query.before) || 0);
  res.json({ ...page, save: Boolean(req.dm.save), readAt: dms.readAt(req.dm.id, req.user.id) });
});

api.post('/dms/:friendId/messages', needUser, needFriend, (req, res) => {
  const b = req.body || {};
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail(res, 400, "That message didn't make sense.");
  // Already got it (this is a retry after a connection hiccup): say so again.
  const already = dms.getRow(id);
  if (already) {
    if (already.author_id !== req.user.id || already.dm_id !== req.dm.id) return fail(res, 400, "That message didn't make sense.");
    return res.json({ message: dms.getMessage(id) });
  }
  const passed = dms.passingMessage(id);
  if (passed) {
    if (passed.author !== req.user.id || passed.dm !== req.dm.id) return fail(res, 400, "That message didn't make sense.");
    const again = { id, dm: passed.dm, author: passed.author, kind: passed.kind, text: String(b.text || ''), meta: b.gif || null, file: null, at: passed.at, replyTo: passed.replyTo ? { id: passed.replyTo } : null, seq: null, saved: false };
    return res.json({ message: dms.withReplies([again])[0] });
  }
  let fields;
  // Answering an earlier message in this conversation (anything else is just ignored).
  const replyTo = dms.replyTarget(req.dm.id, b.replyTo);
  if (b.gif) {
    const gif = cleanGif(b.gif);
    if (!gif) return fail(res, 400, "That GIF didn't come through right. Try another.");
    fields = { id, dm: req.dm.id, author: req.user.id, kind: 'gif', meta: gif, replyTo };
  } else {
    const text = String(b.text || '').slice(0, MESSAGE_MAX);
    if (!text.trim()) return fail(res, 400, "You can't send an empty message.");
    fields = { id, dm: req.dm.id, author: req.user.id, kind: 'text', text, replyTo };
  }
  const message = req.dm.save ? dms.addMessage(fields) : dms.passing(fields);
  tellBoth(req, { type: 'dm-message', message });
  res.json({ message });
});

// A GIF from KLIPY: only its links (which must be KLIPY's), size and title are kept.
function cleanGif(g) {
  if (!g || typeof g !== 'object') return null;
  const url = (u) => (typeof u === 'string' && KLIPY_MEDIA.test(u) ? u : null);
  const size = (n) => (Number.isInteger(n) && n > 0 && n <= 4000 ? n : null);
  const out = {
    slug: String(g.slug || '').slice(0, 200),
    title: people.oneLine(g.title, 200),
    mp4: url(g.mp4),
    img: url(g.img),
    poster: url(g.poster),
    width: size(g.width),
    height: size(g.height),
  };
  if (!/^[\w-]{1,200}$/.test(out.slug) || !(out.mp4 || out.img) || !out.width || !out.height) return null;
  return out;
}

// A file, sent as the raw request body with its name and type in headers. It's
// written to disk as it arrives, so big files never have to fit in memory.
api.post('/dms/:friendId/files', needUser, needFriend, (req, res) => {
  const tooBig = `Files can be up to ${FILE_MAX_MB} MB.`;
  if (!req.dm.save) return fail(res, 409, 'Saving is off in this conversation, so files can only be sent during a call.');
  const id = String(req.get('x-message-id') || '');
  if (!ID_RE.test(id) || dms.getRow(id)) return fail(res, 400, "That upload didn't make sense.");
  if (Number(req.get('content-length') || 0) > FILE_MAX_MB * 1024 * 1024) return fail(res, 413, tooBig);
  let name = '';
  try { name = decodeURIComponent(req.get('x-file-name') || ''); } catch {}
  name = people.oneLine(name.replace(/[\\/]/g, '_'), 200) || 'file';
  const type = String(req.get('x-file-type') || '').toLowerCase();
  const safeType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) && type.length <= 100 ? type : 'application/octet-stream';

  const final = path.join(dms.FILES_DIR, id);
  const partial = `${final}.part`;
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, done) {
      size += chunk.length;
      done(size > FILE_MAX_MB * 1024 * 1024 ? Object.assign(new Error('too big'), { tooBig: true }) : null, chunk);
    },
  });
  pipeline(req, counter, fs.createWriteStream(partial), (err) => {
    if (err) {
      fs.rm(partial, { force: true }, () => {});
      if (!res.headersSent && !res.socket?.destroyed) fail(res, err.tooBig ? 413 : 500, err.tooBig ? tooBig : 'The upload failed. Try again.');
      return;
    }
    fs.renameSync(partial, final);
    const replyTo = dms.replyTarget(req.dm.id, req.get('x-reply-to'));
    const message = dms.addMessage({ id, dm: req.dm.id, author: req.user.id, kind: 'file', file: { name, size, type: safeType, path: id }, replyTo });
    tellBoth(req, { type: 'dm-message', message });
    res.json({ message });
  });
});

// Remove something you sent. It's replaced by "Alice removed a message" for both of you.
// A short-lived link to one file, for opening it somewhere that isn't signed in (the
// phone's browser, say). It works for 15 minutes, for that one file only.
const LINK_SECRET = (() => {
  const file = path.join(DATA_DIR, 'link-secret');
  try {
    return fs.readFileSync(file);
  } catch {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(file, key, { mode: 0o600 });
    return key;
  }
})();
const LINK_MS = 15 * 60_000;
const linkSig = (id, expires) => crypto.createHmac('sha256', LINK_SECRET).update(`${id}.${expires}`).digest('base64url');

function fileLinkOk(id, link) {
  const [expires, sig] = String(link || '').split('.');
  if (!(Number(expires) > Date.now()) || !sig) return false;
  const want = Buffer.from(linkSig(id, expires));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// The file, if this person may see it (they're in the conversation, and still friends).
function fileFor(user, id) {
  const r = dms.getRow(id);
  const other = r && r.dm_id.split(':').find((u) => u !== user.id);
  return r && r.kind === 'file' && dms.inDm(r.dm_id, user.id) && people.areFriends(user.id, other) ? r : null;
}

api.post('/files/:id/link', needUser, (req, res) => {
  const r = fileFor(req.user, req.params.id);
  if (!r) return fail(res, 404, "That file isn't there any more.");
  const expires = Date.now() + LINK_MS;
  res.json({ url: `/files/${r.id}/${encodeURIComponent(r.file_name)}?link=${expires}.${linkSig(r.id, expires)}` });
});

api.delete('/dms/:friendId/messages/:id', needUser, needFriend, (req, res) => {
  const id = req.params.id;
  const m = dms.getMessage(id) || dms.passingMessage(id);
  if (!m || m.dm !== req.dm.id || m.author !== req.user.id || !['text', 'file', 'gif'].includes(m.kind)) {
    return fail(res, 404, "That message isn't there any more.");
  }
  if (m.seq) dms.removeMessage(id);
  else dms.forgetPassing(id);
  tellBoth(req, { type: 'dm-removed', dm: req.dm.id, id, by: req.user.id, name: req.user.display_name, was: m.kind === 'file' ? 'file' : 'message' });
  res.json({ ok: true });
});

// Edit one of your own text messages. Both of you see the new text, marked "(edited)".
api.patch('/dms/:friendId/messages/:id', needUser, needFriend, (req, res) => {
  const id = req.params.id;
  const m = dms.getMessage(id) || dms.passingMessage(id);
  if (!m || m.dm !== req.dm.id || m.author !== req.user.id || m.kind !== 'text') {
    return fail(res, 404, "That message isn't there any more.");
  }
  const text = String((req.body || {}).text || '').slice(0, MESSAGE_MAX);
  if (!text.trim()) return fail(res, 400, 'A message needs something in it. To remove it, delete it instead.');
  const editedAt = Date.now();
  if (m.seq) dms.editMessage(id, text, editedAt);
  tellBoth(req, { type: 'dm-edited', dm: req.dm.id, id, text, editedAt });
  res.json({ ok: true, editedAt });
});

// Emoji reactions, by either of you, on any saved message.
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\u20e3)+$/u;
function cleanEmoji(value) {
  const s = String(value || '');
  return s.length <= 32 && EMOJI_RE.test(s) && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s) ? s : null;
}

function reactRoute(req, res, on) {
  const emoji = cleanEmoji((req.body || {}).emoji);
  if (!emoji) return fail(res, 400, "That isn't an emoji.");
  const r = dms.getRow(req.params.id);
  if (!r || r.dm_id !== req.dm.id || !['text', 'file', 'gif'].includes(r.kind)) return fail(res, 404, "That message isn't there any more.");
  if (!dms.react(r.id, req.user.id, emoji, on)) return fail(res, 400, 'That message has all the reactions it can take.');
  const reactions = dms.reactionsOf(r.id);
  realtime.sendToUser(req.user.id, { type: 'dm-reactions', dm: req.dm.id, id: r.id, reactions });
  realtime.sendToUser(req.friendId, { type: 'dm-reactions', dm: req.dm.id, id: r.id, reactions });
  res.json({ reactions, quick: dms.quickReactions(req.user.id) });
}
api.post('/dms/:friendId/messages/:id/reactions', needUser, needFriend, (req, res) => reactRoute(req, res, true));
api.delete('/dms/:friendId/messages/:id/reactions', needUser, needFriend, (req, res) => reactRoute(req, res, false));

api.post('/dms/:friendId/read', needUser, needFriend, (req, res) => {
  const at = Math.min(Number((req.body || {}).at) || Date.now(), Date.now());
  dms.markRead(req.dm.id, req.user.id, at);
  realtime.sendToUser(req.user.id, { type: 'dm-read', dm: req.dm.id, at }); // clears the unread count on your other devices
  res.json({ ok: true });
});

// Turn saving on or off. Either person can, and a note saying who goes in the conversation.
api.patch('/dms/:friendId', needUser, needFriend, (req, res) => {
  const save = Boolean((req.body || {}).save);
  if (save !== Boolean(req.dm.save)) {
    dms.setSave(req.dm.id, save);
    tellBoth(req, { type: 'dm-saving', dm: req.dm.id, save });
    const message = dms.addMessage({ id: auth.newId(), dm: req.dm.id, author: req.user.id, kind: 'saving', meta: { on: save } });
    tellBoth(req, { type: 'dm-message', message });
  }
  res.json({ save });
});

// ----- Admin: invites and accounts -----

api.get('/admin/invites', needAdmin, (_req, res) => {
  res.json({ invites: people.listInvites() });
});

api.post('/admin/invites', needAdmin, (req, res) => {
  res.json({ code: people.createInvite(req.user.id) });
});

api.delete('/admin/invites/:code', needAdmin, (req, res) => {
  db.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').run(people.normalizeCode(req.params.code));
  res.json({ ok: true });
});

api.get('/admin/users', needAdmin, (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at').all()
    .map((u) => ({ ...people.publicUser(u), email: u.email, isAdmin: Boolean(u.is_admin), createdAt: u.created_at }));
  res.json({ users });
});

// Makes a one-time link the admin can send to someone who forgot their password.
api.post('/admin/users/:id/reset-link', needAdmin, (req, res) => {
  const u = people.userById(req.params.id);
  if (!u) return fail(res, 404, 'Not found.');
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(auth.sha256(token), u.id, now, now + RESET_LINK_HOURS * 3600_000);
  res.json({ url: `${req.protocol}://${req.get('host')}/#reset=${token}`, hours: RESET_LINK_HOURS });
});

// The newest Android app (its latest release on GitHub, looked up at most every 15 minutes),
// so the app can say when there's a newer one than yours.
const androidLatest = { version: '', at: 0 };
api.get('/android-latest', needUser, async (_req, res) => {
  if (Date.now() - androidLatest.at > 15 * 60_000) {
    androidLatest.at = Date.now();
    try {
      const r = await fetch('https://api.github.com/repos/coldsignals/rainlit-android/releases/latest', {
        headers: { 'User-Agent': 'rainlit', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) androidLatest.version = String((await r.json()).tag_name || '').replace(/^v/, '');
    } catch {}
  }
  res.json({ version: androidLatest.version });
});

// ----- Calls -----

api.get('/ice', needUser, async (_req, res) => {
  const { list, hasTurn } = await getIceServers();
  res.json({ iceServers: list, hasTurn });
});

api.use((_req, res) => fail(res, 404, 'Not found.'));
app.use('/api', api);

// Profile pictures, for signed-in people only.
app.get('/avatars/:file', (req, res, next) => {
  if (!auth.userForToken(auth.tokenFrom(req))) return res.sendStatus(401);
  if (!/^[a-f0-9]{24}-[a-f0-9]{8}\.(png|jpg|gif|webp)$/.test(req.params.file)) return res.sendStatus(404);
  // Relative to the folder, so a dot in a parent folder's name (".PROJECT ...") doesn't make it refuse.
  const opts = { root: AVATAR_DIR, headers: { 'Cache-Control': 'private, max-age=31536000, immutable' } };
  res.sendFile(req.params.file, opts, (err) => {
    if (err) next();
  });
});

// Files sent in a conversation, for the two people in it. Pictures, videos and audio
// are shown in place; anything else only downloads. Either way the browser is told
// never to run anything in them.
app.get('/files/:id/:name', (req, res) => {
  let r;
  if (req.query.link) {
    // A short-lived link (see /api/files/:id/link).
    if (!fileLinkOk(req.params.id, req.query.link)) return res.sendStatus(404);
    r = dms.getRow(req.params.id);
    if (!r || r.kind !== 'file') return res.sendStatus(404);
  } else {
    const user = auth.userForToken(auth.tokenFrom(req));
    if (!user) return res.sendStatus(401);
    r = fileFor(user, req.params.id);
    if (!r) return res.sendStatus(404);
  }
  const showable = dms.SHOWABLE_TYPES.test(r.file_type);
  res.set({
    'Content-Type': showable ? r.file_type : 'application/octet-stream',
    'Content-Disposition': `${showable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(r.file_name)}`,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.sendFile(r.file_path, { root: dms.FILES_DIR }, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders(res, filePath) {
      // Always check for a fresh copy of the app shell so updates show up right away.
      if (/\.(html|js|css|webmanifest)$/.test(filePath)) res.set('Cache-Control', 'no-cache');
    },
  })
);

app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return fail(res, 413, req.path.includes('avatar') ? 'Profile pictures can be up to 8 MB.' : "That's too big.");
  }
  if (err.status && err.status < 500) return fail(res, err.status, "That request didn't make sense.");
  console.error(err);
  fail(res, 500, 'Something went wrong on the server.');
});

// ---------- Start ----------

const server = http.createServer(app);
realtime.attach(server, { build: BUILD });

server.listen(PORT, () => {
  console.log(`Rainlit${SERVER_NAME ? ` (${SERVER_NAME})` : ''} is running on http://localhost:${PORT}`);
  console.log(`Data is kept in ${DATA_DIR}`);
  if (process.env.CF_TURN_KEY_ID) console.log('Using Cloudflare TURN relay.');
  else if (process.env.TURN_URLS) console.log('Using custom TURN relay.');
  else console.log('No TURN relay configured (direct connections only).');
  console.log(`Dropped connections are held for ${realtime.RECONNECT_MS / 60_000} minutes.`);
  if (setupCode) {
    console.log('');
    console.log('[setup] No accounts yet. To create the admin account, open the site and sign up');
    console.log(`[setup] with this setup code: ${setupCode}`);
    console.log('');
  }
});
