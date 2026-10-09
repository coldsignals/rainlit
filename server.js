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
const spaces = require('./lib/spaces');
const badges = require('./lib/badges');
const safety = require('./lib/safety');
const voice = require('./lib/voice');
const traces = require('./lib/traces');
const discord = require('./lib/discord');
const accounts = require('./lib/accounts');
const emojis = require('./lib/emoji');
const sounds = require('./lib/sounds');
const callrecord = require('./lib/callrecord');
const records = require('./lib/record');
const homepages = require('./lib/homepages');
const pets = require('./lib/pets');
const announcements = require('./lib/announcements');
const blobs = require('./lib/blobs');
const abuse = require('./lib/abuse');
// (A new flag: the admin hears, wherever they are in the app.)
abuse.whenFlagged((userId, kind, detail) => {
  const u = people.userById(userId);
  console.log(`[flags] @${u ? u.username : userId}: ${detail}`);
  for (const r of db.prepare('SELECT id FROM users WHERE is_admin = 1').all()) realtime.sendToUser(r.id, { type: 'flag-new' });
});
const supporters = require('./lib/supporters');
// (Someone started or stopped supporting Rainlit: their devices hear, for their badge and limits.)
supporters.whenChanged((userId) => {
  const u = people.userById(userId);
  if (u) realtime.sendToUser(userId, { type: 'me', user: people.selfUser(u) });
});
const themes = require('./lib/themes');
const cards = require('./lib/cards');
const feedback = require('./lib/feedback');
const images = require('./lib/images');
const { imageKind } = images;
const embeds = require('./lib/embeds');
const mail = require('./lib/mail');
const signups = require('./lib/signups');
const storage = require('./lib/storage');
const scrub = require('./lib/scrub');
const settings = require('./lib/settings');
const evidence = require('./lib/evidence');
const yourData = require('./lib/export');
const { getIceServers } = require('./lib/ice');
const { db, transaction, DATA_DIR, AVATAR_DIR } = require('./lib/db');

const PORT = Number(process.env.PORT) || 3000;
const AVATAR_MAX = 8 * 1024 * 1024;
const RESET_LINK_HOURS = 24; // (a link the admin makes)
const RESET_EMAIL_MINUTES = 60; // (one sent by email)
const CONFIRM_DAYS = 3;
// Your notes (a conversation with yourself) hold this many (more for supporters). (Their files
// count toward the room your files have, in lib/storage.js, like everything else you send.)
const NOTES_MAX = Number(process.env.NOTES_MAX) || 100;
const notesMaxFor = (user) => (supporters.active(user) ? Math.max(NOTES_MAX, supporters.PERKS.notes) : NOTES_MAX);
const notesFull = (user) => `Your notes are full (${notesMaxFor(user)} of ${notesMaxFor(user)}). Delete some to make room.`;
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

// How old someone has to be to make an account (13 unless this server says more: some
// countries' laws want 14, 15 or 16). The sign-up form asks their birthday without saying so.
const MIN_AGE = Math.max(13, Math.round(Number(process.env.MIN_AGE)) || 13);

const signupTries = auth.limiter(20, 3600_000);
const loginTries = auth.limiter(8, 15 * 60_000); // per person being signed in to
const ipTries = auth.limiter(40, 15 * 60_000); // per visitor, across everyone
const forgotTries = auth.limiter(5, 3600_000); // "Forgot your password?", per visitor
const openSignupTries = auth.limiter(3, 86_400_000); // accounts made without an invite, per visitor a day

// ---------- HTTP ----------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits in front: trust it about https and the visitor's address

// Voice channels talk to the LiveKit server (and with LiveKit Cloud, to its regions too).
const LIVEKIT_SRC = (() => {
  if (!voice.enabled) return '';
  try {
    const u = new URL(voice.url);
    if (u.hostname.endsWith('.livekit.cloud')) return ' wss://*.livekit.cloud https://*.livekit.cloud';
    const secure = u.protocol === 'wss:';
    return ` ${secure ? 'wss' : 'ws'}://${u.host} ${secure ? 'https' : 'http'}://${u.host}`;
  } catch {
    return '';
  }
})();

// The page may only load its own scripts, and may only be shown on this site (not framed by another).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'", // (Rainlit's typeface is served from here: public/fonts)
  `img-src 'self' blob: data: https://*.klipy.com${blobs.origin ? ` ${blobs.origin}` : ''}`, // (R2: files, if they're kept there)
  `media-src 'self' blob: https://*.klipy.com${blobs.origin ? ` ${blobs.origin}` : ''}`,
  `connect-src 'self' blob: https://api.klipy.com${LIVEKIT_SRC}${blobs.origin ? ` ${blobs.origin}` : ''}`, // (blob: something made here to save, read back to hand to the Android app; R2: soundboard sounds)
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
  .update(['index.html', 'app.js', 'style.css', 'boot.js', 'sw.js', 'homepage.js', 'homepage-edit.js', 'homepage.css'].map((f) => fs.readFileSync(path.join(PUBLIC_DIR, f))).join('\n'))
  .digest('hex').slice(0, 12);
const attr = (s) => s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
  .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  <meta name="rainlit-build" content="${BUILD}" />` +
    `\n  <meta name="rainlit-source" content="${attr(SOURCE_URL)}" />` +
    (SERVER_NAME ? `\n  <meta name="rainlit-server-name" content="${attr(SERVER_NAME)}" />` : ''));
app.get(['/', '/index.html', '/join/:code', '/delete-account'], (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(INDEX_HTML);
});

// The privacy policy and terms. These are rainlit.app's (they say so); a server someone else
// runs can point them at its own with PRIVACY_URL and TERMS_URL.
for (const [page, setting] of [['privacy', 'PRIVACY_URL'], ['terms', 'TERMS_URL']]) {
  app.get(`/${page}`, (_req, res) => {
    const own = String(process.env[setting] || '').trim();
    if (own) return res.redirect(302, own);
    res.set('Cache-Control', 'no-cache');
    res.sendFile(`${page}.html`, { root: path.join(__dirname, 'public') });
  });
}

// A custom emoji's picture (lib/emoji.js). Anyone can load one: whoever sees a message sees its emoji.
app.get('/emoji/:id', (req, res) => {
  const e = /^[a-f0-9]{8,32}$/.test(req.params.id) && emojis.byId(req.params.id);
  if (!e) return res.sendStatus(404);
  const type = { png: 'image/png', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg' }[e.file.split('.').pop()];
  blobs.send(res, 'emoji', e.file, { type, cache: 'public, max-age=31536000, immutable', headers: { 'Content-Security-Policy': "default-src 'none'; sandbox" } });
});

// A soundboard sound (lib/sounds.js). Anyone can load one: whoever's in the call hears it.
app.get('/sounds/:id', (req, res) => {
  const s = /^[a-f0-9]{24}$/.test(req.params.id) && sounds.byId(req.params.id);
  if (!s) return res.sendStatus(404);
  blobs.send(res, 'sounds', s.file, { type: sounds.TYPES[s.file.split('.').pop()], cache: 'public, max-age=31536000, immutable', headers: { 'Content-Security-Policy': "default-src 'none'; sandbox" } });
});

// Homepages (lib/homepages.js): rainlit.app/@name, for anyone the page's owner lets see it (the
// page itself fetches it from /api/homepages/@name), and the pictures on them.
const HOMEPAGE_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'homepage.html'), 'utf8');
app.get('/@:username', (req, res) => {
  const owner = people.userByUsername(req.params.username);
  // What a link to it shows elsewhere (like in a Discord message), if its owner has made it public.
  const open = owner && homepages.get(owner.id).visibility === 'everyone';
  const title = open ? `${owner.display_name}'s homepage` : 'A homepage on Rainlit';
  const about = open && owner.status_text ? owner.status_text : 'Rainlit: calls, chat and homepages for you and your friends.';
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(HOMEPAGE_HTML.replaceAll('{{title}}', attr(title)).replaceAll('{{about}}', attr(about)));
});

function sendHomepageFile(res, kind, file) {
  blobs.send(res, kind, file, { headers: { 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
const homepageViewer = (req) => auth.userForToken(auth.tokenFrom(req));

app.get('/homepage-files/:id', (req, res) => {
  const f = /^[a-f0-9]{24}$/.test(req.params.id) && homepages.fileById(req.params.id);
  const owner = f && people.userById(f.user_id);
  if (!owner || !homepages.canView(homepageViewer(req), owner, homepages.get(owner.id).visibility)) return res.sendStatus(404);
  abuse.noteOut(f.bytes);
  sendHomepageFile(res, 'homepages', f.file);
});

// The owner's picture, on their homepage (for visitors who aren't signed in, too, if it's public).
app.get('/homepage-avatar/:userId/:file', (req, res) => {
  const owner = people.userById(req.params.userId);
  if (!owner || !owner.avatar || owner.avatar !== req.params.file) return res.sendStatus(404);
  if (!homepages.canView(homepageViewer(req), owner, homepages.get(owner.id).visibility)) return res.sendStatus(404);
  sendHomepageFile(res, 'avatars', owner.avatar);
});

app.get('/downloads', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('downloads.html', { root: path.join(__dirname, 'public') });
});

// "Switching from Discord": what's the same, what's different, and bringing a community over.
app.get('/switching', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('switching.html', { root: path.join(__dirname, 'public') });
});

// How to delete your data without deleting your account (Google Play links to it), and what's kept.
app.get('/delete-data', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('delete-data.html', { root: path.join(__dirname, 'public') });
});

// Supporting Rainlit (lib/supporters.js): the plan, and choosing it (public/support.js).
app.get('/support', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('support.html', { root: path.join(__dirname, 'public') });
});

// Stripe telling Rainlit how people support it: a checkout finished, a subscription renewed,
// changed or ended. Checked by its signature, so nobody else can say so. (Anything but a yes,
// and Stripe tries again later.)
app.post('/stripe/webhook', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  if (!supporters.enabled) return res.sendStatus(404);
  if (!Buffer.isBuffer(req.body) || !supporters.verify(req.body, req.get('stripe-signature'))) return res.sendStatus(400);
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  try {
    await supporters.onEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error(`[support] Couldn't handle Stripe's ${event.type}: ${err.message}`);
    res.sendStatus(500);
  }
});

// ---------- API ----------

const api = express.Router();
const smallJson = express.json({ limit: '32kb' });
const pageJson = express.json({ limit: '400kb' }); // (a whole homepage, saved at once)
api.use((req, res, next) => (req.path === '/homepages/me' ? pageJson : smallJson)(req, res, next));
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
  const open = !setupCode && signups.isOpen();
  const left = open ? signups.spotsLeft(mail.enabled) : 0;
  res.json({
    setupNeeded: Boolean(setupCode), mail: mail.enabled, openSignups: open, full: open && left === 0,
    // (The sign-in page's live count: spots left today, of how many a day, and who's waiting.)
    ...(open ? { spotsLeft: left, spotsPerDay: signups.dailyCap(), waiting: mail.enabled ? signups.waiting() : 0 } : {}),
  });
});

// ----- Open sign-ups (lib/signups.js) -----

// The bot check's puzzle, for the sign-up (and waitlist) form to solve while it's being filled in.
api.get('/signup-challenge', (_req, res) => res.json(signups.challenge()));

// Full for today: leave an email, and get an invite when there's room.
api.post('/waitlist', (req, res) => {
  const b = req.body || {};
  if (!signups.isOpen()) return fail(res, 400, 'Sign-ups here need an invite code.');
  if (!mail.enabled) return fail(res, 400, "This Rainlit can't send emails, so it has no waitlist. Try again tomorrow.");
  if (!signups.checkProof(b.proof)) return fail(res, 400, 'That took too long. Try again.');
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 254 || !people.EMAIL_RE.test(email)) return fail(res, 400, "That email address doesn't look right.");
  if (signups.throwaway(email)) return fail(res, 400, 'Please use your real email address, not a throwaway one.');
  if (people.userByLogin(email)) return fail(res, 409, 'An account already uses that email. Sign in instead.');
  signups.join(email);
  res.json({ ok: true, waiting: signups.waiting() });
});

// Every ten minutes: invite as many from the waitlist as there's room for today. (They come
// before anyone new: see spotsLeft.)
function releaseWaitlist(count) {
  if (!mail.enabled) return 0;
  return signups.release(count, (email, code) => {
    const base = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '') || process.env.RENDER_EXTERNAL_URL || '';
    mail.sendLater(mail.waitlistEmail(email, code, `${base}/?invite=${encodeURIComponent(code)}`), 'a waitlist invite');
  });
}
setInterval(() => {
  signups.tidy();
  if (signups.isOpen()) releaseWaitlist(signups.roomToday());
}, 600_000).unref();

// The admin's side: open sign-ups or not, the daily cap, and the waitlist.
const signupState = () => ({ open: signups.isOpen(), cap: signups.dailyCap(), room: signups.roomToday(), waiting: signups.waiting(), mail: mail.enabled });
api.get('/admin/signups', needAdmin, (_req, res) => res.json(signupState()));
api.put('/admin/signups', needAdmin, (req, res) => {
  const b = req.body || {};
  signups.configure({ open: typeof b.open === 'boolean' ? b.open : undefined, cap: b.cap });
  res.json(signupState());
});
api.post('/admin/waitlist/release', needAdmin, (req, res) => {
  if (!mail.enabled) return fail(res, 400, "This Rainlit can't send emails, so it can't invite the waitlist.");
  const invited = releaseWaitlist(Math.max(0, Math.min(500, Number((req.body || {}).count) || 0)));
  res.json({ invited, ...signupState() });
});

// ----- Announcements (lib/announcements.js) -----
// Whoever runs the server telling everyone something: each shows once, until "Got it".

api.get('/announcements', needUser, (req, res) => res.json({ announcements: announcements.unseenFor(req.user) }));
api.post('/announcements/seen', needUser, (req, res) => {
  announcements.markSeen(req.user.id, (req.body || {}).upTo);
  res.json({ ok: true });
});
api.get('/admin/announcements', needAdmin, (_req, res) => res.json({ announcements: announcements.list(), noticeDays: announcements.NOTICE_DAYS }));
api.post('/admin/announcements', needAdmin, (req, res) => {
  let made;
  try {
    made = announcements.create(req.user.id, req.body || {});
  } catch (err) {
    if (err instanceof announcements.AnnouncementError) return fail(res, 400, err.message);
    throw err;
  }
  announcements.markSeen(req.user.id, made.id); // (not shown to whoever sent it)
  realtime.sendToEveryone({ type: 'announcement', announcement: made, from: req.user.id }); // (anyone with Rainlit open sees it now)
  res.json({ announcement: made });
});
api.delete('/admin/announcements/:id', needAdmin, (req, res) => {
  if (!announcements.remove(req.params.id)) return fail(res, 404, "That announcement isn't there any more.");
  res.json({ ok: true });
});

// ----- Feedback (lib/feedback.js) -----
// A bug, an idea or anything else, from Settings straight to this server's admins, who hear at
// once; a reply, or its being done, reaches whoever sent it.

const feedbackRoute = (fn) => (req, res) => {
  try {
    res.json(fn(req));
  } catch (err) {
    if (err instanceof feedback.FeedbackError) return fail(res, err.status, err.message);
    throw err;
  }
};
api.get('/feedback', needUser, (req, res) => res.json({ feedback: feedback.mine(req.user.id) }));
api.post('/feedback', needUser, feedbackRoute((req) => {
  const made = feedback.send(req.user.id, req.body || {});
  for (const r of db.prepare('SELECT id FROM users WHERE is_admin = 1').all()) {
    realtime.sendToUser(r.id, { type: 'feedback-new', kind: made.kind, from: req.user.display_name });
  }
  return { feedback: made };
}));
api.get('/admin/feedback', needAdmin, (_req, res) => res.json({ feedback: feedback.all() }));
api.post('/admin/feedback/:id/done', needAdmin, feedbackRoute((req) => {
  const done = Boolean((req.body || {}).done);
  const { item, userId } = feedback.setDone(req.params.id, done);
  realtime.sendToUser(userId, { type: 'feedback-update', feedback: item, what: done ? 'done' : 'reopened' });
  return { feedback: item };
}));
api.post('/admin/feedback/:id/reply', needAdmin, feedbackRoute((req) => {
  const { item, userId } = feedback.reply(req.params.id, (req.body || {}).text, req.user.id);
  realtime.sendToUser(userId, { type: 'feedback-update', feedback: item, what: item.reply ? 'reply' : 'unreplied', by: req.user.display_name });
  return { feedback: item };
}));
api.delete('/admin/feedback/:id', needAdmin, (req, res) => {
  if (!feedback.remove(req.params.id)) return fail(res, 404, "That feedback isn't there any more.");
  res.json({ ok: true });
});

// An account made without an invite confirms its email before it can reach out to anyone.
function needConfirmed(req, res, next) {
  if (req.user.open_signup && !req.user.email_confirmed_at) {
    return fail(res, 403, 'Confirm your email first: open the link we sent you (or send another from Your profile).');
  }
  next();
}

// ----- Email (lib/mail.js) -----

// Where links in emails go: this server's address (PUBLIC_URL, or the one it was reached at).
function publicUrl(req) {
  const own = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(own) ? own : `${req.protocol}://${req.get('host')}`;
}

// Emails someone a link to confirm their address. Not if one went in the last minute (unless
// the address just changed), or five already today. Returns whether it sent one.
function sendConfirm(req, user, { changed = false } = {}) {
  if (!mail.enabled) return false;
  const today = db.prepare('SELECT created_at FROM email_confirms WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC')
    .all(user.id, Date.now() - 86_400_000);
  if (today.length >= 5 || (!changed && today[0] && Date.now() - today[0].created_at < 60_000)) return false;
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO email_confirms (token_hash, user_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(auth.sha256(token), user.id, user.email, now, now + CONFIRM_DAYS * 86_400_000);
  mail.sendLater(mail.confirmEmail(user, user.email, `${publicUrl(req)}/#confirm=${token}`), 'a confirmation email');
  return true;
}

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

  // Without an invite (open sign-ups): the bot check, and room today, and not too many from here.
  const open = !code && !firstAccount && signups.isOpen();
  if (!open && (!code || (firstAccount && code !== setupCode))) {
    signupTries.fail(req.ip);
    return fail(res, 400, firstAccount ? "That setup code isn't right. It's in the server's logs." : !code ? 'Sign-ups here need an invite code.' : "That invite code isn't right.");
  }
  if (open) {
    if (!signups.checkProof(b.proof)) return fail(res, 400, 'That took too long. Try again.');
    if (openSignupTries.blocked(req.ip)) return fail(res, 429, "You've made a few accounts today. Try again tomorrow.");
    if (signups.spotsLeft(mail.enabled) === 0) {
      return res.status(409).json(mail.enabled
        ? { error: "Rainlit's full for today. Join the waitlist, and we'll email you an invite as soon as there's room.", full: true, waitlist: true }
        : { error: "Rainlit's full for today. Try again tomorrow.", full: true });
    }
  }
  // Their birthday (a neutral age screen: nothing on the form says what age it takes). Too young,
  // and there's no account. The birthday isn't kept; someone under 18 keeps only the day they
  // turn 18, so 18+ channels stay closed until then.
  const born = people.birthdayAge(b.birthday);
  if (!born) return fail(res, 400, 'Enter your birthday.');
  if (born.age < MIN_AGE) {
    console.log('[accounts] A sign-up was turned away: too young.');
    return res.status(403).json({ error: "Sorry, you can't make an account.", tooYoung: true });
  }
  if (!firstAccount && signups.throwaway(email)) return fail(res, 400, 'Please use your real email address, not a throwaway one.');
  if (!people.USERNAME_RE.test(username)) return fail(res, 400, 'Usernames are 2 to 32 characters: letters, numbers, dots and underscores.');
  if (['everyone', 'here'].includes(username)) return fail(res, 409, 'That username is taken.'); // (they mean something in a message)
  if (email.length > 254 || !people.EMAIL_RE.test(email)) return fail(res, 400, "That email address doesn't look right.");
  const pwProblem = checkNewPassword(b.password);
  if (pwProblem) return fail(res, 400, pwProblem);
  if (people.userByUsername(username)) return fail(res, 409, 'That username is taken.');
  if (people.userByLogin(email)) return fail(res, 409, 'An account already uses that email.');

  const hash = await auth.hashPassword(b.password);
  const id = auth.newId();
  const now = Date.now();
  try {
    transaction(() => {
      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, display_name, is_admin, created_at, open_signup, adult_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, email, hash, displayName, firstAccount ? 1 : 0, now, open ? 1 : 0, born.age < 18 ? born.eighteenAt : null);
      badges.welcome(id, now);
      announcements.skipOld(id); // (made under things as they are now)
      if (!firstAccount && !open) {
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
    console.log(`[accounts] New account: @${username}${open ? ' (open sign-up)' : ''}`);
  }
  if (open) openSignupTries.fail(req.ip);
  if (!firstAccount) abuse.noteSignup(req.ip, id); // (several from one place in a day: a flag)
  sendConfirm(req, people.userById(id));
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
  if (user.suspended_at) return fail(res, 403, suspendedText(user));
  signIn(req, res, user.id);
});

function suspendedText(user) {
  return `This account has been suspended by whoever runs this Rainlit.${user.suspended_reason ? ` The reason given: ${user.suspended_reason}` : ''}`;
}

api.post('/logout', (req, res) => {
  auth.endSession(auth.tokenFrom(req));
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// "Forgot your password?": a link by email, good once for an hour. The answer's the same
// whether or not there's such an account (and it's sent after answering, so how long it takes
// doesn't say either).
api.post('/forgot', (req, res) => {
  if (!mail.enabled) return fail(res, 400, "This Rainlit can't send emails. Ask whoever runs it for a reset link.");
  if (forgotTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait a while and try again.');
  forgotTries.fail(req.ip);
  const user = people.userByLogin(String((req.body || {}).login || ''));
  res.json({ ok: true });
  // (Three an hour at most for any account, whoever's asking.)
  if (!user || db.prepare('SELECT COUNT(*) n FROM password_resets WHERE user_id = ? AND by_email = 1 AND created_at > ?').get(user.id, Date.now() - 3600_000).n >= 3) return;
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, by_email) VALUES (?, ?, ?, ?, 1)')
    .run(auth.sha256(token), user.id, now, now + RESET_EMAIL_MINUTES * 60_000);
  mail.sendLater(mail.resetEmail(user, `${publicUrl(req)}/#reset=${token}`), 'a reset email');
});

// A one-time link, from the admin or an email, to set a new password.
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
  const who = people.userById(row.user_id);
  if (who && who.suspended_at) return fail(res, 403, suspendedText(who));
  const hash = await auth.hashPassword(b.password);
  transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // sign out everywhere else
    // (A link that came by email shows the address is theirs.)
    if (row.by_email) db.prepare('UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ?').run(Date.now(), row.user_id);
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
  // (Your card: lib/cards.js. Checked before anything's changed.)
  let card;
  if ('card' in b) {
    try {
      card = cards.clean(req.user, b.card);
    } catch (err) {
      if (err instanceof cards.CardError) return fail(res, err.status, err.message);
      throw err;
    }
  }
  if ('displayName' in b) {
    set.display_name = people.oneLine(b.displayName, people.NAME_MAX);
    if (!set.display_name) return fail(res, 400, "Your display name can't be empty.");
  }
  if ('statusText' in b) set.status_text = people.oneLine(b.statusText, people.STATUS_MAX);
  // A birthday to celebrate (just its month and day), whether others see it celebrated on the day,
  // and the time zone that makes it the day (lib/people.js: Birthdays). None: all three go.
  if ('birthday' in b) {
    const day = b.birthday ? people.cleanBirthday(b.birthday) : null;
    if (b.birthday && !day) return fail(res, 400, "That isn't a day of the year.");
    set.birthday = day;
    set.birthday_shown = day && b.birthdayShown ? 1 : 0;
    set.tz = day ? people.cleanTz(b.tz) || req.user.tz || null : null;
  } else if ('tz' in b && req.user.birthday) {
    set.tz = people.cleanTz(b.tz) || req.user.tz;
  }
  if ('presence' in b) {
    if (!['auto', 'away', 'dnd', 'invisible'].includes(b.presence)) return fail(res, 400, 'Pick online, away, do not disturb or appear offline.');
    set.presence = b.presence;
  }
  if ('theme' in b) {
    const theme = String(b.theme || '');
    if (!themes.known(theme)) return fail(res, 400, "That isn't one of Rainlit's themes.");
    if (!themes.allowed(req.user, theme)) return fail(res, 403, 'That theme comes with Glow.');
    set.theme = theme;
  }
  const cols = Object.keys(set);
  if (cols.length) {
    db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => set[c]), req.user.id);
  }
  if ('card' in b) cards.save(req.user.id, card);
  // (Just your theme: no one else sees it, so only your other devices hear.)
  if (cols.length === 1 && cols[0] === 'theme' && !('card' in b)) {
    const me = people.selfUser(people.userById(req.user.id));
    realtime.sendToUser(req.user.id, { type: 'me', user: me });
    return res.json({ user: me });
  }
  res.json({ user: people.selfUser(profileChanged(req.user.id)) });
});

// The link in a confirmation email (the app passes its token here). Works signed in or not.
api.post('/confirm-email', (req, res) => {
  if (ipTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
  const row = db.prepare('SELECT * FROM email_confirms WHERE token_hash = ?').get(auth.sha256(String((req.body || {}).token || '')));
  const user = row && people.userById(row.user_id);
  if (!row || !user || row.expires_at < Date.now() || user.email !== row.email) {
    ipTries.fail(req.ip);
    return fail(res, 400, "That link has expired, or it's for an email address that's been changed since. You can send a new one from your profile.");
  }
  if (!row.used_at) {
    db.prepare('UPDATE email_confirms SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
    db.prepare('UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ?').run(Date.now(), user.id);
  }
  res.json({ ok: true, email: user.email, ...(req.user && req.user.id === user.id ? { user: people.selfUser(people.userById(user.id)) } : {}) });
});

// Another confirmation email (from your profile).
api.post('/me/confirm-email', needUser, (req, res) => {
  if (!mail.enabled) return fail(res, 400, "This Rainlit can't send emails.");
  if (req.user.email_confirmed_at) return res.json({ ok: true, already: true });
  if (!sendConfirm(req, req.user)) return fail(res, 429, 'One was just sent. Give it a minute, and check your spam folder.');
  res.json({ ok: true });
});

// A new email address (your password first). It needs confirming, and the old address is told.
api.post('/me/email', needUser, async (req, res) => {
  const b = req.body || {};
  if (ipTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
  if (!(await auth.checkPassword(String(b.password || ''), req.user.password_hash))) {
    ipTries.fail(req.ip);
    return fail(res, 400, "Your password isn't right.");
  }
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 254 || !people.EMAIL_RE.test(email)) return fail(res, 400, "That email address doesn't look right.");
  if (email === req.user.email) return fail(res, 400, "That's already your email.");
  if (people.userByLogin(email)) return fail(res, 409, 'An account already uses that email.');
  try {
    db.prepare('UPDATE users SET email = ?, email_confirmed_at = NULL WHERE id = ?').run(email, req.user.id);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return fail(res, 409, 'An account already uses that email.');
    throw err;
  }
  const user = people.userById(req.user.id);
  if (mail.enabled) {
    mail.sendLater(mail.changedEmail(user, req.user.email, email, publicUrl(req)), 'a changed-email notice');
    sendConfirm(req, user, { changed: true });
  }
  res.json({ user: people.selfUser(user) });
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

// ----- Deleting your account (lib/accounts.js) -----

// What deleting it would do (the spaces you own, and who each passes to), to show first.
api.get('/me/deletion', needUser, (req, res) => {
  res.json(accounts.preview(req.user.id));
});

// Saying you're 18 or older, to open the channels spaces have marked 18+ (asked once, the first
// time you open one). Your other devices hear, and their channel lists open up too.
api.post('/me/adult', needUser, (req, res) => {
  if (!people.confirmAdult(req.user.id)) return fail(res, 403, '18+ channels open for you when you turn 18.');
  const user = people.selfUser(people.userById(req.user.id));
  realtime.sendToUser(req.user.id, { type: 'me', user });
  res.json({ user });
});

// For good. Your password first, so a device someone else picked up can't do it.
api.delete('/me', needUser, async (req, res) => {
  if (ipTries.blocked(req.ip)) return fail(res, 429, 'Too many tries. Wait 15 minutes and try again.');
  if (!(await auth.checkPassword(String((req.body || {}).password || ''), req.user.password_hash))) {
    ipTries.fail(req.ip);
    return fail(res, 400, "That password isn't right.");
  }
  if (accounts.lastAdmin(req.user.id)) {
    return fail(res, 400, "You're the only admin of this Rainlit server, so your account can't be deleted: nobody would be left to look after it.");
  }
  const userId = req.user.id;
  // (Supporting Rainlit stops with it: nobody would be left to support as.)
  if (!(await supporters.forget(req.user))) {
    return fail(res, 502, "Your Glow couldn't be stopped just now, so your account wasn't deleted (you'd keep paying). Try again in a few minutes.");
  }
  realtime.forgetUser(userId); // (out of any call, and signed out everywhere)
  const done = accounts.deleteAccount(userId);
  if (done) {
    for (const h of done.handedOver) {
      spaces.log(h.space, null, 'owner-deleted', h.heir, { user: h.heirName });
    }
    for (const [channelId, ids] of Object.entries(done.gone)) {
      const channel = spaces.channel(channelId);
      for (const id of channel ? spaces.channelAudience(channel) : []) realtime.sendToUser(id, { type: 'dm-gone', dm: channelId, ids });
    }
    for (const id of done.spaces) spaceChanged(id);
    realtime.friendsChanged(...done.friends);
  }
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Your data, to take with you (lib/export.js): a .zip of what's yours here. One every few minutes
// (it's a fair bit of work for the server).
const EXPORT_EVERY_MS = 5 * 60_000;
const exportedAt = new Map();
api.get('/me/export', needUser, async (req, res) => {
  const last = exportedAt.get(req.user.id) || 0;
  if (Date.now() - last < EXPORT_EVERY_MS) return fail(res, 429, 'You just downloaded your data. You can again in a few minutes.');
  exportedAt.set(req.user.id, Date.now());
  try {
    const out = await yourData.build(req.user.id);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${out.name}"`);
    res.set('Cache-Control', 'no-store');
    res.send(out.buf);
  } catch (err) {
    exportedAt.delete(req.user.id);
    console.error(`[export] Couldn't put @${req.user.username}'s data together: ${err.message}`);
    fail(res, 500, "Couldn't put your data together. Try again in a bit.");
  }
});

// Your own record of your calls (lib/callrecord.js): on or off, or deleted.
api.put('/me/call-record', needUser, (req, res) => {
  callrecord.setKeeping(req.user.id, Boolean((req.body || {}).on));
  res.json({ user: people.selfUser(people.userById(req.user.id)) });
});
api.delete('/me/call-record', needUser, (req, res) => {
  res.json({ deleted: callrecord.clear(req.user.id) });
});

// A record of your time with a friend (lib/record.js), as a page to keep or print: ?from= and
// ?to= (when, in ms: to is the moment after), ?messages=1 for your messages too, ?tz= and ?locale=
// for how times are written. (Not twice in a row.)
const recordedAt = new Map();
api.get('/friends/:friendId/record', needUser, (req, res) => {
  const friend = people.userById(String(req.params.friendId));
  const q = req.query;
  if (!friend || friend.id === req.user.id) return fail(res, 404, "There's no one like that.");
  const talked = db.prepare('SELECT 1 FROM dms WHERE id = ?').get(dms.dmIdOf(req.user.id, friend.id)) || callrecord.hasAny(req.user.id, friend.id);
  if (!talked) return fail(res, 404, `You haven't talked with ${friend.display_name} on Rainlit yet.`);
  if (Date.now() - (recordedAt.get(req.user.id) || 0) < 2000) return fail(res, 429, 'One moment: you just saved one.');
  recordedAt.set(req.user.id, Date.now());
  const ms = (v) => (v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const out = records.build(req.user.id, friend.id, { from: ms(q.from), to: ms(q.to), withMessages: q.messages === '1', tz: q.tz, locale: q.locale });
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${out.name}"`);
  res.set('Cache-Control', 'no-store');
  res.send(out.html);
});

function removeAvatarFile(name) {
  if (name) blobs.remove('avatars', name);
}
const AVATAR_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

api.put('/me/avatar', needUser, express.raw({ type: () => true, limit: AVATAR_MAX }), async (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const kind = imageKind(buf);
  if (!kind) return fail(res, 400, 'Profile pictures can be PNG, JPG, GIF or WebP.');
  // A big one's made smaller (never more compressed), and a photo's hidden location comes out.
  let pic = { buf, ext: kind };
  try {
    pic = await images.avatar(buf, kind);
  } catch {}
  // A new name each time, so everyone's browser fetches the new picture instead of a saved copy.
  const name = `${req.user.id}-${crypto.randomBytes(4).toString('hex')}.${pic.ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, name), pic.buf);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(name, req.user.id);
  blobs.offload('avatars', name, AVATAR_TYPES[pic.ext]); // (to R2, if it's set up)
  removeAvatarFile(req.user.avatar);
  res.json({ user: people.selfUser(profileChanged(req.user.id)) });
});

api.delete('/me/avatar', needUser, (req, res) => {
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  removeAvatarFile(req.user.avatar);
  res.json({ user: people.selfUser(profileChanged(req.user.id)) });
});

// Profile pictures from before they were made smaller (and had their location taken out): once,
// a minute after the first start with this.
setTimeout(async () => {
  if (settings.get('avatarsTidied')) return;
  for (const u of db.prepare('SELECT id, avatar FROM users WHERE avatar IS NOT NULL').all()) {
    try {
      const src = await blobs.localCopy('avatars', u.avatar);
      if (!src) continue;
      const buf = await fs.promises.readFile(src);
      const kind = imageKind(buf);
      const pic = kind ? await images.avatar(buf, kind) : { buf };
      if (pic.buf === buf) continue;
      const name = `${u.id}-${crypto.randomBytes(4).toString('hex')}.${pic.ext}`;
      await fs.promises.writeFile(path.join(AVATAR_DIR, name), pic.buf);
      const moved = db.prepare('UPDATE users SET avatar = ? WHERE id = ? AND avatar = ?').run(name, u.id, u.avatar).changes;
      if (moved) blobs.offload('avatars', name, AVATAR_TYPES[pic.ext]);
      removeAvatarFile(moved ? u.avatar : name);
      if (moved) profileChanged(u.id);
    } catch {}
  }
  settings.set('avatarsTidied', '1');
}, 60_000).unref();

// ----- Your files: everything you've sent that's still kept, biggest first -----
// So there's an easy way to make room (lib/storage.js), wherever you sent them, even in a
// conversation or space you're no longer in.

function whereSent(user, dmId) {
  if (!dmId.includes(':')) {
    const c = spaces.channel(dmId);
    const s = c && spaces.getSpace(c.space_id);
    return c ? `#${c.name}${s ? ` in ${s.name}` : ''}` : 'A space';
  }
  const other = dmId.split(':').find((id) => id !== user.id);
  if (!other) return 'Your notes';
  const u = people.userById(other);
  return u ? `To ${u.display_name}` : 'To someone';
}

api.get('/me/files', needUser, (req, res) => {
  const files = db.prepare(`
    SELECT id, dm_id, file_name, file_size, file_type, created_at FROM messages
    WHERE author_id = ? AND kind = 'file' AND file_path IS NOT NULL ORDER BY file_size DESC LIMIT 1000
  `).all(req.user.id).map((r) => ({
    id: r.id, name: r.file_name, size: r.file_size, type: r.file_type, at: r.created_at,
    url: dms.fileUrl(r.id, r.file_name), where: whereSent(req.user, r.dm_id),
  }));
  res.json({ ...storage.of(req.user), files });
});

// Deleting one: like deleting it in its conversation (those who can see it are told).
api.delete('/me/files/:id', needUser, (req, res) => {
  const r = dms.getRow(req.params.id);
  if (!r || r.kind !== 'file' || r.author_id !== req.user.id) return fail(res, 404, "That file isn't there any more.");
  if (r.dm_id === `${req.user.id}:${req.user.id}`) {
    dms.deleteMessage(r.id);
    realtime.sendToUser(req.user.id, { type: 'dm-gone', dm: r.dm_id, ids: [r.id], notes: dms.notesUsage(r.dm_id) });
  } else {
    dms.removeMessage(r.id);
    const channel = !r.dm_id.includes(':') && spaces.channel(r.dm_id);
    const audience = channel ? spaces.channelAudience(channel) : r.dm_id.includes(':') ? r.dm_id.split(':') : [];
    for (const id of audience) realtime.sendToUser(id, { type: 'dm-removed', dm: r.dm_id, id: r.id, by: req.user.id, name: req.user.display_name, was: 'file' });
  }
  res.json({ ok: true, storage: storage.of(people.userById(req.user.id)) });
});

// ----- Supporting Rainlit (lib/supporters.js) -----
// For the support page (public/support.js): as whoever's signed in there, or whoever an app's
// link (/support?k=...) is for, since the apps open it in a browser that may not be signed in.

const supportUser = (req) => {
  const u = req.user || supporters.userForLink(String((req.body && req.body.k) || req.query.k || ''));
  return u && !u.suspended_at ? people.userById(u.id) : null;
};
const siteOrigin = (req) => `${req.protocol}://${req.get('host')}`;
const supportRoute = (fn) => async (req, res) => {
  const u = supportUser(req);
  if (!u) return fail(res, 401, 'Please sign in.');
  try {
    res.json(await fn(u, req.body || {}, req));
  } catch (err) {
    if (err instanceof supporters.SupportError) return fail(res, err.status, err.message);
    throw err;
  }
};

// The plan, this month's costs, and how you support. (Back from paying, `thanks` is the
// checkout: it's checked with Stripe at once.)
api.get('/support', async (req, res) => {
  let u = supportUser(req);
  if (u && req.query.thanks) {
    await supporters.confirm(u, String(req.query.thanks)).catch(() => {});
    u = people.userById(u.id);
  }
  res.json({
    ...supporters.plan(),
    free: { fileMb: storage.fileMb(), roomMb: storage.personMb(), homepageMb: homepages.FILES_MB, homepagePieces: homepages.PIECES_MAX, notes: NOTES_MAX },
    me: u ? { username: u.username, displayName: u.display_name, ...supporters.statusOf(u) } : null,
  });
});
api.post('/support/checkout', supportRoute(async (u, b, req) => ({ url: await supporters.checkout(u, String(b.plan || ''), siteOrigin(req)) })));
api.post('/support/tip', supportRoute(async (u, b, req) => ({ url: await supporters.tip(u, b.cents, siteOrigin(req)) })));
api.post('/support/manage', supportRoute(async (u, _b, req) => ({ url: await supporters.manageUrl(u, siteOrigin(req)) })));
// A link to the support page, for an app to open in a browser (for half an hour).
api.post('/support/link', needUser, (req, res) => res.json({ url: `/support?k=${supporters.linkFor(req.user.id)}` }));

// ----- Friends -----

api.get('/friends', needUser, (req, res) => {
  const out = {
    friends: [], incoming: [], outgoing: [], maxFileMb: storage.fileMbFor(req.user), storage: storage.of(req.user), klipyKey: KLIPY_KEY, quickReactions: dms.quickReactions(req.user.id),
    support: supporters.enabled,
    blocked: safety.blockedBy(req.user.id).map((id) => people.userById(id)).filter(Boolean).map(people.publicUser),
    voice: voice.enabled,
    mail: mail.enabled,
    ...(req.user.is_admin ? { openReports: safety.openReportCount(), openFlags: abuse.openCount(), newFeedback: feedback.unseenCount() } : {}),
  };
  const convos = dms.summariesFor(req.user.id);
  for (const c of people.connectionsOf(req.user.id)) {
    const u = people.publicUser(c.user);
    if (c.kind === 'friend') {
      out.friends.push({ ...u, presence: realtime.presenceOf(u.id), doing: realtime.doingOf(u.id), dm: convos[u.id] || { save: true, unread: 0, readAt: 0, lastAt: 0 } });
    } else {
      out[c.kind].push(u);
    }
  }
  res.json(out);
});

api.post('/friends', needUser, needConfirmed, (req, res) => {
  const target = people.userByUsername(String((req.body || {}).username || '').trim());
  if (!target) return fail(res, 404, 'No one has that username. Check the spelling?');
  if (target.id === req.user.id) return fail(res, 400, "That's you!");
  if (safety.hasBlocked(req.user.id, target.id)) return fail(res, 400, `You've blocked ${target.display_name}. Unblock them first.`);
  // (Someone who blocked you isn't told apart from anything else going wrong.)
  if (safety.hasBlocked(target.id, req.user.id)) return fail(res, 400, "Your friend request didn't go through.");
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

// ----- Blocking -----

api.put('/blocks/:id', needUser, (req, res) => {
  const other = people.userById(req.params.id);
  if (!other) return fail(res, 404, 'Not found.');
  if (other.id === req.user.id) return fail(res, 400, "You can't block yourself.");
  safety.block(req.user.id, other.id);
  realtime.friendsChanged(req.user.id, other.id);
  res.json({ ok: true });
});

api.delete('/blocks/:id', needUser, (req, res) => {
  safety.unblock(req.user.id, String(req.params.id));
  realtime.friendsChanged(req.user.id);
  res.json({ ok: true });
});

// ----- Reports -----
//
// About a message (in a channel you can see, or a DM you're in) or a person you can see.
// Space reports go to its moderators, and every report to the server's admin.

// Who hears about a new report: the server's admins, and the space's moderators.
function reportHandlers(spaceId) {
  const ids = new Set(db.prepare('SELECT id FROM users WHERE is_admin = 1').all().map((r) => r.id));
  if (spaceId) for (const id of spaces.memberIds(spaceId)) if (spaces.canHandleReports(spaces.memberOf(spaceId, id))) ids.add(id);
  return ids;
}

api.post('/reports', needUser, async (req, res) => {
  const b = req.body || {};
  if (!safety.REASONS.includes(b.reason)) return fail(res, 400, 'Pick what the problem is.');
  if (safety.reportsLastHour(req.user.id) >= safety.REPORTS_PER_HOUR) return fail(res, 429, "You've sent a lot of reports. Try again in a while.");
  const r = { reporterId: req.user.id, reason: b.reason, note: b.note || '' };
  let question = null;
  if (b.questionId) {
    // A question in your own "ask me anything" box. Whoever handles the report sees who asked it;
    // you still aren't told, if they asked anonymously.
    question = homepages.questionById(String(b.questionId));
    if (!question || question.owner_id !== req.user.id) return fail(res, 404, "That question isn't there any more.");
    r.targetId = question.asker_id;
    r.snapshot = { kind: 'question', text: question.text, anonymous: Boolean(question.anonymous), answer: question.answer || null, at: question.created_at };
  } else if (b.messageId) {
    const m = dms.getMessage(String(b.messageId)) || dms.passingMessage(String(b.messageId));
    if (!m || !['text', 'file', 'gif'].includes(m.kind)) return fail(res, 404, "That message isn't there any more.");
    const channel = spaces.channel(m.dm);
    if (channel) {
      const access = spaces.channelAccess(channel, spaces.memberOf(channel.space_id, req.user.id));
      if (!access || !access.see) return fail(res, 404, "That message isn't there any more.");
      r.spaceId = channel.space_id;
    } else if (!dms.inDm(m.dm, req.user.id)) {
      return fail(res, 404, "That message isn't there any more.");
    }
    if (m.author === req.user.id) return fail(res, 400, "That's your own message.");
    const space = r.spaceId && spaces.getSpace(r.spaceId);
    Object.assign(r, {
      targetId: m.author, convId: m.dm, messageId: m.id,
      snapshot: {
        kind: m.kind, text: String(m.text || '').slice(0, 2000), at: m.at,
        file: m.file ? { name: m.file.name, type: m.file.type, size: m.file.size } : null,
        gif: m.kind === 'gif' && m.meta ? { title: m.meta.title || '', url: m.meta.img || m.meta.mp4 || '' } : null,
        channel: channel ? channel.name : null, space: space ? space.name : null,
      },
    });
  } else {
    const target = people.userById(String(b.userId || ''));
    // (Their homepage: anyone who can see it can report it, with a copy of what it says.)
    const page = target && b.homepage ? homepages.get(target.id) : null;
    const visible = target && (page ? homepages.canView(req.user, target, page.visibility)
      : people.friendship(req.user.id, target.id) || spaces.shareSpace(req.user.id, target.id));
    if (!visible) return fail(res, 404, 'Not found.');
    if (target.id === req.user.id) return fail(res, 400, "That's you!");
    r.targetId = target.id;
    if (page) {
      const pictures = page.doc ? page.doc.pieces.filter((p) => p.t === 'image').length + (page.doc.bg.file ? 1 : 0) : 0;
      r.snapshot = { kind: 'homepage', text: homepages.textOf(page.doc), pictures };
    }
    // From a space's members list: that space's moderators see it too.
    if (b.spaceId && spaces.isMember(b.spaceId, req.user.id) && spaces.isMember(b.spaceId, target.id)) r.spaceId = String(b.spaceId);
  }
  // (A question's report is always a new one: matching it to an earlier report about the same
  // person would tell you two anonymous questions came from the same someone.)
  const already = !question && safety.openReportFor(req.user.id, r.messageId || null, r.targetId);
  const id = already ? already.id : safety.addReport(r);
  const adminOnly = safety.ADMIN_ONLY.includes(r.reason);
  if (!already) {
    // A child: a copy's made before anything else can happen to it (lib/evidence.js).
    if (r.reason === 'child') {
      await evidence.keep({ reportId: id, reason: r.reason, messageId: r.messageId || null, targetId: r.targetId, homepage: (r.snapshot || {}).kind === 'homepage' })
        .catch((err) => console.error(`[evidence] Couldn't keep a copy for report ${id}: ${err.message}`));
    }
    for (const uid of reportHandlers(adminOnly ? null : r.spaceId)) realtime.sendToUser(uid, { type: 'report-new', space: adminOnly ? null : r.spaceId || null });
    // (These can't wait for the admin to open Rainlit: an email too, never saying what it is.)
    if (adminOnly && mail.enabled) {
      for (const a of db.prepare('SELECT * FROM users WHERE is_admin = 1 AND email IS NOT NULL').all()) {
        mail.sendLater(mail.urgentReportEmail(a, r.reason, publicUrl(req), Date.now() + safety.INTIMATE_MS), 'an urgent report');
      }
    }
  }
  if (b.block && question && question.anonymous) {
    // (Whoever asked it anonymously can't ask you any more, and you still don't know who it was.)
    homepages.stopAsker(req.user.id, question.asker_id);
  } else if (b.block) {
    safety.block(req.user.id, r.targetId);
    realtime.friendsChanged(req.user.id, r.targetId);
  }
  res.json({ ok: true, id });
});

function needReportHandler(req, res, next) {
  if (!spaces.canHandleReports(req.member)) return fail(res, 403, "Only the space's moderators can see its reports.");
  next();
}

api.get('/spaces/:spaceId/reports', needUser, needMember, needReportHandler, (req, res) => {
  res.json({ reports: safety.reportsForSpace(req.space.id) });
});

function resolveRoute(scope) {
  return (req, res) => {
    const r = safety.reportById(req.params.reportId);
    if (!r || (scope === 'space' && r.space_id !== req.space.id)) return fail(res, 404, "That report isn't there any more.");
    const resolved = (req.body || {}).resolved !== false;
    safety.setResolved(r.id, req.user.id, resolved);
    // (A copy kept for a report about a child, that the admin didn't find was one: it goes.)
    const kept = resolved && scope === 'admin' && evidence.forReport(r.id);
    if (kept && !kept.confirmedAt) evidence.discard(kept.id);
    if (r.space_id && spaces.getSpace(r.space_id)) {
      const target = people.userById(r.target_id);
      spaces.log(r.space_id, req.user.id, resolved ? 'report-resolve' : 'report-reopen', r.target_id, { user: target ? target.display_name : 'someone', reason: r.reason });
    }
    for (const uid of reportHandlers(r.space_id)) realtime.sendToUser(uid, { type: 'report-new', space: r.space_id || null, quiet: true });
    res.json({ ok: true });
  };
}
api.post('/spaces/:spaceId/reports/:reportId/resolve', needUser, needMember, needReportHandler, resolveRoute('space'));
api.get('/admin/reports', needAdmin, (_req, res) => {
  const cases = evidence.byReport();
  // (Whether a reported message is still there, for taking it down.)
  const there = (id) => { const row = dms.getRow(id); return row ? ['text', 'file', 'gif'].includes(row.kind) : Boolean(dms.passingMessage(id)); };
  res.json({ reports: safety.allReports().map((r) => ({ ...r, evidence: cases.get(r.id) || null, ...(r.messageId ? { messageGone: !there(r.messageId) } : {}) })) });
});
api.post('/admin/reports/:reportId/resolve', needAdmin, resolveRoute('admin'));

// The admin taking a reported message down, wherever it is: a DM, or any space's channel (an
// intimate picture shared without permission, say, which has to be down within 48 hours).
// Everyone in the conversation sees "This server's admin removed Bea's message".
function removeAsAdmin(id) {
  const row = dms.getRow(id);
  const passing = !row && dms.passingMessage(id);
  const m = row ? { dm: row.dm_id, author: row.author_id, kind: row.kind } : passing ? { dm: passing.dm, author: passing.author, kind: passing.kind } : null;
  if (!m || !['text', 'file', 'gif'].includes(m.kind)) return false;
  if (row) dms.removeMessage(id, 'admin');
  else dms.forgetPassing(id);
  const channel = spaces.channel(m.dm);
  const author = people.userById(m.author);
  const authorName = author ? author.display_name : 'someone';
  const was = m.kind === 'file' ? 'file' : 'message';
  const audience = channel ? spaces.channelAudience(channel) : [...new Set(String(m.dm).split(':'))];
  for (const uid of audience) realtime.sendToUser(uid, { type: 'dm-removed', dm: m.dm, id, by: 'admin', name: "This server's admin", was, author: m.author, authorName });
  if (channel) spaces.log(channel.space_id, null, 'message-remove', m.author, { user: authorName, channel: channel.name, was, admin: true });
  return true;
}

api.post('/admin/reports/:reportId/remove', needAdmin, (req, res) => {
  const r = safety.reportById(req.params.reportId);
  if (!r || !r.message_id) return fail(res, 404, "That report isn't about a message.");
  if (!removeAsAdmin(r.message_id)) return fail(res, 404, "That message isn't there any more.");
  res.json({ ok: true });
});

// Sexual content involving a child, found to be what the report says (from any report: someone
// may have picked another reason). Its copy's kept a year (made now, if there isn't one yet), it
// comes down (the message, the homepage, or a reported person's profile picture), and the account
// is suspended. Then the admin reports it to NCMEC's CyberTipline, and notes the report's number.
api.post('/admin/reports/:reportId/evidence', needAdmin, async (req, res) => {
  const r = safety.reportById(req.params.reportId);
  if (!r) return fail(res, 404, "That report isn't there any more.");
  const snapshot = safety.reportJson(r).snapshot || {};
  const before = evidence.forReport(r.id);
  const c = before
    ? evidence.confirm(before.id, req.user.id)
    : await evidence.keep({ reportId: r.id, reason: r.reason, messageId: r.message_id, targetId: r.target_id, homepage: snapshot.kind === 'homepage' }, { confirmedBy: req.user.id });
  if (r.message_id) removeAsAdmin(r.message_id);
  const u = people.userById(r.target_id);
  if (u && !u.is_admin) {
    if (snapshot.kind === 'homepage') homepages.clear(u.id);
    else if (!r.message_id && snapshot.kind !== 'question' && u.avatar) {
      db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(u.id);
      removeAvatarFile(u.avatar);
    }
    if (!u.suspended_at) suspendUser(u, 'Child safety');
  }
  safety.setResolved(r.id, req.user.id, true);
  for (const uid of reportHandlers(null)) realtime.sendToUser(uid, { type: 'report-new', space: null, quiet: true });
  res.json({ case: evidence.summary(c) });
});

// What's being kept, and each one's CyberTipline report number.
api.get('/admin/evidence', needAdmin, (_req, res) => res.json({ cases: evidence.list(), keepDays: Math.round(evidence.KEEP_MS / 86_400_000) }));
api.put('/admin/evidence/:id', needAdmin, (req, res) => {
  const c = evidence.setTipline(req.params.id, (req.body || {}).tipline);
  if (!c || !c.confirmedAt) return fail(res, 404, "That isn't being kept any more.");
  res.json({ case: evidence.summary(c) });
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
  if (!u || (!f && u.id !== req.user.id && !spaces.shareSpace(req.user.id, u.id))) return fail(res, 404, 'Not found.');
  const presence = f && f.status === 'accepted' ? realtime.presenceOf(u.id) : null;
  res.json({ user: { ...people.publicUser(u), presence, doing: realtime.doingOf(u.id) } });
});

// ----- Homepages -----
// (lib/homepages.js) Someone's page, by id or @username. A public one can be seen without signing in.

api.get('/homepages/:who', (req, res) => {
  const owner = homepages.ownerFor(req.params.who);
  if (!owner) return fail(res, 404, 'No one has that username.');
  const page = homepages.get(owner.id);
  if (!homepages.canView(req.user, owner, page.visibility)) {
    const blocked = req.user && (safety.hasBlocked(owner.id, req.user.id) || safety.hasBlocked(req.user.id, owner.id));
    const error = blocked ? "You can't see this homepage."
      : !req.user ? "This homepage isn't public. If you're friends with them on Rainlit, sign in to see it."
      : page.visibility === 'friends' ? 'This homepage is just for their friends.'
      : 'This homepage is just for their friends and people in their spaces.';
    return res.status(403).json({ error, locked: true });
  }
  // (This visit counts too, on the counter it's about to show: every visit but its owner's.)
  if (!req.user || req.user.id !== owner.id) {
    homepages.countView(owner.id);
    page.views++;
  }
  res.json(homepages.forViewer(owner, page, req.user));
});

// Your page (the whole thing, each time it changes), and who can see it.
api.put('/homepages/me', needUser, (req, res) => {
  const b = req.body || {};
  const page = homepages.save(req.user.id, b.doc, b.visibility);
  res.json(homepages.forViewer(req.user, page, req.user));
});

// A picture (or a video, or a song) for your page. It stays as long as it's on the page.
api.post('/homepages/me/files', needUser, express.raw({ type: () => true, limit: homepages.VIDEO_MAX + 1024 }), async (req, res) => {
  const slow = abuse.checkPace(req.user, Buffer.isBuffer(req.body) ? req.body.length : 0);
  if (slow) return fail(res, 429, slow);
  try {
    const file = await homepages.addFile(req.user.id, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    abuse.noteIn(file.bytes);
    res.json({ file: { ...file, url: `/homepage-files/${file.id}` }, usage: homepages.usage(req.user.id) });
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    throw err;
  }
});

// A cover for a shelf, from a link (whatever picture the link shows when it's shared).
api.post('/homepages/me/cover', needUser, async (req, res) => {
  const link = embeds.linkOf((req.body || {}).url);
  if (!link) return fail(res, 400, "That isn't a link.");
  if (!embeds.enabled) return fail(res, 400, "This server doesn't look links up. Add a picture instead.");
  const embed = await embeds.embedFor(link);
  const pic = embed && ((embed.media || []).find((m) => m.kind === 'image') || embed.thumb);
  const original = pic && new URL(pic.src, 'http://x').searchParams.get('u');
  if (!original) return fail(res, 404, "Couldn't find a picture for that link. Add one instead.");
  try {
    const file = await homepages.addFile(req.user.id, await homepages.download(original));
    if (file.kind !== 'image') return fail(res, 404, "Couldn't find a picture for that link. Add one instead.");
    res.json({ file: { ...file, url: `/homepage-files/${file.id}` }, title: homepages.coverTitle(embed.title, embed.site, link), href: link, usage: homepages.usage(req.user.id) });
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    fail(res, 502, "Couldn't get that link's picture. Add one instead.");
  }
});

// The guestbook on someone's page: anyone who can see the page can read it, and sign it if they're
// signed in. What they wrote, they can delete; the page's owner can delete anything in it.
function guestbookPage(req, res) {
  const owner = homepages.ownerFor(req.params.who);
  const page = owner && homepages.get(owner.id);
  if (!owner || !homepages.canView(req.user, owner, page.visibility)) {
    fail(res, 404, "That homepage isn't there.");
    return null;
  }
  return { owner, page };
}
const guestbookJson = (owner, page, user) => ({
  entries: homepages.guestbookFor(owner.id, user),
  canSign: Boolean(user && user.id !== owner.id && homepages.hasGuestbook(page.doc)),
  signedIn: Boolean(user),
});

api.get('/homepages/:who/guestbook', (req, res) => {
  const found = guestbookPage(req, res);
  if (found) res.json(guestbookJson(found.owner, found.page, req.user));
});

api.post('/homepages/:who/guestbook', needUser, (req, res) => {
  const found = guestbookPage(req, res);
  if (!found) return;
  const { owner, page } = found;
  if (owner.id === req.user.id) return fail(res, 400, "That's your own guestbook.");
  if (!homepages.hasGuestbook(page.doc)) return fail(res, 400, "There's no guestbook on this page.");
  try {
    homepages.sign(owner.id, req.user.id, (req.body || {}).text);
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    throw err;
  }
  realtime.sendToUser(owner.id, { type: 'guestbook-new', from: req.user.display_name });
  res.json(guestbookJson(owner, page, req.user));
});

api.delete('/homepages/:who/guestbook/:entryId', needUser, (req, res) => {
  const found = guestbookPage(req, res);
  if (!found) return;
  try {
    homepages.unsign(found.owner.id, req.params.entryId, req.user.id);
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    throw err;
  }
  res.json(guestbookJson(found.owner, found.page, req.user));
});

// The "ask me anything" box on someone's page: anyone signed in who can see the page can ask its
// owner something (anonymously, if the box lets them). Only the owner sees a question until they
// answer it; then anyone who can see the page can read both. Whoever asked can take theirs back,
// and the owner can delete any.
function questionsJson(owner, page, user) {
  const box = homepages.askBox(page.doc);
  const mine = Boolean(user && user.id === owner.id);
  const stopped = Boolean(box && user && !mine && homepages.isStopped(owner.id, user.id));
  return {
    questions: homepages.questionsFor(owner.id, user),
    canAsk: Boolean(box && user && !mine && !stopped),
    stopped,
    anon: Boolean(box && box.anon),
    signedIn: Boolean(user),
    mine,
    ...(mine ? { stoppedCount: homepages.stoppedCount(owner.id) } : {}),
  };
}

api.get('/homepages/:who/questions', (req, res) => {
  const found = guestbookPage(req, res);
  if (found) res.json(questionsJson(found.owner, found.page, req.user));
});

api.post('/homepages/:who/questions', needUser, needConfirmed, (req, res) => {
  const found = guestbookPage(req, res);
  if (!found) return;
  const { owner, page } = found;
  const box = homepages.askBox(page.doc);
  const anonymous = Boolean((req.body || {}).anonymous);
  if (owner.id === req.user.id) return fail(res, 400, "That's your own box.");
  if (!box) return fail(res, 400, "There's no question box on this page.");
  if (anonymous && !box.anon) return fail(res, 400, "They aren't taking anonymous questions.");
  try {
    homepages.ask(owner.id, req.user.id, (req.body || {}).text, anonymous);
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    throw err;
  }
  realtime.sendToUser(owner.id, { type: 'question-new', from: anonymous ? null : req.user.display_name });
  res.json(questionsJson(owner, page, req.user));
});

// The owner answering one, or changing their answer.
api.put('/homepages/:who/questions/:questionId', needUser, (req, res) => {
  const found = guestbookPage(req, res);
  if (!found) return;
  const { owner, page } = found;
  if (owner.id !== req.user.id) return fail(res, 403, 'Only they can answer it.');
  let q;
  try {
    q = homepages.answerQuestion(owner.id, req.params.questionId, (req.body || {}).answer);
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    throw err;
  }
  if (!q) return fail(res, 404, "That question isn't there any more.");
  // (Whoever asked hears it's been answered, the first time.)
  if (!q.answered_at) realtime.sendToUser(q.asker_id, { type: 'question-answered', by: owner.display_name, owner: owner.id });
  res.json(questionsJson(owner, page, req.user));
});

api.delete('/homepages/:who/questions/:questionId', needUser, (req, res) => {
  const found = guestbookPage(req, res);
  if (!found) return;
  try {
    homepages.unask(found.owner.id, req.params.questionId, req.user.id);
  } catch (err) {
    if (err instanceof homepages.HomepageError) return fail(res, err.status, err.message);
    throw err;
  }
  res.json(questionsJson(found.owner, found.page, req.user));
});

// Everyone whose questions you stopped (by reporting one) can ask you again.
api.delete('/homepages/me/question-stops', needUser, (req, res) => {
  homepages.letAllAsk(req.user.id);
  res.json({ ok: true, stoppedCount: 0 });
});

// Someone's pet, on their homepage: anyone who can see the page can pet it (without an account
// too, if the page is public).
api.post('/homepages/:who/pet', (req, res) => {
  const found = guestbookPage(req, res);
  if (!found) return;
  if (!pets.onHomepage(found.owner.id)) return fail(res, 400, "There's no pet on this page.");
  pets.petIt(found.owner.id, req.user ? req.user.id : homepages.visitorKey(req.ip));
  res.json({ pet: pets.onHomepage(found.owner.id) });
});

// ----- Your pet -----
// (lib/pets.js) Adopting one (or changing its kind, name, colours, and whether it's on your
// homepage), letting it go, and looking after it: feeding it, playing with it, petting it. And
// doing up its room.

const petRoute = (fn) => (req, res) => {
  try {
    res.json({ pet: fn(req) });
  } catch (err) {
    if (err instanceof pets.PetError) return fail(res, err.status, err.message);
    throw err;
  }
};
api.get('/pet', needUser, (req, res) => res.json({ pet: pets.get(req.user.id), room: pets.roomOf(req.user.id) }));
api.put('/pet/room', needUser, (req, res) => {
  try {
    res.json({ room: pets.setRoom(req.user, req.body || {}) });
  } catch (err) {
    if (err instanceof pets.PetError) return fail(res, err.status, err.message);
    throw err;
  }
});
api.put('/pet', needUser, petRoute((req) => pets.set(req.user, req.body || {})));
api.delete('/pet', needUser, petRoute((req) => {
  pets.release(req.user.id);
  return null;
}));
api.post('/pet/feed', needUser, petRoute((req) => pets.feed(req.user.id)));
api.post('/pet/play', needUser, petRoute((req) => pets.play(req.user.id)));
api.post('/pet/pet', needUser, petRoute((req) => {
  pets.petIt(req.user.id, req.user.id);
  return pets.get(req.user.id);
}));

// ----- Conversations -----
//
// A conversation is a DM between two friends, or a channel in a space. Either way,
// everything new in it goes out live to everyone in it (every device they have open),
// and the routes below serve both: /dms/:friendId/... and /channels/:channelId/...

const TIMED_OUT = "You're in a timeout here, so you can only read for now.";

// Only friends can message each other. Puts the conversation, and who's in it, on the request.
function needFriend(req, res, next) {
  const friendId = String(req.params.friendId);
  // Your notes: a conversation with yourself, on all your devices, and always kept.
  if (friendId === req.user.id) {
    req.notes = true;
    req.dm = dms.getDm(req.user.id, req.user.id);
    req.audience = [req.user.id];
    return next();
  }
  if (!people.areFriends(req.user.id, friendId)) return fail(res, 404, 'You can only message people on your friends list.');
  req.friendId = friendId;
  req.dm = dms.getDm(req.user.id, friendId);
  req.audience = [req.user.id, friendId];
  next();
}

// A space's channels are for the members who can see them (a private one, only for some
// roles). Puts what you can do in it on the request. (A channel always keeps its messages.)
function needChannel(req, res, next) {
  const channel = spaces.channel(req.params.channelId);
  const member = channel && spaces.memberOf(channel.space_id, req.user.id);
  const access = member && spaces.channelAccess(channel, member);
  if (!access || !access.see) return fail(res, 404, "That channel isn't there, or you can't see it.");
  req.channel = channel;
  req.member = member;
  req.access = access;
  req.dm = { id: channel.id, save: 1 };
  next();
}

// Changing or deleting a channel: for those who could see it, even an 18+ one they haven't
// said they're old enough to open (they can still un-mark it, rename it or delete it).
function needChannelToManage(req, res, next) {
  const channel = spaces.channel(req.params.channelId);
  const member = channel && spaces.memberOf(channel.space_id, req.user.id);
  const access = member && spaces.channelAccess(channel, { ...member, adult: true });
  if (!access || !access.see) return fail(res, 404, "That channel isn't there, or you can't see it.");
  if (!spaces.can(member, 'manageChannels')) return fail(res, 403, NOT_ALLOWED.manageChannels);
  req.channel = channel;
  req.member = member;
  next();
}

const needConv = (req, res, next) => (req.params.channelId
  ? needChannel(req, res, () => (req.channel.kind === 'voice' ? fail(res, 400, "Voice channels don't have messages.") : next()))
  : needFriend(req, res, next));
const conv = (rest = '') => [`/dms/:friendId${rest}`, `/channels/:channelId${rest}`];

function tell(req, msg) {
  for (const id of req.channel ? spaces.channelAudience(req.channel) : req.audience) realtime.sendToUser(id, msg);
  // A new message for a friend who has Rainlit closed: a push notification to their phone.
  // It says who it's from, never what it says.
  const m = msg.type === 'dm-message' && msg.message;
  if (req.friendId && m && m.author === req.user.id && ['text', 'file', 'gif'].includes(m.kind) && !realtime.isOnline(req.friendId)) {
    push.send(req.friendId, { type: 'message', from: { id: req.user.id, name: req.user.display_name } }, { ttl: 24 * 3600 });
  }
}

// Where "new messages" starts for you: what you've read, or (a channel you've never opened) when you joined its space.
function readFloor(req) {
  const at = dms.readAt(req.dm.id, req.user.id);
  return at || !req.channel ? at : req.member.joinedAt;
}

api.get(conv('/messages'), needUser, needConv, (req, res) => {
  if (req.query.after) return res.json({ messages: dms.since(req.dm.id, Number(req.query.after) || 0) });
  const page = dms.history(req.dm.id, Number(req.query.before) || 0);
  const notes = req.notes ? { ...dms.notesUsage(req.dm.id), max: notesMaxFor(req.user) } : undefined;
  res.json({ ...page, save: Boolean(req.dm.save), readAt: readFloor(req), notes });
});

api.post(conv('/messages'), needUser, needConv, (req, res) => {
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
  if (req.access && !req.access.send) return fail(res, 403, req.access.timedOut ? TIMED_OUT : "You can't send messages in this channel.");
  if (req.notes && dms.notesUsage(req.dm.id).count >= notesMaxFor(req.user)) return fail(res, 409, notesFull(req.user));
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
  const mentions = req.channel && fields.kind === 'text' ? spaces.mentionsIn(fields.text, req.channel, req.member) : null;
  if (mentions && (mentions.ids.length || mentions.everyone)) {
    spaces.setMentions(message.id, mentions);
    if (mentions.ids.length) message.mentions = mentions.ids;
    if (mentions.everyone) message.everyone = true;
  }
  tell(req, { type: 'dm-message', message, notes: req.notes ? dms.notesUsage(req.dm.id) : undefined });
  if (req.channel) pushChannelMessage(req, mentions);
  res.json({ message });
});

// A channel message reaches the phones of people who don't have Rainlit open: the ones it
// mentions, and anyone who asked to hear about everything in that space (for them, at most a
// note a minute per channel). Never from someone they've blocked.
const lastChannelPush = new Map();
// A group's name as someone in it sees it: its own, or the other people's names.
function groupTitle(spaceId, forUserId) {
  const space = spaces.getSpace(spaceId);
  if (space && space.name) return space.name;
  const names = spaces.memberIds(spaceId).filter((id) => id !== forUserId).map((id) => (people.userById(id) || {}).display_name).filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
}

function pushChannelMessage(req, mentions) {
  const ids = mentions ? mentions.ids : [];
  const everyone = Boolean(mentions && mentions.everyone);
  const who = req.user.display_name;
  for (const uid of spaces.channelAudience(req.channel)) {
    if (uid === req.user.id || realtime.isOnline(uid)) continue;
    const mentioned = everyone || ids.includes(uid);
    const level = spaces.notifyLevel(req.channel.space_id, uid);
    if (level === 'none' || (level === 'mentions' && !mentioned)) continue;
    if (!mentioned && spaces.channelMuted(req.channel.id, uid)) continue;
    if (safety.hasBlocked(uid, req.user.id)) continue;
    const key = `${uid}:${req.channel.id}`;
    if (!mentioned && Date.now() - (lastChannelPush.get(key) || 0) < 60_000) continue;
    lastChannelPush.set(key, Date.now());
    const group = spaces.isGroup(spaces.getSpace(req.channel.space_id)) && groupTitle(req.channel.space_id, uid);
    const where = group || `#${req.channel.name}`;
    const name = mentioned ? `${who} mentioned you in ${where}` : `${who} in ${where}`;
    push.send(uid, { type: 'message', from: { id: `ch:${req.channel.id}`, name } }, { ttl: 24 * 3600 });
  }
}

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
api.post(conv('/files'), needUser, needConv, (req, res) => {
  const maxBytes = storage.fileMbFor(req.user) * storage.MB;
  const tooBig = `Files can be up to ${storage.fileMbFor(req.user)} MB.`;
  if (req.notes && dms.notesUsage(req.dm.id).count >= notesMaxFor(req.user)) return fail(res, 409, notesFull(req.user));
  if (req.access && !req.access.files) return fail(res, 403, req.access.timedOut ? TIMED_OUT : "You can't send files in this channel.");
  if (!req.dm.save) return fail(res, 409, 'Saving is off in this conversation, so files can only be sent during a call.');
  const id = String(req.get('x-message-id') || '');
  if (!ID_RE.test(id) || dms.getRow(id)) return fail(res, 400, "That upload didn't make sense.");
  const declared = Number(req.get('content-length') || 0);
  if (declared > maxBytes) return fail(res, 413, tooBig);
  // Room: theirs (all their files together), and the disk's (never let fill up).
  const room = storage.of(req.user);
  const noRoom = `You've used ${storage.size(room.used)} of your ${storage.size(room.limit)} for files. Delete some you don't need any more to make room (Your profile, then Your files).`;
  if (room.used + declared > room.limit) return fail(res, 413, noRoom);
  // (A new or flagged account's pace: lib/abuse.js.)
  const slow = abuse.checkPace(req.user, declared);
  if (slow) return fail(res, 429, slow);
  if (!storage.diskHasRoom(declared)) {
    console.warn('[storage] The disk is nearly full, so uploads are paused. Make it bigger (on Render: your service, then Disks).');
    return fail(res, 507, "Rainlit's out of room for files right now, so uploads are paused for a bit. Try again later.");
  }
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
      done(size > maxBytes ? Object.assign(new Error('too big'), { tooBig: true })
        : room.used + size > room.limit ? Object.assign(new Error('no room'), { noRoom: true }) : null, chunk);
    },
  });
  pipeline(req, counter, fs.createWriteStream(partial), async (err) => {
    if (err) {
      fs.rm(partial, { force: true }, () => {});
      if (!res.headersSent && !res.socket?.destroyed) {
        fail(res, err.tooBig || err.noRoom ? 413 : 500, err.tooBig ? tooBig : err.noRoom ? noRoom : 'The upload failed. Try again.');
      }
      return;
    }
    // Its hidden details come out (where and when a photo was taken, on what...: lib/scrub.js).
    size = (await scrub.scrubFile(partial, { type: safeType, name })) ?? size;
    fs.renameSync(partial, final);
    const replyTo = dms.replyTarget(req.dm.id, req.get('x-reply-to'));
    const message = dms.addMessage({ id, dm: req.dm.id, author: req.user.id, kind: 'file', file: { name, size, type: safeType, path: id }, replyTo });
    tell(req, { type: 'dm-message', message, notes: req.notes ? dms.notesUsage(req.dm.id) : undefined });
    if (req.channel) pushChannelMessage(req, null);
    const row = dms.getRow(id);
    // (Its fingerprint and a look at the sender's files (lib/abuse.js), its smaller copy for the
    // chat, then it goes to R2, if that's set up.)
    abuse.noteIn(size);
    Promise.resolve()
      .then(() => abuse.afterUpload(req.user, id, final, size))
      .then(() => row && dms.previewOf(row))
      .finally(() => blobs.offload('files', id));
    res.json({ message, storage: storage.of(req.user) });
  });
});

// Files sent (and homepage pictures and songs) from before hidden details were taken out of
// them: once, in the background, two minutes after the first start with this.
setTimeout(async () => {
  if (settings.get('filesScrubbed')) return;
  const sent = db.prepare('SELECT id, file_path, file_name, file_type, file_size FROM messages WHERE file_path IS NOT NULL').all();
  for (const r of sent) {
    if (!fs.existsSync(path.join(dms.FILES_DIR, r.file_path))) continue; // (in R2: it went there after this)
    const size = await scrub.scrubFile(path.join(dms.FILES_DIR, r.file_path), { type: r.file_type, name: r.file_name });
    if (size != null && size !== r.file_size) db.prepare('UPDATE messages SET file_size = ? WHERE id = ? AND file_path = ?').run(size, r.id, r.file_path);
  }
  for (const f of db.prepare('SELECT id, file, bytes FROM homepage_files').all()) {
    if (!fs.existsSync(path.join(homepages.FILES_DIR, f.file))) continue;
    const size = await scrub.scrubFile(path.join(homepages.FILES_DIR, f.file));
    if (size != null && size !== f.bytes) db.prepare('UPDATE homepage_files SET bytes = ? WHERE id = ?').run(size, f.id);
  }
  settings.set('filesScrubbed', '1');
  console.log(`[files] Took hidden details out of files from before (${sent.length} checked).`);
}, 120_000).unref();

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

// The file, if this person may see it: they're in the DM (and still friends), or they can
// see the channel.
function fileFor(user, id) {
  const r = dms.getRow(id);
  if (!r || r.kind !== 'file') return null;
  if (r.author_id === user.id) return r; // (your own, wherever you sent it: see Your files)
  if (!r.dm_id.includes(':')) {
    const channel = spaces.channel(r.dm_id);
    const member = channel && spaces.memberOf(channel.space_id, user.id);
    const access = member && spaces.channelAccess(channel, member);
    return access && access.see ? r : null;
  }
  const other = r.dm_id.split(':').find((u) => u !== user.id);
  if (!other) return r.dm_id === `${user.id}:${user.id}` ? r : null; // (your notes)
  return dms.inDm(r.dm_id, user.id) && people.areFriends(user.id, other) ? r : null;
}

api.post('/files/:id/link', needUser, (req, res) => {
  const r = fileFor(req.user, req.params.id);
  if (!r) return fail(res, 404, "That file isn't there any more.");
  const expires = Date.now() + LINK_MS;
  res.json({ url: `/files/${r.id}/${encodeURIComponent(r.file_name)}?link=${expires}.${linkSig(r.id, expires)}` });
});

// In a channel, someone allowed to delete messages can remove anyone's (and it's logged).
api.delete(conv('/messages/:id'), needUser, needConv, (req, res) => {
  const id = req.params.id;
  const m = dms.getMessage(id) || dms.passingMessage(id);
  const mine = Boolean(m) && m.author === req.user.id;
  const asMod = Boolean(m) && !mine && Boolean(req.channel) && spaces.can(req.member, 'manageMessages');
  if (!m || m.dm !== req.dm.id || !(mine || asMod) || !['text', 'file', 'gif'].includes(m.kind)) {
    return fail(res, 404, "That message isn't there any more.");
  }
  if (req.notes) {
    dms.deleteMessage(id);
    tell(req, { type: 'dm-gone', dm: req.dm.id, ids: [id], notes: dms.notesUsage(req.dm.id) });
    return res.json({ ok: true });
  }
  if (m.seq) dms.removeMessage(id, asMod ? req.user.id : null);
  else dms.forgetPassing(id);
  const was = m.kind === 'file' ? 'file' : 'message';
  const author = asMod && people.userById(m.author);
  const authorName = author ? author.display_name : 'someone';
  tell(req, { type: 'dm-removed', dm: req.dm.id, id, by: req.user.id, name: req.user.display_name, was, ...(asMod ? { author: m.author, authorName } : {}) });
  if (asMod) spaces.log(req.channel.space_id, req.user.id, 'message-remove', m.author, { user: authorName, channel: req.channel.name, was });
  res.json({ ok: true });
});

// Edit one of your own text messages. Both of you see the new text, marked "(edited)".
api.patch(conv('/messages/:id'), needUser, needConv, (req, res) => {
  const id = req.params.id;
  const m = dms.getMessage(id) || dms.passingMessage(id);
  if (!m || m.dm !== req.dm.id || m.author !== req.user.id || m.kind !== 'text') {
    return fail(res, 404, "That message isn't there any more.");
  }
  const text = String((req.body || {}).text || '').slice(0, MESSAGE_MAX);
  if (!text.trim()) return fail(res, 400, 'A message needs something in it. To remove it, delete it instead.');
  const editedAt = Date.now();
  if (m.seq) dms.editMessage(id, text, editedAt);
  let mentions = null;
  if (req.channel && m.seq) {
    mentions = spaces.mentionsIn(text, req.channel, req.member);
    spaces.setMentions(id, mentions);
  }
  tell(req, { type: 'dm-edited', dm: req.dm.id, id, text, editedAt, ...(mentions ? { mentions: mentions.ids, everyone: mentions.everyone } : {}) });
  res.json({ ok: true, editedAt });
});

// Emoji reactions, by either of you, on any saved message.
const { cleanEmoji } = emojis;

// A reaction: an emoji, or a custom one from a space you're in (see lib/emoji.js). Taking one
// off works whatever became of its emoji.
const CUSTOM_RE = /^<a?:[A-Za-z0-9_]{2,32}:[a-f0-9]{8,32}>$/;
function reactRoute(req, res, on) {
  const raw = (req.body || {}).emoji;
  const emoji = cleanEmoji(raw) || (on ? emojis.tokenFor(raw, req.user.id) : CUSTOM_RE.test(String(raw || '')) && String(raw));
  if (!emoji) return fail(res, 400, CUSTOM_RE.test(String(raw || '')) ? "You can only use emoji from spaces you're in." : "That isn't an emoji.");
  if (on && req.access && !req.access.react) return fail(res, 403, req.access.timedOut ? TIMED_OUT : "You can't add reactions in this channel.");
  const r = dms.getRow(req.params.id);
  if (!r || r.dm_id !== req.dm.id || !['text', 'file', 'gif'].includes(r.kind)) return fail(res, 404, "That message isn't there any more.");
  if (!dms.react(r.id, req.user.id, emoji, on)) return fail(res, 400, 'That message has all the reactions it can take.');
  const reactions = dms.reactionsOf(r.id);
  tell(req, { type: 'dm-reactions', dm: req.dm.id, id: r.id, reactions });
  res.json({ reactions, quick: dms.quickReactions(req.user.id) });
}
api.post(conv('/messages/:id/reactions'), needUser, needConv, (req, res) => reactRoute(req, res, true));
api.delete(conv('/messages/:id/reactions'), needUser, needConv, (req, res) => reactRoute(req, res, false));

api.post(conv('/read'), needUser, needConv, (req, res) => {
  const at = Math.min(Number((req.body || {}).at) || Date.now(), Date.now());
  dms.markRead(req.dm.id, req.user.id, at);
  realtime.sendToUser(req.user.id, { type: 'dm-read', dm: req.dm.id, at }); // clears the unread count on your other devices
  res.json({ ok: true });
});

// Turn saving on or off. Either person can, and a note saying who goes in the conversation.
api.patch('/dms/:friendId', needUser, needFriend, (req, res) => {
  if (req.notes) return fail(res, 400, 'Your notes are always kept.');
  const save = Boolean((req.body || {}).save);
  if (save !== Boolean(req.dm.save)) {
    dms.setSave(req.dm.id, save);
    tell(req, { type: 'dm-saving', dm: req.dm.id, save });
    const message = dms.addMessage({ id: auth.newId(), dm: req.dm.id, author: req.user.id, kind: 'saving', meta: { on: save } });
    tell(req, { type: 'dm-message', message });
  }
  res.json({ save });
});

// ----- Spaces -----
//
// Anyone can start a space. What its members can do depends on their roles (lib/spaces.js):
// by default anyone can talk and invite people with a link, and the owner can do everything.
// When something about a space changes, its members' apps are told to fetch it again
// ('space-changed'), or that it's gone for them.

function tellSpace(spaceId, msg) {
  for (const id of spaces.memberIds(spaceId)) realtime.sendToUser(id, msg);
}
function spaceChanged(spaceId) {
  tellSpace(spaceId, { type: 'space-changed', space: spaceId });
  recheckVoice(spaceId);
}

// Who's in each voice channel, on your spaces.
function withVoice(list) {
  for (const s of list) for (const c of s.channels) if (c.kind === 'voice' && !c.gated) c.voice = realtime.voiceList(c.id);
  return list;
}
const mySpace = (userId, spaceId) => withVoice(spaces.spacesFor(userId)).find((s) => s.id === spaceId) || null;

// After a change (roles, a timeout, a kick or ban, a channel's settings): anyone in a voice
// channel who may no longer be there is taken out, and anyone who may no longer talk is made
// a listener (or the other way round).
const voiceSpeak = new Map(); // user id -> whether their pass lets them talk
function recheckVoice(spaceId) {
  for (const c of spaces.channelsOf(spaceId)) {
    if (c.kind !== 'voice') continue;
    for (const uid of realtime.voiceMembers(c.id)) {
      const access = spaces.channelAccess(c, spaces.memberOf(spaceId, uid));
      if (!access || !access.connect) {
        realtime.voiceLeave(uid);
        realtime.sendToUser(uid, { type: 'voice-ended', channel: c.id });
        voice.removeParticipant(c.id, uid);
      } else if (voiceSpeak.get(uid) !== access.speak) {
        voiceSpeak.set(uid, access.speak);
        voice.setSpeak(c.id, uid, access.speak);
        if (voice.backend === 'cloudflare') {
          realtime.sendToUser(uid, { type: 'voice-speak', channel: c.id, speak: access.speak });
          realtime.tellVoice(c.id);
        }
      }
    }
  }
}

function needMember(req, res, next) {
  const space = spaces.getSpace(req.params.spaceId);
  const member = space && spaces.memberOf(space.id, req.user.id);
  if (!member) return fail(res, 404, "That space isn't there, or you're not in it.");
  req.space = space;
  req.member = member;
  next();
}

const NOT_ALLOWED = {
  manageSpace: "You don't have permission to change this space's settings.",
  manageChannels: "You don't have permission to manage this space's channels.",
  manageRoles: "You don't have permission to manage roles here.",
  invite: "You don't have permission to invite people here.",
  timeout: "You don't have permission to time people out here.",
  kick: "You don't have permission to kick people here.",
  ban: "You don't have permission to ban people here.",
  viewLog: "You don't have permission to see this space's log.",
};
const needPerm = (perm) => (req, res, next) => (spaces.can(req.member, perm) ? next() : fail(res, 403, NOT_ALLOWED[perm]));

api.get('/spaces', needUser, (req, res) => {
  res.json({ spaces: withVoice(spaces.spacesFor(req.user.id)) });
});

api.post('/spaces', needUser, (req, res) => {
  const name = spaces.spaceName((req.body || {}).name);
  if (!name) return fail(res, 400, 'Give your space a name.');
  const id = spaces.createSpace(req.user.id, name);
  realtime.sendToUser(req.user.id, { type: 'space-changed', space: id });
  res.json({ space: mySpace(req.user.id, id) });
});

api.get('/spaces/:spaceId', needUser, needMember, (req, res) => {
  const members = spaces.members(req.space.id).map((m) => ({ ...m, presence: realtime.presenceOf(m.id), doing: realtime.doingOf(m.id) }));
  res.json({ space: mySpace(req.user.id, req.space.id), members });
});

// Its name, and what @everyone can do.
api.patch('/spaces/:spaceId', needUser, needMember, (req, res) => {
  const b = req.body || {};
  if (spaces.isGroup(req.space)) {
    // Anyone in a group can name it (or clear its name, so it goes by its people's names).
    if (b.name === undefined) return fail(res, 400, 'Nothing to change.');
    const name = people.oneLine(b.name, spaces.NAME_MAX);
    if (name !== req.space.name) {
      spaces.renameSpace(req.space.id, name);
      groupNote(req.space.id, req.user.id, { action: 'rename', name });
    }
    spaceChanged(req.space.id);
    return res.json({ ok: true });
  }
  if (b.name !== undefined && !spaces.can(req.member, 'manageSpace')) return fail(res, 403, NOT_ALLOWED.manageSpace);
  if (b.everyonePerms !== undefined && !spaces.can(req.member, 'manageRoles')) return fail(res, 403, NOT_ALLOWED.manageRoles);
  const name = b.name === undefined ? null : spaces.spaceName(b.name);
  if (b.name !== undefined && !name) return fail(res, 400, 'A space needs a name.');
  if (name && name !== req.space.name) {
    spaces.renameSpace(req.space.id, name);
    spaces.log(req.space.id, req.user.id, 'space-rename', null, { from: req.space.name, to: name });
  }
  if (b.everyonePerms !== undefined) {
    const bits = spaces.allowedPerms(req.member, spaces.permBits(b.everyonePerms), req.space.everyone_perms);
    spaces.setEveryonePerms(req.space.id, bits);
    if (bits !== req.space.everyone_perms) spaces.log(req.space.id, req.user.id, 'everyone-perms', null, { perms: spaces.permNames(bits) });
  }
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

// Its picture, in the list of spaces down the side and when someone's invited (instead of its
// initials): made smaller like a profile picture, for whoever can change its settings. A group
// goes by its people's pictures instead.
function spaceIconCheck(req, res) {
  if (spaces.isGroup(req.space)) { fail(res, 400, "A group shows its people's pictures."); return false; }
  if (!spaces.can(req.member, 'manageSpace')) { fail(res, 403, NOT_ALLOWED.manageSpace); return false; }
  return true;
}
api.put('/spaces/:spaceId/icon', needUser, needMember, express.raw({ type: () => true, limit: AVATAR_MAX }), async (req, res) => {
  if (!spaceIconCheck(req, res)) return;
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const kind = imageKind(buf);
  if (!kind) return fail(res, 400, "A space's picture can be PNG, JPG, GIF or WebP.");
  let pic = { buf, ext: kind };
  try {
    pic = await images.avatar(buf, kind);
  } catch {}
  // (A new name each time, so everyone's browser fetches the new picture.)
  const name = `${req.space.id}-${crypto.randomBytes(4).toString('hex')}.${pic.ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, name), pic.buf);
  spaces.setIcon(req.space.id, name);
  blobs.offload('avatars', name, AVATAR_TYPES[pic.ext]); // (to R2, if it's set up)
  removeAvatarFile(req.space.icon);
  spaces.log(req.space.id, req.user.id, 'space-icon', null, {});
  spaceChanged(req.space.id);
  res.json({ ok: true, icon: spaces.iconUrl(name) });
});
api.delete('/spaces/:spaceId/icon', needUser, needMember, (req, res) => {
  if (!spaceIconCheck(req, res)) return;
  if (req.space.icon) {
    spaces.setIcon(req.space.id, null);
    removeAvatarFile(req.space.icon);
    spaces.log(req.space.id, req.user.id, 'space-icon', null, { removed: true });
    spaceChanged(req.space.id);
  }
  res.json({ ok: true });
});

api.delete('/spaces/:spaceId', needUser, needMember, (req, res) => {
  if (spaces.isGroup(req.space)) return fail(res, 400, 'A group ends when everyone has left it.');
  if (!req.member.owner) return fail(res, 403, 'Only the owner can delete a space.');
  const everyone = spaces.memberIds(req.space.id);
  spaces.deleteSpace(req.space.id);
  for (const id of everyone) realtime.sendToUser(id, { type: 'space-removed', space: req.space.id });
  res.json({ ok: true });
});

api.post('/spaces/:spaceId/leave', needUser, needMember, (req, res) => {
  if (spaces.isGroup(req.space)) {
    const call = spaces.groupCall(req.space.id);
    if (call && realtime.voiceChannelOf(req.user.id) === call.id) realtime.voiceLeave(req.user.id);
    const still = spaces.leaveGroup(req.space.id, req.user.id);
    realtime.sendToUser(req.user.id, { type: 'space-removed', space: req.space.id });
    if (still) {
      groupNote(req.space.id, req.user.id, { action: 'leave' });
      spaceChanged(req.space.id);
    }
    return res.json({ ok: true });
  }
  if (req.member.owner) return fail(res, 400, "You own this space, so you can't leave it. You can delete it instead.");
  spaces.removeMember(req.space.id, req.user.id);
  realtime.sendToUser(req.user.id, { type: 'space-removed', space: req.space.id });
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

api.post('/spaces/:spaceId/channels', needUser, needMember, needPerm('manageChannels'), (req, res) => {
  const name = spaces.channelName((req.body || {}).name);
  if (!name) return fail(res, 400, 'Channel names can have letters, numbers and dashes.');
  const kind = (req.body || {}).kind === 'voice' ? 'voice' : 'text';
  if (kind === 'voice' && !voice.enabled) return fail(res, 400, "Voice channels aren't set up on this server yet (they need Cloudflare Realtime or LiveKit: see SELF-HOSTING.md).");
  const id = spaces.createChannel(req.space.id, name, kind);
  if (!id) return fail(res, 400, `A space can have up to ${spaces.MAX_CHANNELS} channels.`);
  spaces.log(req.space.id, req.user.id, 'channel-create', id, { name, kind });
  spaceChanged(req.space.id);
  res.json({ channel: { id, name, kind } });
});

// Its name, and who it's for: private (only some roles see it) or read-only (only some
// roles post in it), with the roles each is open to, and whether it's 18+.
api.patch('/channels/:channelId', needUser, needChannelToManage, (req, res) => {
  const b = req.body || {};
  if (b.adult !== undefined) {
    if (spaces.isGroup(spaces.getSpace(req.channel.space_id))) return fail(res, 400, "A group's chat can't be 18+.");
    const on = Boolean(b.adult);
    if (on !== Boolean(req.channel.adult)) {
      spaces.setChannelAdult(req.channel.id, on);
      spaces.log(req.channel.space_id, req.user.id, 'channel-adult', req.channel.id, { name: req.channel.name, on });
    }
  }
  if (b.name !== undefined) {
    const name = spaces.channelName(b.name);
    if (!name) return fail(res, 400, 'Channel names can have letters, numbers and dashes.');
    spaces.renameChannel(req.channel.id, name);
    if (name !== req.channel.name) spaces.log(req.channel.space_id, req.user.id, 'channel-rename', req.channel.id, { from: req.channel.name, to: name });
  }
  if (['private', 'readonly', 'seeRoles', 'sendRoles'].some((key) => b[key] !== undefined)) {
    const ours = new Set(spaces.rolesOf(req.channel.space_id).map((r) => r.id));
    const pick = (ids) => [...new Set(Array.isArray(ids) ? ids.map(String) : [])].filter((id) => ours.has(id));
    const before = spaces.channelRoles(req.channel.id);
    spaces.setChannelAccess(req.channel.id, {
      isPrivate: b.private === undefined ? req.channel.private : Boolean(b.private),
      readonly: b.readonly === undefined ? req.channel.readonly : Boolean(b.readonly),
      see: b.seeRoles === undefined ? before.see : pick(b.seeRoles),
      send: b.sendRoles === undefined ? before.send : pick(b.sendRoles),
    });
    const now = spaces.channel(req.channel.id);
    spaces.log(req.channel.space_id, req.user.id, 'channel-access', req.channel.id, { name: now.name, private: Boolean(now.private), readonly: Boolean(now.readonly) });
  }
  spaceChanged(req.channel.space_id);
  res.json({ ok: true });
});

api.delete('/channels/:channelId', needUser, needChannelToManage, (req, res) => {
  if (spaces.channelsOf(req.channel.space_id).length <= 1) return fail(res, 400, 'A space needs at least one channel.');
  for (const uid of realtime.voiceMembers(req.channel.id)) {
    realtime.voiceLeave(uid);
    realtime.sendToUser(uid, { type: 'voice-ended', channel: req.channel.id });
  }
  if (req.channel.kind === 'voice') voice.deleteRoom(req.channel.id);
  spaces.deleteChannel(req.channel.id);
  spaces.log(req.channel.space_id, req.user.id, 'channel-delete', req.channel.id, { name: req.channel.name });
  spaceChanged(req.channel.space_id);
  res.json({ ok: true });
});

// ----- Voice channels -----
// A pass into a voice channel (lib/voice.js): what you may do there, the channel's key for its
// end-to-end encryption, and how to connect: a LiveKit room, or Cloudflare (where your app
// starts a session, then sends and gets sound and video through the routes below).
api.post('/channels/:channelId/voice', needUser, needChannel, async (req, res) => {
  if (req.channel.kind !== 'voice') return fail(res, 400, "That's not a voice channel.");
  if (!voice.enabled) return fail(res, 503, "Voice channels aren't set up on this server yet.");
  if (!req.access.connect) return fail(res, 403, "You can't join this voice channel.");
  voiceSpeak.set(req.user.id, req.access.speak);
  const key = spaces.voiceKey(req.channel.id);
  if (voice.backend === 'cloudflare') {
    const { list } = await getIceServers();
    const limits = voiceLimitsFor(req.user);
    voice.cf.setLimits(req.user.id, limits);
    return res.json({ backend: 'cloudflare', key, speak: req.access.speak, iceServers: list, limits });
  }
  res.json({
    backend: 'livekit',
    url: voice.url,
    token: voice.joinToken({ room: req.channel.id, user: req.user, speak: req.access.speak }),
    key,
    speak: req.access.speak,
  });
});

// How much a camera and a shared screen may send, in kbps (Cloudflare charges for what it sends
// on; these keep a screen share to about 0.7 GB an hour for each person watching). A screen
// share is sharp (1080p, 15 frames a second, for text) or smooth (720p, 30), from Settings.
const VOICE_LIMITS = {
  camKbps: Number(process.env.CAMERA_KBPS) || 800,
  screenKbps: Number(process.env.SCREEN_SHARE_KBPS) || 1500,
};
// Supporters' screen shares are sharper (1080p, at 30 or 60 frames a second, up to 4 Mbps: 1.8
// GB an hour for each person watching), while that fits (lib/supporters.js).
const SHARP_SCREEN_KBPS = Number(process.env.SHARP_SCREEN_KBPS) || 4000;
function voiceLimitsFor(user) {
  if (!supporters.sharpStreams(user, voice.cf.egress())) return { ...VOICE_LIMITS };
  return { ...VOICE_LIMITS, screenKbps: Math.max(VOICE_LIMITS.screenKbps, SHARP_SCREEN_KBPS), sharp: true };
}
// ...and stop being sharper, mid-call, once they don't fit any more (checked each minute, as
// what Cloudflare sends is counted: lib/voice-cf.js).
voice.cf.whenCounted((egress) => {
  for (const id of voice.cf.sharpSenders()) {
    const u = people.userById(id);
    if (u && supporters.sharpStreams(u, egress)) continue;
    const limits = { ...VOICE_LIMITS };
    voice.cf.setLimits(id, limits);
    realtime.sendToUser(id, { type: 'voice-limits', limits });
  }
});

// Cloudflare: your app's session, and sending and getting sound and video (lib/voice-cf.js).
// Each goes through here so the server says who may send what, and who gets whose.
const cfRoute = (fn) => async (req, res) => {
  if (voice.backend !== 'cloudflare') return fail(res, 404, "This server's voice doesn't work that way.");
  if (req.channel.kind !== 'voice' || !req.access.connect) return fail(res, 403, "You can't join this voice channel.");
  try {
    res.json(await fn(req, req.body || {}));
  } catch (err) {
    if (err instanceof voice.cf.VoiceError) return fail(res, err.status, err.message);
    throw err;
  }
};
api.post('/channels/:channelId/voice/session', needUser, needChannel, cfRoute(async (req, b) => {
  const { pubSession, subSession, replaced } = await voice.cf.start(req.user.id, req.channel.id, b.tab, req.access.speak);
  // (Joined from another tab or device: that one's told it's out.)
  if (replaced) realtime.sendToUser(req.user.id, { type: 'voice-ended', channel: replaced.channelId, reason: 'elsewhere', tab: replaced.tab });
  return { session: pubSession, sub: subSession };
}));
api.post('/channels/:channelId/voice/publish', needUser, needChannel, cfRoute(async (req, b) => {
  if (!req.access.speak) throw new voice.cf.VoiceError("You can't talk in this channel.", 403);
  const out = await voice.cf.publish(req.user.id, req.channel.id, b.sdp, b.tracks);
  realtime.tellVoice(req.channel.id);
  return out;
}));
api.post('/channels/:channelId/voice/ready', needUser, needChannel, cfRoute(async (req, b) => {
  if (voice.cf.ready(req.user.id, req.channel.id, b.tracks)) realtime.tellVoice(req.channel.id);
  return { ok: true };
}));
api.post('/channels/:channelId/voice/unpublish', needUser, needChannel, cfRoute(async (req, b) => {
  const out = await voice.cf.unpublish(req.user.id, req.channel.id, b.sdp, b.kinds);
  realtime.tellVoice(req.channel.id);
  return out;
}));
api.post('/channels/:channelId/voice/pull', needUser, needChannel, cfRoute((req, b) => voice.cf.pull(req.user.id, req.channel.id, b.tracks)));
api.post('/channels/:channelId/voice/resub', needUser, needChannel, cfRoute((req) => voice.cf.resub(req.user.id, req.channel.id)));
api.post('/channels/:channelId/voice/repub', needUser, needChannel, cfRoute(async (req) => {
  const out = await voice.cf.repub(req.user.id, req.channel.id);
  realtime.tellVoice(req.channel.id);
  return out;
}));
api.post('/channels/:channelId/voice/answer', needUser, needChannel, cfRoute(async (req, b) => {
  await voice.cf.answer(req.user.id, req.channel.id, b.sdp);
  return { ok: true };
}));
api.post('/channels/:channelId/voice/unpull', needUser, needChannel, cfRoute((req, b) => voice.cf.unpull(req.user.id, req.channel.id, b.mids)));
// (What someone's sending got lost at Cloudflare's end: their app sends it again.)
voice.cf.whenLost((userId, channelId) => realtime.sendToUser(userId, { type: 'voice-resend', channel: channelId }));

// How much you want to hear from a space: every message, only mentions of you, or nothing.
api.put('/spaces/:spaceId/notify', needUser, needMember, (req, res) => {
  const level = String((req.body || {}).level || '');
  if (!spaces.NOTIFY_LEVELS.includes(level)) return fail(res, 400, "That isn't one of the choices.");
  spaces.setNotify(req.space.id, req.user.id, level);
  realtime.sendToUser(req.user.id, { type: 'space-changed', space: req.space.id }); // your other devices
  res.json({ ok: true, level });
});

// Muting a channel, for you: its new messages don't light anything up, make a sound or reach
// your phone, unless they mention you. (An 18+ one too, before you've said you're old enough to
// open it: it's listed for you all the same.)
api.put('/channels/:channelId/mute', needUser, (req, res) => {
  const channel = spaces.channel(req.params.channelId);
  const member = channel && spaces.memberOf(channel.space_id, req.user.id);
  const access = member && spaces.channelAccess(channel, { ...member, adult: true });
  if (!access || !access.see || channel.kind === 'voice') return fail(res, 404, "That channel isn't there, or you can't see it.");
  const muted = Boolean((req.body || {}).muted);
  spaces.setChannelMuted(channel.id, req.user.id, muted);
  realtime.sendToUser(req.user.id, { type: 'space-changed', space: channel.space_id }); // your other devices
  res.json({ ok: true, muted });
});

// ----- Bringing a Discord server over (lib/discord.js) -----
// From a Discord server template link: first what it would make, then making it.

async function discordPlan(req, res) {
  const code = discord.templateCode(req.params.code || (req.body || {}).link);
  if (!code) {
    fail(res, 400, "That doesn't look like a Discord template link (they look like https://discord.new/…).");
    return null;
  }
  try {
    return discord.planFrom(await discord.fetchTemplate(code), { voice: voice.enabled });
  } catch (err) {
    if (!(err instanceof discord.TemplateError)) throw err;
    fail(res, err.status === 404 ? 404 : 502, err.message);
    return null;
  }
}

api.get('/discord-templates/:code', needUser, async (req, res) => {
  const plan = await discordPlan(req, res);
  if (plan) res.json({ template: discord.summary(plan) });
});

api.post('/spaces/from-discord', needUser, async (req, res) => {
  const plan = await discordPlan(req, res);
  if (!plan) return;
  const name = spaces.spaceName((req.body || {}).name);
  if (name) plan.name = name;
  const id = spaces.createSpaceFrom(req.user.id, plan);
  spaces.log(id, req.user.id, 'space-import', null, { from: 'Discord', channels: plan.channels.length, roles: plan.roles.length });
  realtime.sendToUser(req.user.id, { type: 'space-changed', space: id });
  res.json({ space: mySpace(req.user.id, id), notes: plan.notes });
});

// ----- Link previews (lib/embeds.js) -----
// Under a message with a link: an X post, a video, or a page's title and picture.

const embedBudget = new Map(); // user id -> { since, n }: previews looked up afresh in the last 10 minutes

api.get('/embeds', needUser, async (req, res) => {
  const link = embeds.linkOf(req.query.url);
  if (!link) return fail(res, 400, "That isn't a link.");
  if (!embeds.enabled) return res.json({ embed: null });
  if (!embeds.known(link)) {
    const now = Date.now();
    let budget = embedBudget.get(req.user.id);
    if (!budget || now - budget.since > 600_000) embedBudget.set(req.user.id, (budget = { since: now, n: 0 }));
    if (++budget.n > 150) return fail(res, 429, 'Too many link previews at once. Try again in a few minutes.');
  }
  res.set('Cache-Control', 'private, max-age=600');
  res.json({ embed: await embeds.embedFor(link) });
});

// Their pictures and videos, which come through here so the sites don't see who's looking.
api.get('/embeds/media', needUser, (req, res) => embeds.proxy(req, res));

// ----- A space's custom emoji (lib/emoji.js) -----

function emojiFail(res, err) {
  if (!(err instanceof emojis.EmojiError)) throw err;
  fail(res, err.status, err.message);
}

api.get('/spaces/:spaceId/emoji', needUser, needMember, (req, res) => {
  res.json({ emoji: emojis.list(req.space.id), max: emojis.MAX_PER_SPACE });
});

// The picture is the body; its name comes along as ?name=.
api.post('/spaces/:spaceId/emoji', needUser, needMember, needPerm('manageEmoji'), express.raw({ type: () => true, limit: '300kb' }), (req, res) => {
  if (spaces.isGroup(req.space)) return fail(res, 400, "Groups don't have their own emoji.");
  try {
    const e = emojis.add(req.space.id, req.user.id, req.query.name, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    spaces.log(req.space.id, req.user.id, 'emoji-add', null, { name: e.name });
    spaceChanged(req.space.id);
    res.json({ emoji: e });
  } catch (err) {
    emojiFail(res, err);
  }
});

api.patch('/spaces/:spaceId/emoji/:emojiId', needUser, needMember, needPerm('manageEmoji'), (req, res) => {
  try {
    const { was, emoji: e } = emojis.rename(req.space.id, req.params.emojiId, (req.body || {}).name);
    // (Reactions with it take its new name too, so they stay one.)
    for (const a of ['', 'a']) {
      db.prepare('UPDATE OR IGNORE reactions SET emoji = ? WHERE emoji = ?').run(`<${a}:${e.name}:${e.id}>`, `<${a}:${was}:${e.id}>`);
    }
    if (was !== e.name) spaces.log(req.space.id, req.user.id, 'emoji-rename', null, { from: was, to: e.name });
    spaceChanged(req.space.id);
    res.json({ emoji: e });
  } catch (err) {
    emojiFail(res, err);
  }
});

api.delete('/spaces/:spaceId/emoji/:emojiId', needUser, needMember, needPerm('manageEmoji'), (req, res) => {
  try {
    const e = emojis.remove(req.space.id, req.params.emojiId);
    spaces.log(req.space.id, req.user.id, 'emoji-remove', null, { name: e.name });
    spaceChanged(req.space.id);
    res.json({ ok: true });
  } catch (err) {
    emojiFail(res, err);
  }
});

// ----- A space's soundboard (lib/sounds.js) -----

function soundFail(res, err) {
  if (!(err instanceof sounds.SoundError)) throw err;
  fail(res, err.status, err.message);
}

api.get('/spaces/:spaceId/sounds', needUser, needMember, (req, res) => {
  res.json({ sounds: sounds.list(req.space.id), max: sounds.MAX_PER_SPACE });
});

// The sound is the body; its name, emoji and length (in ms, measured by the app) come along as
// ?name=&emoji=&ms=.
api.post('/spaces/:spaceId/sounds', needUser, needMember, needPerm('manageSoundboard'), express.raw({ type: () => true, limit: '1100kb' }), (req, res) => {
  if (spaces.isGroup(req.space)) return fail(res, 400, "Groups don't have their own sounds.");
  try {
    const { name, emoji, ms } = req.query;
    const s = sounds.add(req.space.id, req.user.id, { name, emoji, ms }, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    spaces.log(req.space.id, req.user.id, 'sound-add', null, { name: s.name });
    spaceChanged(req.space.id);
    res.json({ sound: s });
  } catch (err) {
    soundFail(res, err);
  }
});

api.patch('/spaces/:spaceId/sounds/:soundId', needUser, needMember, needPerm('manageSoundboard'), (req, res) => {
  try {
    const { name, emoji } = req.body || {};
    const { was, sound: s } = sounds.edit(req.space.id, req.params.soundId, { name, emoji });
    if (was !== s.name) spaces.log(req.space.id, req.user.id, 'sound-rename', null, { from: was, to: s.name });
    spaceChanged(req.space.id);
    res.json({ sound: s });
  } catch (err) {
    soundFail(res, err);
  }
});

api.delete('/spaces/:spaceId/sounds/:soundId', needUser, needMember, needPerm('manageSoundboard'), (req, res) => {
  try {
    const s = sounds.remove(req.space.id, req.params.soundId);
    spaces.log(req.space.id, req.user.id, 'sound-remove', null, { name: s.name });
    spaceChanged(req.space.id);
    res.json({ ok: true });
  } catch (err) {
    soundFail(res, err);
  }
});

// Invite links: rainlit.app/join/<code>. Anyone allowed to invite people can make one.
api.post('/spaces/:spaceId/invites', needUser, needMember, needPerm('invite'), (req, res) => {
  res.json({ code: spaces.createInvite(req.space.id, req.user.id) });
});

api.get('/space-invites/:code', needUser, (req, res) => {
  const invite = spaces.inviteByCode(req.params.code);
  const space = invite && spaces.getSpace(invite.space_id);
  if (!space) return fail(res, 404, "That invite link doesn't work any more.");
  res.json({
    space: { id: space.id, name: space.name, icon: spaces.iconUrl(space.icon), memberCount: spaces.memberIds(space.id).length },
    member: spaces.isMember(space.id, req.user.id),
    banned: spaces.isBanned(space.id, req.user.id),
  });
});

api.post('/space-invites/:code', needUser, needConfirmed, (req, res) => {
  const invite = spaces.inviteByCode(req.params.code);
  const space = invite && spaces.getSpace(invite.space_id);
  if (!space) return fail(res, 404, "That invite link doesn't work any more.");
  if (spaces.isBanned(space.id, req.user.id)) return fail(res, 403, "You've been banned from this space.");
  if (!spaces.isMember(space.id, req.user.id)) {
    spaces.addMember(space.id, req.user.id);
    spaces.useInvite(invite.code);
    spaceChanged(space.id);
  }
  res.json({ space: mySpace(req.user.id, space.id) });
});

// ----- Group chats -----
// A few friends with a chat and a call of their own (lib/spaces.js). You can only put your
// friends in one, and never someone either of you has blocked.

// A note in a group's chat: someone added, taken out, leaving, or the group renamed.
function groupNote(spaceId, authorId, meta) {
  const chat = spaces.groupChat(spaceId);
  if (!chat) return;
  const message = dms.addMessage({ id: crypto.randomBytes(12).toString('hex'), dm: chat.id, author: authorId, kind: 'group', meta, at: Date.now() });
  tellSpace(spaceId, { type: 'dm-message', message });
}

function needGroup(req, res, next) {
  if (!spaces.isGroup(req.space)) return fail(res, 404, "That group isn't there, or you're not in it.");
  next();
}

const canAddToGroup = (userId, otherId) => people.areFriends(userId, otherId) && !safety.hasBlocked(userId, otherId) && !safety.hasBlocked(otherId, userId);

api.post('/groups', needUser, (req, res) => {
  const b = req.body || {};
  const others = [...new Set((Array.isArray(b.members) ? b.members : []).map(String))].filter((id) => id !== req.user.id);
  if (others.length < 2) return fail(res, 400, 'Pick at least two friends. (For one, just message them.)');
  if (others.length > spaces.GROUP_MAX - 1) return fail(res, 400, `A group can have up to ${spaces.GROUP_MAX} people, you included.`);
  if (!others.every((id) => canAddToGroup(req.user.id, id))) return fail(res, 400, 'You can only add your friends to a group.');
  const id = spaces.createGroup(req.user.id, others, people.oneLine(b.name, spaces.NAME_MAX));
  spaceChanged(id);
  res.json({ space: mySpace(req.user.id, id) });
});

// Adding friends of yours.
api.post('/spaces/:spaceId/people', needUser, needMember, needGroup, (req, res) => {
  const ids = [...new Set((Array.isArray((req.body || {}).members) ? req.body.members : []).map(String))]
    .filter((id) => !spaces.isMember(req.space.id, id));
  if (!ids.length) return fail(res, 400, 'Pick someone to add.');
  if (spaces.memberIds(req.space.id).length + ids.length > spaces.GROUP_MAX) return fail(res, 400, `A group can have up to ${spaces.GROUP_MAX} people.`);
  if (!ids.every((id) => canAddToGroup(req.user.id, id))) return fail(res, 400, 'You can only add your friends to a group.');
  for (const id of ids) spaces.addGroupMember(req.space.id, id);
  groupNote(req.space.id, req.user.id, { action: 'add', people: ids });
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

// The owner taking someone out.
api.delete('/spaces/:spaceId/people/:userId', needUser, needMember, needGroup, (req, res) => {
  const target = String(req.params.userId);
  if (target === req.user.id) return fail(res, 400, 'To leave, use Leave group.');
  if (!req.member.owner) return fail(res, 403, 'Only whoever made the group (or has it now) can take people out.');
  if (!spaces.isMember(req.space.id, target)) return fail(res, 404, "They're not in this group.");
  if (realtime.voiceChannelOf(target) === (spaces.groupCall(req.space.id) || {}).id) {
    realtime.voiceLeave(target);
    voice.removeParticipant(spaces.groupCall(req.space.id).id, target);
  }
  spaces.leaveGroup(req.space.id, target);
  realtime.sendToUser(target, { type: 'space-removed', space: req.space.id, why: 'kicked' });
  groupNote(req.space.id, req.user.id, { action: 'remove', people: [target] });
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

// ----- Roles -----
//
// Made, changed and given by people with Manage roles, for roles below their own highest.

function needRole(req, res, next) {
  const r = spaces.role(req.params.roleId);
  if (!r || r.space_id !== req.space.id) return fail(res, 404, "That role isn't there any more.");
  if (!spaces.canManageRole(req.member, r)) return fail(res, 403, 'You can only manage roles below your own highest role.');
  req.role = r;
  next();
}

api.post('/spaces/:spaceId/roles', needUser, needMember, needPerm('manageRoles'), (req, res) => {
  const b = req.body || {};
  const id = spaces.createRole(req.space.id, {
    name: spaces.roleName(b.name) || 'new role',
    color: spaces.roleColor(b.color),
    perms: spaces.allowedPerms(req.member, spaces.permBits(b.perms), 0),
    hoist: Boolean(b.hoist),
  });
  if (!id) return fail(res, 400, `A space can have up to ${spaces.MAX_ROLES} roles.`);
  spaces.log(req.space.id, req.user.id, 'role-create', id, { name: spaces.role(id).name });
  spaceChanged(req.space.id);
  res.json({ role: spaces.roleJson(spaces.role(id)) });
});

api.patch('/spaces/:spaceId/roles/:roleId', needUser, needMember, needRole, (req, res) => {
  const b = req.body || {};
  const name = b.name === undefined ? undefined : spaces.roleName(b.name);
  if (b.name !== undefined && !name) return fail(res, 400, 'A role needs a name.');
  spaces.updateRole(req.role.id, {
    name,
    color: b.color === undefined ? undefined : spaces.roleColor(b.color),
    perms: b.perms === undefined ? undefined : spaces.allowedPerms(req.member, spaces.permBits(b.perms), req.role.perms),
    hoist: b.hoist === undefined ? undefined : Boolean(b.hoist),
  });
  const after = spaces.role(req.role.id);
  spaces.log(req.space.id, req.user.id, 'role-update', req.role.id, { name: after.name, ...(after.name !== req.role.name ? { from: req.role.name } : {}) });
  spaceChanged(req.space.id);
  res.json({ role: spaces.roleJson(after) });
});

api.delete('/spaces/:spaceId/roles/:roleId', needUser, needMember, needRole, (req, res) => {
  spaces.deleteRole(req.role.id);
  spaces.log(req.space.id, req.user.id, 'role-delete', req.role.id, { name: req.role.name });
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

// One step up or down the order. Both roles have to be below your own highest.
api.post('/spaces/:spaceId/roles/:roleId/move', needUser, needMember, needRole, (req, res) => {
  const other = spaces.neighbour(req.role, Boolean((req.body || {}).up));
  if (!other) return res.json({ ok: true }); // already at the top or bottom
  if (!spaces.canManageRole(req.member, other)) return fail(res, 403, "That would move it above your own highest role.");
  spaces.swapRoles(req.role, other);
  spaces.log(req.space.id, req.user.id, 'role-move', req.role.id, { name: req.role.name, up: Boolean((req.body || {}).up) });
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

// Giving someone a role, or taking it away.
function memberRoleRoute(on) {
  return (req, res) => {
    const target = spaces.memberOf(req.space.id, req.params.userId);
    if (!target) return fail(res, 404, "They aren't in this space any more.");
    if (!spaces.canManageMember(req.member, target)) return fail(res, 403, "You can only change the roles of people below you.");
    const had = target.roleIds.includes(req.role.id);
    if (on) spaces.giveRole(req.space.id, target.userId, req.role.id);
    else spaces.takeRole(req.space.id, target.userId, req.role.id);
    if (had !== on) {
      spaces.log(req.space.id, req.user.id, on ? 'role-give' : 'role-take', target.userId, { role: req.role.name, user: people.userById(target.userId).display_name });
    }
    spaceChanged(req.space.id);
    res.json({ ok: true });
  };
}
api.put('/spaces/:spaceId/members/:userId/roles/:roleId', needUser, needMember, needRole, memberRoleRoute(true));
api.delete('/spaces/:spaceId/members/:userId/roles/:roleId', needUser, needMember, needRole, memberRoleRoute(false));

// ----- Moderation -----
//
// Timeouts, kicks and bans, by people allowed to, and only on people below them. Each one
// goes in the space's log, with the reason if there was one.

function needTarget(perm) {
  return (req, res, next) => {
    const target = spaces.memberOf(req.space.id, req.params.userId);
    if (!target) return fail(res, 404, "They aren't in this space any more.");
    if (!spaces.canModerate(req.member, target, perm)) return fail(res, 403, 'You can only do that to people below you.');
    req.target = target;
    req.targetName = people.userById(target.userId).display_name;
    next();
  };
}
const reasonOf = (req) => people.oneLine((req.body || {}).reason, 200);

const TIMEOUT_SECONDS = [60, 300, 600, 3600, 86400, 604800]; // a minute to a week
api.post('/spaces/:spaceId/members/:userId/timeout', needUser, needMember, needPerm('timeout'), needTarget('timeout'), (req, res) => {
  const seconds = Number((req.body || {}).seconds) || 0; // 0 ends it
  if (seconds && !TIMEOUT_SECONDS.includes(seconds)) return fail(res, 400, "That isn't one of the timeout lengths.");
  const until = seconds ? Date.now() + seconds * 1000 : 0;
  spaces.setTimeoutUntil(req.space.id, req.target.userId, until);
  spaces.log(req.space.id, req.user.id, seconds ? 'timeout' : 'timeout-end', req.target.userId, { user: req.targetName, seconds, reason: reasonOf(req) });
  spaceChanged(req.space.id);
  res.json({ ok: true, until });
});

// Out of the space. They can come back with an invite link.
api.post('/spaces/:spaceId/members/:userId/kick', needUser, needMember, needPerm('kick'), needTarget('kick'), (req, res) => {
  spaces.removeMember(req.space.id, req.target.userId);
  spaces.log(req.space.id, req.user.id, 'kick', req.target.userId, { user: req.targetName, reason: reasonOf(req) });
  realtime.sendToUser(req.target.userId, { type: 'space-removed', space: req.space.id, why: 'kicked' });
  spaceChanged(req.space.id);
  res.json({ ok: true });
});

// Out, and they can't come back. Their messages from the last hour, day or week can go too.
const PURGE_SECONDS = [0, 3600, 86400, 604800];
api.post('/spaces/:spaceId/members/:userId/ban', needUser, needMember, needPerm('ban'), needTarget('ban'), (req, res) => {
  const purge = Number((req.body || {}).purge) || 0;
  if (!PURGE_SECONDS.includes(purge)) return fail(res, 400, "That isn't one of the choices.");
  spaces.ban(req.space.id, req.target.userId, req.user.id, reasonOf(req));
  let removed = 0;
  if (purge) {
    const gone = spaces.purgeMessages(req.space.id, req.target.userId, Date.now() - purge * 1000);
    removed = gone.count;
    for (const [channelId, ids] of Object.entries(gone.byChannel)) {
      const channel = spaces.channel(channelId);
      for (const id of channel ? spaces.channelAudience(channel) : []) realtime.sendToUser(id, { type: 'dm-gone', dm: channelId, ids });
    }
  }
  spaces.log(req.space.id, req.user.id, 'ban', req.target.userId, { user: req.targetName, reason: reasonOf(req), removed });
  realtime.sendToUser(req.target.userId, { type: 'space-removed', space: req.space.id, why: 'banned' });
  spaceChanged(req.space.id);
  res.json({ ok: true, removed });
});

api.get('/spaces/:spaceId/bans', needUser, needMember, needPerm('ban'), (req, res) => {
  res.json({ bans: spaces.bansOf(req.space.id) });
});

api.delete('/spaces/:spaceId/bans/:userId', needUser, needMember, needPerm('ban'), (req, res) => {
  if (spaces.unban(req.space.id, req.params.userId)) {
    const u = people.userById(req.params.userId);
    spaces.log(req.space.id, req.user.id, 'unban', req.params.userId, { user: u ? u.display_name : 'someone' });
    spaceChanged(req.space.id);
  }
  res.json({ ok: true });
});

api.get('/spaces/:spaceId/log', needUser, needMember, needPerm('viewLog'), (req, res) => {
  res.json({ entries: spaces.logOf(req.space.id, Number(req.query.before) || 0) });
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
  const usedBy = storage.usedByEveryone();
  const users = db.prepare('SELECT * FROM users ORDER BY created_at').all()
    .map((u) => ({
      ...people.publicUser(u), email: u.email, isAdmin: Boolean(u.is_admin), createdAt: u.created_at,
      suspended: Boolean(u.suspended_at), suspendedReason: u.suspended_reason || '',
      storage: { used: usedBy.get(u.id) || 0, limit: storage.limitOf(u), custom: u.storage_mb != null },
      supporter: u.supporter_first ? supporters.statusOf(u) : null,
    }));
  res.json({ users, support: supporters.enabled });
});

// Room for files (lib/storage.js): the biggest file, how much each person's can add up to, and
// the disk. And one person's own amount (more, or less, than everyone's; null goes back).
api.get('/admin/storage', needAdmin, async (req, res) => res.json(await storageState(req)));

// (And whether R2's bucket lets this site read its files, for homepages' sound limiter.)
async function storageState(req) {
  const r2 = blobs.status();
  if (r2.enabled) r2.readable = await blobs.readableFrom(new URL(publicUrl(req)).origin);
  return { ...storage.overview(), r2, usage: abuse.usage() };
}

// What people put on their homepages, all of them together (counts only), to see what gets used.
api.get('/admin/homepages', needAdmin, (_req, res) => res.json(homepages.stats()));

// Flagged accounts (lib/abuse.js): what was noticed, and the admin saying it's fine.
api.get('/admin/flags', needAdmin, (_req, res) => res.json({ flags: abuse.openFlags(), dailyMb: abuse.DAILY_MB }));
api.post('/admin/flags/:id/clear', needAdmin, (req, res) => {
  if (!abuse.clear(req.params.id, req.user.id)) return fail(res, 404, "That flag isn't there any more.");
  res.json({ ok: true, open: abuse.openCount() });
});
api.put('/admin/storage', needAdmin, async (req, res) => {
  const b = req.body || {};
  storage.configure({ fileMb: b.fileMb, personMb: b.personMb });
  res.json(await storageState(req));
});
// Supporting Rainlit (lib/supporters.js): what running it costs a month (for the support page's
// bar), how much supporters cover, and how much Cloudflare's sent for voice this month. And
// gifting someone some months of it (or ending a gift).
function supportOverview() {
  const e = voice.cf.egress();
  return {
    enabled: supporters.enabled, ...supporters.month(),
    voice: voice.backend === 'cloudflare' ? { month: e.month, total: e.total, sharp: Object.values(e.sharp).reduce((a, b) => a + b, 0), budgetGb: supporters.VOICE_MONTHLY_GB } : null,
  };
}
api.get('/admin/supporters', needAdmin, (_req, res) => res.json(supportOverview()));
api.put('/admin/supporters', needAdmin, (req, res) => {
  try {
    supporters.setCosts((req.body || {}).costs);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  res.json(supportOverview());
});
api.post('/admin/users/:id/supporter', needAdmin, (req, res) => {
  try {
    supporters.gift(req.params.id, (req.body || {}).months);
  } catch (err) {
    return fail(res, err.status || 400, err.message);
  }
  res.json({ ok: true });
});
api.delete('/admin/users/:id/supporter', needAdmin, (req, res) => {
  if (!supporters.endGift(req.params.id)) return fail(res, 404, "They don't have a gift of Glow to end.");
  res.json({ ok: true });
});

api.put('/admin/users/:id/storage', needAdmin, (req, res) => {
  const u = people.userById(req.params.id);
  if (!u) return fail(res, 404, "That account isn't there any more.");
  storage.setPersonal(u.id, (req.body || {}).mb ?? null);
  res.json({ storage: storage.of(people.userById(u.id)) });
});

// Suspending an account: signed out everywhere at once, out of any call, and it can't sign in
// again (or make a new account with its email) until the admin lets it back. Its homepage is
// hidden meanwhile. What it sent stays, for its spaces' moderators to deal with. (A report about
// a child, confirmed, suspends one too.)
function suspendUser(u, reason) {
  db.prepare('UPDATE users SET suspended_at = ?, suspended_reason = ? WHERE id = ?')
    .run(Date.now(), people.oneLine(reason || '', 200), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  realtime.forgetUser(u.id, 'suspended');
  console.log(`[accounts] Suspended: @${u.username}`);
}

api.post('/admin/users/:id/suspend', needAdmin, (req, res) => {
  const u = people.userById(req.params.id);
  if (!u) return fail(res, 404, 'Not found.');
  if (u.id === req.user.id) return fail(res, 400, "That's you!");
  if (u.is_admin) return fail(res, 400, "An admin can't be suspended.");
  suspendUser(u, (req.body || {}).reason);
  res.json({ ok: true });
});

api.post('/admin/users/:id/unsuspend', needAdmin, (req, res) => {
  const u = people.userById(req.params.id);
  if (!u) return fail(res, 404, 'Not found.');
  db.prepare("UPDATE users SET suspended_at = NULL, suspended_reason = '' WHERE id = ?").run(u.id);
  console.log(`[accounts] No longer suspended: @${u.username}`);
  res.json({ ok: true });
});

// Taking someone's homepage down (from a report): back to the starter page, pictures deleted.
api.post('/admin/homepages/:userId/clear', needAdmin, (req, res) => {
  const u = people.userById(req.params.userId);
  if (!u) return fail(res, 404, 'Not found.');
  homepages.clear(u.id);
  res.json({ ok: true });
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

// ----- The call debug log (Settings > Call debug log; lib/traces.js) -----

const traceBudget = new Map(); // user id -> { since, n }: batches of notes in the last 10 minutes

api.post('/traces', needUser, (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.entries)) return fail(res, 400, 'Nothing to keep.');
  const now = Date.now();
  let budget = traceBudget.get(req.user.id);
  if (!budget || now - budget.since > 600_000) traceBudget.set(req.user.id, (budget = { since: now, n: 0 }));
  if (++budget.n > 120) return fail(res, 429, 'Too many notes at once. Try again in a few minutes.');
  const kept = traces.addFromDevice(req.user.id, String(b.device || '').slice(0, 120), b.entries);
  res.json({ ok: true, kept });
});

const traceName = (id) => {
  const u = people.userById(id);
  return u ? u.display_name : `someone (${id.slice(0, 8)})`;
};

api.get('/admin/traces', needAdmin, (_req, res) => {
  res.json({ pairs: traces.pairs().map((p) => ({ ...p, names: p.pair.split(':').map(traceName) })) });
});

// One pair of people's calls as one timeline, for the last day (or up to a week).
api.get('/admin/traces/:pair', needAdmin, (req, res) => {
  const pair = String(req.params.pair);
  if (!/^[A-Za-z0-9-]{1,64}:[A-Za-z0-9-]{1,64}$/.test(pair)) return fail(res, 400, 'Not a pair of people.');
  const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="rainlit-call-log-${new Date().toISOString().slice(0, 10)}.txt"`);
  res.send(traces.timeline(pair, Date.now() - hours * 3600_000, traceName));
});

api.use((_req, res) => fail(res, 404, 'Not found.'));
app.use('/api', api);

// Profile pictures, for signed-in people only.
app.get('/avatars/:file', (req, res) => {
  if (!auth.userForToken(auth.tokenFrom(req))) return res.sendStatus(401);
  if (!/^[a-f0-9]{24}-[a-f0-9]{8}\.(png|jpg|gif|webp)$/.test(req.params.file)) return res.sendStatus(404);
  blobs.send(res, 'avatars', req.params.file, { type: AVATAR_TYPES[req.params.file.split('.').pop()] });
});

// Files sent in a conversation, for the two people in it. Pictures, videos and audio
// are shown in place; anything else only downloads. Either way the browser is told
// never to run anything in them.
app.get('/files/:id/:name', async (req, res) => {
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
    if (user.id !== r.author_id && !r.opened_at) abuse.opened(r.id); // (lib/abuse.js: files nobody else opens)
  }
  const showable = dms.SHOWABLE_TYPES.test(r.file_type);
  // The chat's smaller copy of a photo (opening it shows the original), if it has one.
  const small = req.query.preview && !req.query.link ? await dms.previewOf(r) : null;
  // (?download: saving it, rather than showing it.)
  const shown = showable && !req.query.download;
  abuse.noteOut(small ? Math.min(r.file_size, 250 * 1024) : r.file_size);
  // From here, or on to R2 (lib/blobs.js).
  blobs.send(res, small ? 'previews' : 'files', small || r.file_path, {
    type: small ? 'image/webp' : showable ? r.file_type : 'application/octet-stream',
    disposition: `${shown ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(r.file_name)}`,
    headers: { 'Content-Security-Policy': "default-src 'none'; sandbox" },
  });
});

// LiveKit's browser library (for voice channels), straight from its package.
app.use('/vendor/livekit', express.static(path.join(__dirname, 'node_modules', 'livekit-client', 'dist'), { index: false, maxAge: '1d' }));

app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders(res, filePath) {
      // Always check for a fresh copy of the app shell so updates show up right away.
      if (/\.(html|js|css|webmanifest)$/.test(filePath)) res.set('Cache-Control', 'no-cache');
      // The typeface never changes under the same name.
      else if (/\.woff2$/.test(filePath)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return fail(res, 413, req.path.includes('avatar') ? 'Profile pictures can be up to 8 MB.'
      : req.path.includes('homepages') ? 'Pictures can be up to 5 MB, videos 20 MB, and songs 10 MB.' : "That's too big.");
  }
  if (err.status && err.status < 500) return fail(res, err.status, "That request didn't make sense.");
  console.error(err);
  fail(res, 500, 'Something went wrong on the server.');
});

// ---------- Start ----------

const server = http.createServer(app);
realtime.attach(server, { build: BUILD });

// Render stops the old server when an update goes live. Note it in the call debug log, so a
// call that dropped then shows why.
process.once('SIGTERM', () => {
  try { traces.add({ pair: '*', kind: 'server-stop' }); } catch {}
  process.exit(0);
});

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
