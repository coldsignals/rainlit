'use strict';

// Everything live: each signed-in tab keeps one WebSocket open to the server.
// Over it the server shares who's online, rings you when a friend calls, and
// relays the small setup messages that let two browsers connect for a call.
// Audio and video never pass through here.

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { userForToken, tokenFrom, sha256, sameOrigin } = require('./auth');
const { userById, publicUser, areFriends, friendIdsOf } = require('./people');
const dms = require('./dms');
const push = require('./push');
const spaces = require('./spaces');
const traces = require('./traces');
const voice = require('./voice');

// How long someone can be disconnected before their spot in a call is released.
// If everyone is disconnected this long, the call ends.
const RECONNECT_MS = (Number(process.env.RECONNECT_MINUTES) || 30) * 60_000;
// Phones freeze an app's page when they've been locked a while (to save battery), even in a
// call. The call itself carries on without the page, so a page that said it was being frozen
// mid-call (see 'frozen') keeps its place this long: all night, if both phones are asleep.
const FROZEN_MS = 12 * 3600_000;
// Drops shorter than this are treated as a blip and not shown to the other person.
const AWAY_GRACE_MS = (Number(process.env.AWAY_GRACE_SECONDS) || 8) * 1000;
// A page in a call that has stopped talking to us while its connection stays open (its
// phone paused the app, say): pages ping every 10 seconds, or at worst about once a minute
// in the background, so after this long it's gone as far as the call's concerned. Closing
// the connection marks them away; when the page wakes up it reconnects and joins again.
const SILENT_MS = (Number(process.env.SILENT_SECONDS) || 90) * 1000;
// How long to remember a finished call, so someone reconnecting late sees how it ended.
const ENDED_KEEP_MS = 6 * 3600_000;
// How long a call rings before it counts as unanswered.
const RING_MS = 60_000;

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_LOG = 500;

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

// ---------- Who's online ----------

/** userId -> that user's open connections (one per tab or device) */
const sockets = new Map();

function socketsOf(userId) {
  return sockets.get(userId) || new Set();
}

function sendToUser(userId, msg) {
  for (const ws of socketsOf(userId)) send(ws, msg);
}

// Everyone with Rainlit open (an announcement, say).
function sendToEveryone(msg) {
  for (const set of sockets.values()) for (const ws of set) send(ws, msg);
}

// Whether any of the person's devices has Rainlit open. If not, their phone gets a push
// notification instead (see lib/push.js).
// (The Android app says when it's in the background; its phone gets push notes then.)
const isOnline = (userId) => [...socketsOf(userId)].some((ws) => !ws.background);

function pushRing(target, callerId, note) {
  if (isOnline(target)) return;
  const caller = userById(callerId);
  push.send(target, { ...note, from: { id: callerId, name: caller ? caller.display_name : 'A friend' } }, { topic: `ring${callerId}`, ttl: 60 });
}

// What friends see. "Appear offline" hides you completely; otherwise you're away
// if you picked away or every tab you have open has gone idle.
function presenceOf(userId) {
  const u = userById(userId);
  const conns = socketsOf(userId);
  if (!u || u.presence === 'invisible' || !conns.size) return 'offline';
  if (u.presence === 'away') return 'away';
  return [...conns].some((ws) => !ws.idle) ? 'online' : 'away';
}

const lastPresence = new Map();

// Tells your friends, and people in your spaces, if your presence changed (with what you're
// doing: see below).
function announcePresence(userId) {
  const p = presenceOf(userId);
  if (lastPresence.get(userId) === p) return;
  lastPresence.set(userId, p);
  const msg = { type: 'presence', id: userId, presence: p, doing: doingOf(userId) };
  for (const id of new Set([...friendIdsOf(userId), ...spaces.coMembersOf(userId)])) sendToUser(id, msg);
}

// ---------- What people are doing (their activity) ----------
// "Playing Hades", or "Listening to (a song) by (an artist)": from Rainlit for Windows, only if
// its person said yes. It goes to the same people who see them online, only while they don't
// appear offline, and it's never kept. Each connection has its own; the newest one counts.

const DOING_WORDS = 150;
const oneLine = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const msIn = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 86_400_000 ? Math.round(Number(v)) : null);

// What an app sent, as it's passed on: { playing: { name, since }, listening: { title, artist,
// album, app, position, duration, at } } (either can be missing), or null.
function cleanDoing(d, before) {
  if (!d || typeof d !== 'object') return null;
  const out = {};
  const name = d.playing && typeof d.playing === 'object' ? oneLine(d.playing.name, 100) : '';
  if (name) out.playing = { name, since: before && before.playing && before.playing.name === name ? before.playing.since : Date.now() };
  const l = d.listening && typeof d.listening === 'object' ? d.listening : null;
  const title = l ? oneLine(l.title, DOING_WORDS) : '';
  if (title) {
    out.listening = {
      title, artist: oneLine(l.artist, DOING_WORDS), album: oneLine(l.album, DOING_WORDS), app: oneLine(l.app, 40),
      position: msIn(l.position), duration: msIn(l.duration), at: Date.now(),
    };
  }
  return out.playing || out.listening ? out : null;
}

// Someone's activity now (null: nothing, or they appear offline).
function doingOf(userId) {
  if (presenceOf(userId) === 'offline') return null;
  let newest = null;
  for (const ws of socketsOf(userId)) if (ws.doing && (!newest || ws.doingAt > newest.doingAt)) newest = ws;
  return newest ? newest.doing : null;
}

// Tells them (on their other devices too), their friends, and people in their spaces.
function announceDoing(userId) {
  if (presenceOf(userId) === 'offline') return;
  const msg = { type: 'doing', id: userId, doing: doingOf(userId) };
  for (const id of new Set([userId, ...friendIdsOf(userId), ...spaces.coMembersOf(userId)])) sendToUser(id, msg);
}

// An app saying what's happening now. (At most every 2 seconds each: a quicker one waits.)
function setDoing(ws, doing) {
  clearTimeout(ws.doingWait);
  const wait = 2000 - (Date.now() - (ws.doingSent || 0));
  if (wait > 0) {
    ws.doingWait = setTimeout(() => setDoing(ws, doing), wait);
    return;
  }
  ws.doingSent = Date.now();
  ws.doing = cleanDoing(doing, ws.doing);
  ws.doingAt = Date.now();
  announceDoing(ws.userId);
}

// Tells your friends, and everyone in your spaces, about a new name, picture, status or badge.
function announceProfile(user) {
  const msg = { type: 'profile', user: publicUser(user) };
  for (const id of new Set([...friendIdsOf(user.id), ...spaces.coMembersOf(user.id)])) sendToUser(id, msg);
}

// Both people's friend lists changed (a request, an accept, a removal).
function friendsChanged(...userIds) {
  for (const id of userIds) sendToUser(id, { type: 'friends-changed' });
  for (const id of userIds) {
    lastPresence.delete(id); // new friends need to hear it even if it didn't change
    announcePresence(id);
  }
}

// After a password change: sign out every other device that's still connected. (`why`:
// what those devices are told, 'deleted' if the account's gone.)
function closeOtherSessions(userId, keepToken, why = '') {
  const keep = sha256(keepToken || '');
  for (const ws of socketsOf(userId)) {
    if (ws.tokenHash !== keep) {
      send(ws, { type: 'signed-out', why: why || undefined });
      ws.close();
    }
  }
}

// An account that's been deleted: out of any call or voice channel, and signed out everywhere.
// (`why`: what their devices are told: 'deleted', or 'suspended'.)
function forgetUser(userId, why = 'deleted') {
  for (const room of [...rooms.values()]) if (room.members.has(userId)) removeMember(room, userId, 'leave');
  if (voiceOf.has(userId)) voiceLeave(userId);
  closeOtherSessions(userId, null, why);
}

// ---------- Rooms, calls & signaling ----------
//
// Each pair of friends has one room. A *call* starts the first time both are in the
// room together, and keeps going as long as at least one person is still in it.
//
// If someone's connection drops, their spot is held and the call carries on for
// whoever is still there. When they come back (same device or another one) they
// slot straight back in.
//
// The call ends when:
//   - the last person still connected presses Leave, or
//   - nobody has been connected for RECONNECT_MINUTES.

/**
 * @typedef {{ id:string, name:string, ws:any, state:object, connected:boolean,
 *   awaySince:number|null, awayAnnounced:boolean, announceTimer:any, expireTimer:any, expiresAt:number,
 *   frozen:boolean, heardAt:number|null, heardTraced:boolean }} Member
 * @typedef {{ id:string, startedAt:number, endedAt:number|null, log:object[], seq:number }} Call
 * @typedef {{ id:string, pair:string[], members:Map<string,Member>, call:Call|null, lastEnded:Call|null,
 *   cleanupTimer:any, ring:{caller:string,target:string}|null, ringTimer:any, noRing:string|null }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

const pairOf = (x, y) => (x < y ? [x, y] : [y, x]);

function getRoom(x, y) {
  const pair = pairOf(x, y);
  const id = pair.join(':');
  let room = rooms.get(id);
  if (!room) {
    room = { id, pair, members: new Map(), call: null, lastEnded: null, cleanupTimer: null, ring: null, ringTimer: null, noRing: null };
    rooms.set(id, room);
  }
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
  return room;
}

function maybeDeleteRoom(room) {
  if (room.members.size || room.call) return;
  if (!room.lastEnded) return void rooms.delete(room.id);
  // Remember the last call for a while so someone reconnecting late can see how it ended.
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    if (!room.members.size && !room.call) rooms.delete(room.id);
  }, ENDED_KEEP_MS);
}

const connected = (room) => [...room.members.values()].filter((m) => m.connected);

function broadcast(room, msg, exceptId = null) {
  for (const m of room.members.values()) if (m.id !== exceptId && m.connected) send(m.ws, msg);
}

function peerInfo(m) {
  return { id: m.id, name: m.name, state: m.state, away: !m.connected, awaySince: m.awaySince };
}

function publicCall(call) {
  return call && { id: call.id, startedAt: call.startedAt, endedAt: call.endedAt, log: call.log };
}

function logEvent(room, kind, data = {}, t = Date.now()) {
  const call = room.call;
  if (!call) return;
  const entry = { seq: ++call.seq, t, kind, ...data };
  call.log.push(entry);
  if (call.log.length > MAX_LOG) call.log.shift();
  broadcast(room, { type: 'log', entry, now: Date.now() });
}

// The call debug log (lib/traces.js): what the server saw of a call, when someone in it has
// Settings > Call debug log on.
function traceRoom(room, kind, data = {}) {
  if (!room.traced) return;
  try {
    traces.add({ pair: room.id, callId: room.call ? room.call.id : null, kind, data });
  } catch (err) {
    console.error('[trace]', err.message);
  }
}

function names(room) {
  return connected(room).map((m) => m.name).join(' and ');
}

function startCallIfReady(room) {
  if (room.call || connected(room).length < 2) return;
  // After the server restarts (an update), people come back still in the same call. Carry
  // that call on, with its original start time, instead of starting a new one. (One of them
  // may have rung the other in the meantime, giving up their claim; the other's still counts.)
  const claims = connected(room).map((m) => m.resume).filter(Boolean);
  const resumed = claims.length > 0 && claims.every((c) => c.id === claims[0].id);
  room.call = resumed
    ? { id: claims[0].id, startedAt: Math.min(...claims.map((c) => c.startedAt)), endedAt: null, log: [], seq: 0 }
    : { id: newId(), startedAt: Date.now(), endedAt: null, log: [], seq: 0 };
  for (const m of room.members.values()) {
    m.wasInCall = true;
    m.resume = null;
  }
  console.log(`[call] ${resumed ? 'picked up again' : 'started'} with ${names(room)}`);
  broadcast(room, { type: 'call-started', call: publicCall(room.call), now: Date.now() });
  logEvent(room, 'start', { names: connected(room).map((m) => m.name) });
  traceRoom(room, 'call-started', { resumed, who: names(room) });
  // "Bea started a call" in their conversation (but not again when a call's picked up after a restart).
  if (!resumed) noteCall(room, { started: true }, room.ring ? room.ring.caller : null, room.call.startedAt);
}

// Leaves a note about a call in the two people's conversation ("Call, 12 min" or
// "Missed call"). Saved if the conversation is saving, shown live either way.
function noteCall(room, meta, author = null, at = Date.now()) {
  const [a, b] = room.pair;
  const dm = dms.getDm(a, b);
  const fields = { id: newId(), dm: dm.id, author, kind: 'call', meta, at };
  const message = dm.save ? dms.addMessage(fields) : dms.passing(fields);
  for (const id of room.pair) sendToUser(id, { type: 'dm-message', message });
}

function endCall(room, endedAt = Date.now(), why = '') {
  const call = room.call;
  if (!call) return;
  traceRoom(room, 'call-ended', { why, lastedMin: Math.round((endedAt - call.startedAt) / 60_000) });
  noteCall(room, { durationMs: endedAt - call.startedAt }, null, endedAt);
  call.endedAt = endedAt;
  call.seq++;
  call.log.push({ seq: call.seq, t: endedAt, kind: 'end', durationMs: endedAt - call.startedAt });
  room.call = null;
  room.lastEnded = call;
  for (const m of room.members.values()) {
    clearTimeout(m.announceTimer);
    clearTimeout(m.expireTimer);
  }
  room.members.clear();
  tellWaiting(room);
  console.log(`[call] ended after ${formatDuration(endedAt - call.startedAt)}`);
  maybeDeleteRoom(room);
}

/** reason: 'leave' (pressed Leave) | 'timeout' (didn't come back) | 'replaced' (rejoined from another device) */
function removeMember(room, memberId, reason) {
  const m = room.members.get(memberId);
  if (!m) return;
  traceRoom(room, 'member-removed', { who: m.name, reason });
  clearTimeout(m.announceTimer);
  clearTimeout(m.expireTimer);
  room.members.delete(memberId);
  broadcast(room, { type: 'peer-left', id: memberId, reason });
  if (reason === 'replaced') return; // their new connection takes over right away

  if (room.call) {
    if (connected(room).length === 0 && reason === 'leave') {
      // The last person still in the call left on purpose: the call is over.
      logEvent(room, 'leave', { id: m.id, name: m.name });
      endCall(room, Date.now(), 'last-one-left');
    } else if (room.members.size === 0) {
      // Everyone dropped and nobody came back. The call ended when the last person was last
      // seen (or heard, by the other one).
      endCall(room, Math.max(m.awaySince || 0, m.heardAt || 0) || Date.now(), 'nobody-came-back');
    } else {
      logEvent(room, reason === 'leave' ? 'leave' : 'timeout', { id: m.id, name: m.name });
    }
  }
  if (m.id === room.noRing) room.noRing = null;
  updateRing(room);
  tellWaiting(room);
  maybeDeleteRoom(room);
}

function markAway(room, m) {
  m.connected = false;
  m.ws = null;
  m.awaySince = Date.now();
  m.awayAnnounced = false;
  clearTimeout(m.announceTimer);
  clearTimeout(m.expireTimer);
  updateRing(room);

  if (!room.call) {
    // No call yet (they were waiting alone). Just tidy up if they don't return soon.
    holdSpot(room, m, AWAY_GRACE_MS * 3);
    return;
  }
  // Short blips are ignored. Only tell the other person once it's clearly a real drop.
  m.announceTimer = setTimeout(() => {
    m.awayAnnounced = true;
    tellWaiting(room);
    traceRoom(room, 'away-announced', { who: m.name });
    broadcast(room, { type: 'peer-away', id: m.id, awaySince: m.awaySince, now: Date.now() }, m.id);
    logEvent(room, 'away', { id: m.id, name: m.name }, m.awaySince);
  }, AWAY_GRACE_MS);
  holdSpot(room, m, m.frozen ? FROZEN_MS : RECONNECT_MS);
}

// Someone away keeps their place in the call this much longer; after that, they're out.
function holdSpot(room, m, ms) {
  clearTimeout(m.expireTimer);
  m.expiresAt = Date.now() + ms;
  m.expireTimer = setTimeout(() => removeMember(room, m.id, 'timeout'), ms);
}

// Someone away whose voice (or anything else of theirs) still reaches the other person: their
// phone has frozen Rainlit's page, most likely, which doesn't stop the call itself. They're
// still in it, whatever their link to here says.
function stillHeard(room, m) {
  m.heardAt = Date.now();
  if (m.expiresAt - Date.now() < RECONNECT_MS) holdSpot(room, m, RECONNECT_MS);
  if (!m.heardTraced) {
    m.heardTraced = true;
    traceRoom(room, 'still-heard', { who: m.name });
  }
}

// ---------- "Waiting for you" ----------
// One of a pair is in their call and the other isn't: still waiting after the ringing stopped,
// or carrying on after the other one dropped out or left. The one who isn't sees it in their
// conversation (with a way to join) for as long as it lasts.

function waitingOne(room) {
  const inIt = room.pair.filter((id) => room.members.has(id));
  return inIt.length === 1 ? inIt[0] : null;
}

// (`away`: their connection dropped a while ago, and their spot is being held for them.)
function waitingNote(room, forUser) {
  const other = room.pair.find((id) => id !== forUser);
  const m = waitingOne(room) === other ? room.members.get(other) : null;
  if (!m) return { type: 'call-waiting', with: other, on: false };
  return { type: 'call-waiting', with: other, on: true, call: Boolean(room.call), away: m.awayAnnounced };
}

function tellWaiting(room) {
  const who = waitingOne(room);
  const key = who ? `${who}:${room.call ? room.call.id : ''}:${room.members.get(who).awayAnnounced ? 'away' : ''}` : '';
  if ((room.waitingTold || '') === key) return;
  room.waitingTold = key;
  for (const id of room.pair) sendToUser(id, waitingNote(room, id));
}

// ---------- Ringing ----------
//
// Before a call has started, whoever is waiting in it rings the other person on
// every device they have open, until they join, decline, or a minute passes.

function ringMessage(room) {
  const caller = userById(room.ring.caller);
  return { type: 'ring', from: caller ? publicUser(caller) : { id: room.ring.caller } };
}

function updateRing(room) {
  let want = null;
  const waiting = connected(room);
  // Someone coming back to a call the server lost in a restart isn't calling anew: no ringing.
  if (!room.call && waiting.length === 1 && !waiting[0].resume) {
    const caller = waiting[0].id;
    const target = room.pair.find((id) => id !== caller);
    if (!room.members.has(target) && room.noRing !== caller) want = { caller, target };
  }
  const same = want && room.ring && want.caller === room.ring.caller && want.target === room.ring.target;
  if (same || (!want && !room.ring)) return;

  if (room.ring) {
    sendToUser(room.ring.target, { type: 'ring-stop', from: room.ring.caller });
    pushRing(room.ring.target, room.ring.caller, { type: 'ring-end', missed: !room.call });
    clearTimeout(room.ringTimer);
    // It stopped ringing without the call starting: they missed it (or declined).
    if (!room.call) noteCall(room, { missed: true }, room.ring.caller);
  }
  room.ring = want;
  if (!want) return;
  sendToUser(want.target, ringMessage(room));
  pushRing(want.target, want.caller, { type: 'ring' });
  room.ringTimer = setTimeout(() => {
    // Nobody answered. Stop ringing, and let the caller know.
    if (room.ring !== want) return;
    room.noRing = want.caller;
    updateRing(room);
    sendToUser(want.caller, { type: 'no-answer', id: want.target });
  }, RING_MS);
}

function declineRing(ws, msg) {
  const callerId = String(msg.from || '');
  const room = rooms.get(pairOf(ws.userId, callerId).join(':'));
  if (!room || !room.ring || room.ring.target !== ws.userId) return;
  room.noRing = callerId;
  updateRing(room);
  sendToUser(callerId, { type: 'declined', id: ws.userId });
}

// ---------- Joining a call ----------

function cleanState(s) {
  s = s && typeof s === 'object' ? s : {};
  return { mic: Boolean(s.mic), cam: Boolean(s.cam), screen: Boolean(s.screen), phone: Boolean(s.phone) };
}

function handleJoin(ws, msg) {
  const user = userById(ws.userId);
  const friendId = String(msg.with || '');
  if (!user || !areFriends(user.id, friendId)) return send(ws, { type: 'error', code: 'not-friends' });
  const cid = user.id;
  const name = user.display_name;
  const room = getRoom(cid, friendId);
  if (msg.trace) room.traced = true; // (someone in it has the call debug log on)

  // Reconnecting to a call that already ended while they were gone.
  if (msg.callId && room.lastEnded && room.lastEnded.id === msg.callId && (!room.call || room.call.id !== msg.callId)) {
    traceRoom(room, 'told-it-ended', { who: name, call: room.lastEnded.id.slice(0, 8) });
    send(ws, { type: 'call-ended', call: publicCall(room.lastEnded), now: Date.now() });
    maybeDeleteRoom(room);
    return null;
  }

  // The call they believe they're in, if the server doesn't know it (it restarted since).
  const started = Number(msg.callStartedAt);
  const resume = msg.callId && ID_RE.test(String(msg.callId)) && !room.call
    && started > Date.now() - 24 * 3600_000 && started <= Date.now()
    ? { id: String(msg.callId), startedAt: started }
    : null;

  let me = room.members.get(cid);
  let returning = null; // { awayMs } if they were announced as away
  let how = 'joined'; // (for the call debug log)

  if (me) {
    // Coming back: a network blip, a reload, a reopened app, or the call opened on another tab or device.
    const moved = Boolean(me.ws && me.ws !== ws && me.ws.readyState === me.ws.OPEN);
    if (moved) {
      send(me.ws, { type: 'replaced' });
      me.ws.call = null; // that tab stays signed in, it just isn't in the call any more
    }
    clearTimeout(me.announceTimer);
    clearTimeout(me.expireTimer);
    if (me.awayAnnounced) returning = { awayMs: Date.now() - me.awaySince };
    how = moved ? 'moved-device' : me.connected ? 'rejoined' : 'came-back';
    Object.assign(me, { ws, name, state: cleanState(msg.state), connected: true, awaySince: null, awayAnnounced: false, frozen: false, heardAt: null, heardTraced: false, resume });
    if (returning) broadcast(room, { type: 'peer-back', peer: peerInfo(me) }, cid);
    // Moved to another device: the other person connects to that one afresh.
    else if (moved) broadcast(room, { type: 'peer-moved', peer: peerInfo(me) }, cid);
  } else {
    // A fresh try at calling clears an earlier "no answer" or "declined".
    if (room.noRing === cid) room.noRing = null;
    me = {
      id: cid, name, ws, state: cleanState(msg.state), connected: true, awaySince: null, awayAnnounced: false,
      announceTimer: null, expireTimer: null, expiresAt: 0, frozen: false, heardAt: null, heardTraced: false, wasInCall: false, resume,
    };
    room.members.set(cid, me);
    broadcast(room, { type: 'peer-joined', peer: peerInfo(me) }, cid);
  }

  tellWaiting(room);
  const peer = [...room.members.values()].find((m) => m.id !== cid);
  send(ws, { type: 'joined', with: friendId, peer: peer ? peerInfo(peer) : null, call: publicCall(room.call), now: Date.now() });

  traceRoom(room, `member-${how}`, {
    who: name, awayS: returning ? Math.round(returning.awayMs / 1000) : undefined, claim: resume ? resume.id.slice(0, 8) : undefined,
  });
  if (room.call) {
    if (returning) logEvent(room, 'back', { id: cid, name, awayMs: returning.awayMs });
    else if (!me.wasInCall) logEvent(room, 'join', { id: cid, name });
    me.wasInCall = true;
  } else {
    startCallIfReady(room);
  }
  updateRing(room);
  return { room, member: me };
}

// Messages about the call you're in.
// Things one side fixed by itself during a call (like a mic the phone stopped), for the summary.
const NOTES = new Set(['mic-ended', 'mic-silent', 'mic-failed', 'sound-stalled', 'app-restarted']);

function handleCallMessage(ws, msg) {
  const session = ws.call;
  if (!session) return;
  const { room, member: me } = session;
  if (room.members.get(me.id) !== me || me.ws !== ws) return; // stale connection

  switch (msg.type) {
    case 'signal':
      broadcast(room, { type: 'signal', from: me.id, data: msg.data }, me.id);
      break;
    case 'state':
      me.state = cleanState(msg.state);
      broadcast(room, { type: 'state', from: me.id, state: me.state }, me.id);
      break;
    case 'delete':
      // Someone removed a file they sent straight to the other person during the call
      // (with saving off). Tell the other person so it vanishes for them too.
      if (!ID_RE.test(String(msg.id))) break;
      broadcast(room, { type: 'delete', id: String(msg.id), from: me.id, name: me.name }, me.id);
      break;
    case 'note':
      if (NOTES.has(msg.what)) logEvent(room, 'note', { id: me.id, name: me.name, what: msg.what });
      break;
    case 'trace':
      if (msg.on) room.traced = true; // (they turned the call debug log on during the call)
      break;
    case 'frozen':
      // Their phone is about to freeze Rainlit's page. If its link to here goes quiet now, they
      // haven't left: their place is held (see FROZEN_MS).
      me.frozen = true;
      break;
    case 'peer-heard':
      // The other person's page has gone quiet to us, but their voice still reaches this one.
      for (const m of room.members.values()) if (m !== me && !m.connected && room.call) stillHeard(room, m);
      break;
    case 'leave':
      removeMember(room, me.id, 'leave');
      ws.call = null;
      break;
  }
}

// ---------- Connections ----------

let BUILD = '';

// ----- Voice channels: who's in which -----
// The sound and video go through LiveKit (lib/voice.js). This keeps the list everyone sees:
// who's in each voice channel, and whether they're muted, deafened, on camera or sharing.
// People say when they join and leave; someone whose app vanishes is taken out after a little
// while, in case they're only reconnecting.

const VOICE_GRACE_MS = 20_000;
const voiceIn = new Map(); // channel id -> Map(user id -> { muted, deafened, video, screen, since, ws })
const voiceOf = new Map(); // user id -> the channel they're in
const voiceGone = new Map(); // user id -> timer for taking them out

function voiceList(channelId) {
  const members = voiceIn.get(channelId);
  return members ? [...members].map(([id, s]) => ({ id, muted: s.muted, deafened: s.deafened, video: s.video, screen: s.screen, since: s.since, pub: voice.pubOf(id) })) : [];
}

function tellVoice(channelId) {
  const channel = spaces.channel(channelId);
  if (!channel) return;
  const msg = { type: 'voice-state', channel: channelId, members: voiceList(channelId) };
  for (const id of spaces.channelAudience(channel)) sendToUser(id, msg);
}

// (soft: their app went away without saying, and may be back: see lib/voice.js. session: the
// Cloudflare session they said they're leaving.)
function voiceLeave(userId, soft = false, session = '') {
  clearTimeout(voiceGone.get(userId));
  voiceGone.delete(userId);
  const channelId = voiceOf.get(userId);
  voice.left(userId, soft, session ? { session } : { channelId });
  if (!channelId) return;
  voiceOf.delete(userId);
  const members = voiceIn.get(channelId);
  if (members) {
    members.delete(userId);
    if (!members.size) voiceIn.delete(channelId);
  }
  tellVoice(channelId);
  if (!voiceIn.has(channelId)) groupCallEnded(channelId); // (the last one out of a group's call)
}

// ----- Group calls -----
// A group's call is its voice channel. The first one in starts it: the group's chat says so,
// and everyone else in the group is rung (on every device with Rainlit open, and phones get a
// notification) until they join or decline, or a minute passes. When the last one leaves,
// the chat says how long it lasted. Someone back in it after the server restarted (an
// update) carries it on, rather than starting it again.

const groupCalls = new Map(); // voice channel id -> { startedAt, ringing: Set(user id), ringTimer }

function groupCallNote(spaceId, authorId, meta, at = Date.now()) {
  const chat = spaces.groupChat(spaceId);
  if (!chat) return;
  const message = dms.addMessage({ id: newId(), dm: chat.id, author: authorId, kind: 'call', meta, at });
  for (const id of spaces.memberIds(spaceId)) sendToUser(id, { type: 'dm-message', message });
}

function groupCallStarted(channel, space, userId, msg) {
  const since = Number(msg.since);
  if (msg.again) {
    groupCalls.set(channel.id, { startedAt: since > 0 && since <= Date.now() ? since : Date.now(), ringing: new Set(), ringTimer: null });
    return;
  }
  const call = { startedAt: Date.now(), ringing: new Set(), ringTimer: null };
  groupCalls.set(channel.id, call);
  groupCallNote(space.id, userId, { started: true }, call.startedAt);
  const caller = userById(userId);
  const from = caller ? publicUser(caller) : { id: userId };
  const chat = spaces.groupChat(space.id);
  for (const id of spaces.memberIds(space.id)) {
    if (id === userId) continue;
    call.ringing.add(id);
    sendToUser(id, { type: 'group-ring', space: space.id, channel: channel.id, from });
    // A phone with Rainlit in the background: a notification that opens the group.
    if (!isOnline(id) && chat) {
      push.send(id, { type: 'message', from: { id: `ch:${chat.id}`, name: `${from.displayName || 'Someone'} started a call${space.name ? ` in ${space.name}` : ''}` } },
        { topic: `ring${channel.id}`, ttl: 60 });
    }
  }
  call.ringTimer = setTimeout(() => stopGroupRing(channel.id), RING_MS);
}

// Stops ringing someone (they joined, or declined), or everyone.
function stopGroupRing(channelId, userId = null) {
  const call = groupCalls.get(channelId);
  if (!call) return;
  for (const id of userId ? [userId] : [...call.ringing]) {
    if (!call.ringing.delete(id)) continue;
    sendToUser(id, { type: 'group-ring-stop', channel: channelId });
  }
  if (!call.ringing.size) clearTimeout(call.ringTimer);
}

function groupCallEnded(channelId) {
  const call = groupCalls.get(channelId);
  const channel = spaces.channel(channelId);
  if (!call) return;
  stopGroupRing(channelId);
  groupCalls.delete(channelId);
  if (channel) groupCallNote(channel.space_id, null, { durationMs: Date.now() - call.startedAt });
}

function voiceJoin(ws, msg) {
  const channel = spaces.channel(String(msg.channel || ''));
  const member = channel && channel.kind === 'voice' && spaces.memberOf(channel.space_id, ws.userId);
  const access = member && spaces.channelAccess(channel, member);
  if (!access || !access.connect) return;
  if (voiceOf.get(ws.userId) !== channel.id) voiceLeave(ws.userId);
  clearTimeout(voiceGone.get(ws.userId));
  voiceGone.delete(ws.userId);
  const wasEmpty = !voiceIn.has(channel.id);
  if (!voiceIn.has(channel.id)) voiceIn.set(channel.id, new Map());
  const before = voiceIn.get(channel.id).get(ws.userId);
  voiceIn.get(channel.id).set(ws.userId, {
    muted: Boolean(msg.muted), deafened: Boolean(msg.deafened), video: false, screen: false,
    since: before ? before.since : Date.now(), ws,
  });
  voiceOf.set(ws.userId, channel.id);
  // (Cloudflare: after the server restarted, what this app says it's sending is checked with
  // Cloudflare, then shown.)
  if (voice.backend === 'cloudflare' && msg.session) {
    voice.cf.restore(ws.userId, channel.id, { pub: String(msg.session), sub: String(msg.sub || '') }, msg.pub, msg.tab, access.speak)
      .then((changed) => { if (changed) tellVoice(channel.id); })
      .catch(() => {});
  }
  tellVoice(channel.id);
  const space = spaces.getSpace(channel.space_id);
  if (spaces.isGroup(space)) {
    const call = groupCalls.get(channel.id);
    if (!call) {
      if (wasEmpty) groupCallStarted(channel, space, ws.userId, msg);
    } else {
      stopGroupRing(channel.id, ws.userId); // (they answered)
      const since = Number(msg.since);
      if (msg.again && since > 0 && since < call.startedAt) call.startedAt = since;
    }
  }
}

function voiceUpdate(ws, msg) {
  const channelId = voiceOf.get(ws.userId);
  const s = channelId && voiceIn.get(channelId) && voiceIn.get(channelId).get(ws.userId);
  if (!s) return;
  for (const key of ['muted', 'deafened', 'video', 'screen']) if (key in msg) s[key] = Boolean(msg[key]);
  s.ws = ws;
  tellVoice(channelId);
}

// The app they were in voice on went away: take them out soon, unless they come back.
function voiceSocketClosed(ws) {
  const channelId = voiceOf.get(ws.userId);
  const s = channelId && voiceIn.get(channelId) && voiceIn.get(channelId).get(ws.userId);
  if (!s || s.ws !== ws) return;
  clearTimeout(voiceGone.get(ws.userId));
  voiceGone.set(ws.userId, setTimeout(() => voiceLeave(ws.userId, true), VOICE_GRACE_MS));
}

const voiceChannelOf = (userId) => voiceOf.get(userId) || null;
const voiceMembers = (channelId) => [...(voiceIn.get(channelId) || new Map()).keys()];

// ----- Alone in a voice channel -----
// Voice channels cost by the minute on LiveKit Cloud (its free plan has 5,000 a month), and
// someone left alone in one overnight uses up a good part of that. So after VOICE_ALONE_MINUTES
// (15) alone, they're asked if they're still there, and taken out two minutes later if they
// don't say so. The server does it, so it works even if their phone or computer is asleep.
// (0 turns it off: with your own LiveKit server, minutes don't cost anything.)

const ALONE_MINUTES = process.env.VOICE_ALONE_MINUTES === undefined ? 15 : Number(process.env.VOICE_ALONE_MINUTES) || 0;
const ALONE_MS = ALONE_MINUTES * 60_000;
const ALONE_ASK_MS = Math.min(2 * 60_000, ALONE_MS / 2);
const alone = new Map(); // channel id -> { userId, since, askedAt }

function checkAlone() {
  const now = Date.now();
  for (const channelId of alone.keys()) if (!voiceIn.has(channelId)) alone.delete(channelId);
  for (const [channelId, members] of voiceIn) {
    if (members.size !== 1) {
      alone.delete(channelId);
      continue;
    }
    const [userId] = members.keys();
    let a = alone.get(channelId);
    if (!a || a.userId !== userId) alone.set(channelId, (a = { userId, since: now, askedAt: 0 }));
    if (!a.askedAt && now - a.since >= ALONE_MS) {
      a.askedAt = now;
      sendToUser(userId, { type: 'voice-alone', channel: channelId, leaveAt: now + ALONE_ASK_MS, minutes: ALONE_MINUTES });
    } else if (a.askedAt && now - a.askedAt >= ALONE_ASK_MS) {
      alone.delete(channelId);
      voiceLeave(userId);
      sendToUser(userId, { type: 'voice-ended', channel: channelId, reason: 'alone', minutes: ALONE_MINUTES });
      voice.removeParticipant(channelId, userId);
    }
  }
}
if (ALONE_MS > 0) setInterval(checkAlone, Math.min(15_000, ALONE_MS / 4)).unref();

// "I'm still here": the time alone starts again.
function voiceStay(ws) {
  const a = alone.get(voiceOf.get(ws.userId));
  if (a && a.userId === ws.userId) {
    a.since = Date.now();
    a.askedAt = 0;
  }
}

function attach(server, { build = '' } = {}) {
  BUILD = build;
  try {
    traces.add({ pair: '*', kind: 'server-start', data: { build: build.slice(0, 12) } });
  } catch (err) {
    console.error('[trace]', err.message);
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    // Only this site's own pages may connect (the browser sends your sign-in cookie with the request).
    if (pathname !== '/ws' || !sameOrigin(req)) return socket.destroy();
    const token = tokenFrom(req);
    const user = userForToken(token);
    if (!user) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = user.id;
      ws.tokenHash = sha256(token);
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.lastHeard = Date.now();
    ws.openedAt = Date.now();
    ws.idle = false;
    ws.call = null;
    ws.on('pong', () => (ws.isAlive = true));

    if (!sockets.has(ws.userId)) sockets.set(ws.userId, new Set());
    sockets.get(ws.userId).add(ws);
    // (with any friends waiting for them in a call)
    const waiting = [...rooms.values()].filter((room) => room.pair.includes(ws.userId) && waitingOne(room) && waitingOne(room) !== ws.userId);
    send(ws, { type: 'hello', now: Date.now(), build: BUILD, waiting: waiting.map((room) => waitingNote(room, ws.userId)) });
    announcePresence(ws.userId);
    // A friend might already be calling.
    for (const room of rooms.values()) {
      if (room.ring && room.ring.target === ws.userId) send(ws, ringMessage(room));
    }

    ws.on('message', (raw) => {
      ws.isAlive = true;
      ws.lastHeard = Date.now();
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      if (ws.call && msg.type !== 'frozen') ws.call.member.frozen = false; // (awake again)

      switch (msg.type) {
        case 'ping':
          return send(ws, { type: 'pong', now: Date.now() });
        case 'activity':
          ws.idle = Boolean(msg.idle);
          return announcePresence(ws.userId);
        case 'background':
          ws.background = Boolean(msg.on);
          return;
        case 'doing':
          return setDoing(ws, msg.doing);
        case 'typing': {
          // "Alice is typing…", passed straight on and never kept: to that friend, or to
          // everyone else in the channel.
          const on = Boolean(msg.on);
          if (msg.channel) {
            const channel = spaces.channel(msg.channel);
            const member = channel && spaces.memberOf(channel.space_id, ws.userId);
            const access = member && spaces.channelAccess(channel, member);
            if (!access || !access.send) return;
            for (const id of spaces.channelAudience(channel)) {
              if (id !== ws.userId) sendToUser(id, { type: 'typing', from: ws.userId, channel: channel.id, on });
            }
            return;
          }
          const to = String(msg.to || '');
          if (!areFriends(ws.userId, to)) return;
          return sendToUser(to, { type: 'typing', from: ws.userId, on });
        }
        case 'voice-join':
          return voiceJoin(ws, msg);
        case 'voice-update':
          return voiceUpdate(ws, msg);
        case 'voice-leave':
          voiceLeave(ws.userId, false, String(msg.session || ''));
          return;
        case 'voice-stay':
          return voiceStay(ws);
        case 'group-ring-decline':
          return stopGroupRing(String(msg.channel || ''), ws.userId);
        case 'call-join':
          ws.call = handleJoin(ws, msg) || null;
          return;
        case 'ring-decline':
          return declineRing(ws, msg);
        default:
          return handleCallMessage(ws, msg);
      }
    });

    ws.on('close', (code) => {
      const mine = sockets.get(ws.userId);
      if (mine) {
        mine.delete(ws);
        if (!mine.size) sockets.delete(ws.userId);
      }
      clearTimeout(ws.doingWait);
      announcePresence(ws.userId);
      if (ws.doing) announceDoing(ws.userId); // (what their other devices say, if anything)
      voiceSocketClosed(ws);
      const session = ws.call;
      if (!session) return;
      const { room, member: me } = session;
      if (room.members.get(me.id) !== me || me.ws !== ws) return;
      traceRoom(room, 'socket-closed', {
        who: me.name, code, cause: ws.endCause, background: ws.background || undefined, frozen: me.frozen || undefined,
        quietS: Math.round((Date.now() - ws.lastHeard) / 1000), openMin: Math.round((Date.now() - ws.openedAt) / 60_000),
      });
      markAway(room, me);
    });
  });

  // Find connections that died without saying goodbye (e.g. someone's internet cut out).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive || (ws.call && Date.now() - ws.lastHeard > SILENT_MS)) {
        ws.endCause = !ws.isAlive ? 'no-pong' : 'silent'; // (for the call debug log)
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, 10_000);
  wss.on('close', () => clearInterval(heartbeat));
}

module.exports = {
  RECONNECT_MS, attach, presenceOf, doingOf, announcePresence, announceProfile, friendsChanged, closeOtherSessions, forgetUser, sendToUser, sendToEveryone, isOnline,
  voiceList, voiceLeave, voiceChannelOf, voiceMembers, tellVoice,
};
