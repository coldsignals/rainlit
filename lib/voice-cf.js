'use strict';

// Voice channels and group calls through Cloudflare Realtime's SFU
// (developers.cloudflare.com/realtime/sfu): Cloudflare's servers pass everyone's sound and video
// along, and charge only for what they send out, with the first 1,000 GB a month free (shared
// with its TURN relay). It has no rooms of its own: Rainlit decides who can send what (their
// mic, camera, screen, and the screen's sound) and who gets whose, through the routes in
// server.js. The sound and video are end-to-end encrypted in the apps (public/voice-e2ee.js)
// with each channel's key, so Cloudflare only ever passes along scrambled frames.
//
// Each person's app has two connections there, so offers never cross (as LiveKit does it): one
// that only sends (the app makes the offers: "pub"), and one that only receives (Cloudflare makes
// the offers: "sub"). What someone sends is only listed for the others once their app says it's
// connected and flowing (ready): asked for any sooner, Cloudflare can lose it for good. Something
// the app stops receiving is closed there straight away (no offer). Closed slots can't be used
// again, so after a lot of coming and going, the app starts a fresh receiving session (resub).
//
// Settings: CF_REALTIME_APP_ID and CF_REALTIME_APP_SECRET (an app made in Cloudflare's
// dashboard, under Realtime, Serverless SFU). The secret stays here, on the server.

const crypto = require('crypto');

const APP_ID = String(process.env.CF_REALTIME_APP_ID || '').trim();
const SECRET = String(process.env.CF_REALTIME_APP_SECRET || '').trim();
const enabled = Boolean(APP_ID && SECRET);
const API = `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(APP_ID)}`;
const DEBUG = process.env.VOICE_DEBUG === '1'; // (every call to Cloudflare, in the log)

// What someone can send: their mic, their camera, their screen, and their screen's sound.
const KINDS = ['mic', 'cam', 'screen', 'screenAudio'];

class VoiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new VoiceError("Couldn't reach the voice service. Try again.", 502);
  }
  const data = await res.json().catch(() => ({}));
  if (DEBUG) {
    const asked = body && Array.isArray(body.tracks) ? ` asked [${body.tracks.map((t) => `${(t.sessionId || '').slice(0, 6)}/${t.trackName || t.mid || ''}`).join(',')}]` : '';
    const tracks = (data.tracks || []).map((t) => `${t.location || ''}:${t.mid || '-'}${t.status ? `/${t.status}` : ''}${t.errorCode ? `!${t.errorCode}` : ''}`).join(',') + asked;
    console.log(`[voice] ${method} ${path.replace(/[a-f0-9]{32}/g, (s) => s.slice(0, 6))} -> ${res.status}${data.errorCode ? ` ${data.errorCode}` : ''}${data.requiresImmediateRenegotiation ? ' (renegotiate)' : ''} [${tracks}]`);
  }
  if (!res.ok || data.errorCode) {
    console.error(`[voice] Cloudflare: ${res.status} ${data.errorCode || ''} ${data.errorDescription || ''}`);
    throw new VoiceError("The voice service couldn't do that. Try again.", 502);
  }
  return data;
}

const sdpOf = (text) => {
  const sdp = String(text || '');
  if (!sdp.startsWith('v=0') || sdp.length > 200_000) throw new VoiceError("That didn't make sense.");
  return sdp;
};
const MID = /^[0-9]{1,4}$/;

// ---------- Who's sending what ----------
// user id -> { channelId, pubSession, subSession, tab, speak, pub: { kind -> track name },
// mids: { kind -> mid (on the sending connection) }, ready: { kind -> when it was flowing } }.
// Kept in memory: after a restart, each app says again what it has, and that's checked with
// Cloudflare (restore).

const people = new Map();

// What they're sending that's ready to be had. (null: not known yet, just after the server
// restarted, while it's checked.)
const pubOf = (userId) => {
  const p = people.get(userId);
  return p ? Object.fromEntries(Object.entries(p.pub).filter(([k]) => p.ready[k])) : null;
};

// Joining a channel (or again, after the connection failed): two new sessions. One person, one
// place: joining from another tab or device takes the old one out (`replaced` says which tab
// that was, to tell it).
async function start(userId, channelId, tab, speak) {
  const old = people.get(userId);
  const [pubS, subS] = await Promise.all([
    call('POST', `/sessions/new?correlationId=${encodeURIComponent(`${channelId}-pub`)}`),
    call('POST', `/sessions/new?correlationId=${encodeURIComponent(`${channelId}-sub`)}`),
  ]);
  if (old) stopSending(old); // (not waited for: see repub)
  people.set(userId, { channelId, pubSession: pubS.sessionId, subSession: subS.sessionId, tab: String(tab || ''), speak: Boolean(speak), pub: {}, mids: {}, ready: {} });
  return { pubSession: pubS.sessionId, subSession: subS.sessionId, replaced: old && old.tab !== String(tab || '') ? { channelId: old.channelId, tab: old.tab } : null };
}

function mine(userId, channelId) {
  const p = people.get(userId);
  if (!p || p.channelId !== channelId) throw new VoiceError("You're not in that voice channel.", 409);
  return p;
}

// ---------- Sending (the app's offers) ----------

async function publish(userId, channelId, sdp, tracks) {
  const p = mine(userId, channelId);
  if (!p.speak) throw new VoiceError("You can't talk in this channel.", 403);
  const list = (Array.isArray(tracks) ? tracks : []).slice(0, 4).filter((t) => t && KINDS.includes(t.kind) && MID.test(String(t.mid)));
  if (!list.length) throw new VoiceError("That didn't make sense.");
  const named = list.map((t) => ({ kind: t.kind, mid: String(t.mid), trackName: `${t.kind}-${crypto.randomBytes(8).toString('hex')}` }));
  const r = await call('POST', `/sessions/${p.pubSession}/tracks/new`, {
    sessionDescription: { type: 'offer', sdp: sdpOf(sdp) },
    tracks: named.map(({ mid, trackName }) => ({ location: 'local', mid, trackName })),
  });
  if ((r.tracks || []).some((t) => t.errorCode) || !r.sessionDescription) throw new VoiceError("The voice service couldn't take that. Try again.", 502);
  const names = {};
  for (const t of named) {
    p.pub[t.kind] = t.trackName;
    p.mids[t.kind] = t.mid;
    delete p.ready[t.kind];
    names[t.kind] = t.trackName;
  }
  return { sdp: r.sessionDescription.sdp, tracks: names };
}

// The app's connection is up and these ({ kind: track name }) are flowing: listed for the others.
// Returns whether anything's new.
function ready(userId, channelId, tracks) {
  const p = mine(userId, channelId);
  let changed = false;
  for (const [kind, name] of Object.entries(tracks && typeof tracks === 'object' ? tracks : {})) {
    if (!KINDS.includes(kind) || p.pub[kind] !== name || p.ready[kind]) continue;
    p.ready[kind] = Date.now();
    changed = true;
  }
  return changed;
}

// Stopping sending (a camera off, a screen share stopped): the app's offer, those stopped. (No
// offer when it was the last thing being sent: then it's just stopped here.)
async function unpublish(userId, channelId, sdp, kinds) {
  const p = mine(userId, channelId);
  const list = (Array.isArray(kinds) ? kinds : []).filter((k) => KINDS.includes(k) && p.mids[k]);
  if (!list.length) return { sdp: null };
  if (!sdp) {
    await stopSending(p, list);
    return { sdp: null };
  }
  const r = await call('PUT', `/sessions/${p.pubSession}/tracks/close`, {
    sessionDescription: { type: 'offer', sdp: sdpOf(sdp) },
    tracks: list.map((k) => ({ mid: p.mids[k] })),
    force: false,
  });
  for (const k of list) {
    delete p.pub[k];
    delete p.mids[k];
    delete p.ready[k];
  }
  return { sdp: r.sessionDescription ? r.sessionDescription.sdp : null };
}

// ---------- Getting others' (Cloudflare's offers) ----------

// [{ user, kind }] -> the ones that can be had: { user, kind, sessionId, trackName }.
function wantedOf(userId, channelId, wanted) {
  const out = [];
  for (const w of (Array.isArray(wanted) ? wanted : []).slice(0, 64)) {
    const from = w && people.get(String(w.user));
    const name = from && from.channelId === channelId && KINDS.includes(w.kind) && from.ready[w.kind] && from.pub[w.kind];
    if (name && String(w.user) !== userId) out.push({ user: String(w.user), kind: w.kind, sessionId: from.pubSession, trackName: name });
  }
  return out;
}

// What Cloudflare said: which came (and on which slot), which didn't (not there yet, say: the
// app tries again), and its offer if the app has to answer.
function results(r, asked, askedFor) {
  const got = [];
  const missing = [];
  for (const w of askedFor) {
    const a = asked.find((x) => x.user === String(w.user) && x.kind === w.kind);
    const t = a && (r.tracks || []).find((x) => x.trackName === a.trackName);
    if (t && t.mid && !t.errorCode) got.push({ user: a.user, kind: a.kind, trackName: a.trackName, mid: String(t.mid) });
    else missing.push({ user: String(w.user), kind: w.kind });
  }
  return { sdp: r.requiresImmediateRenegotiation && r.sessionDescription ? r.sessionDescription.sdp : null, tracks: got, missing };
}

// New ones, on new slots of the receiving connection.
async function pull(userId, channelId, wanted) {
  const p = mine(userId, channelId);
  const askedFor = (Array.isArray(wanted) ? wanted : []).slice(0, 64).filter((w) => w && w.user && w.kind);
  const asked = wantedOf(userId, channelId, askedFor);
  if (!asked.length) return { sdp: null, tracks: [], missing: askedFor.map((w) => ({ user: String(w.user), kind: w.kind })) };
  const r = await call('POST', `/sessions/${p.subSession}/tracks/new`, {
    tracks: asked.map(({ sessionId, trackName }) => ({ location: 'remote', sessionId, trackName })),
  });
  checkLost(r, asked, channelId);
  return results(r, asked, askedFor);
}

// Should Cloudflare still not find something well after the app said it was flowing (it's
// happened: a track it listed as "active" that nobody could ever get), the sender's app is asked
// to send it all again, on a new sending connection (at most every 15 seconds). Their app goes
// ahead only if its connection's been up a while.
const LOST_AFTER = 5000;
let onLost = () => {};
const whenLost = (fn) => { onLost = fn; };

function checkLost(r, asked, channelId) {
  const now = Date.now();
  for (const a of asked) {
    const t = (r.tracks || []).find((x) => x.trackName === a.trackName);
    const from = people.get(a.user);
    if (!t || t.errorCode !== 'not_found_track_error' || !from || from.pub[a.kind] !== a.trackName) continue;
    if (now - (from.ready[a.kind] || now) < LOST_AFTER || now - (from.resent || 0) < 15_000) continue;
    from.resent = now;
    if (DEBUG) console.log(`[voice] lost at Cloudflare: ${a.user.slice(0, 6)}'s ${a.kind}; asked to send it again`);
    onLost(a.user, channelId);
  }
}

// A fresh sending session: the app's sending connection had nothing left on it, and closed, and
// now there's something to send again (or what it sent got lost). Whatever the old one had is
// stopped, without waiting: with its connection just closed, Cloudflare can take seconds to say so.
async function repub(userId, channelId) {
  const p = mine(userId, channelId);
  const { sessionId } = await call('POST', `/sessions/new?correlationId=${encodeURIComponent(`${channelId}-pub`)}`);
  stopSending(p);
  p.pubSession = sessionId;
  return { session: sessionId };
}

// A fresh receiving session (the old one's grown, with slots that can't be used again).
async function resub(userId, channelId) {
  const p = mine(userId, channelId);
  const { sessionId } = await call('POST', `/sessions/new?correlationId=${encodeURIComponent(`${channelId}-sub`)}`);
  p.subSession = sessionId;
  return { sub: sessionId };
}

// The app's answer to Cloudflare's offer.
async function answer(userId, channelId, sdp) {
  const p = mine(userId, channelId);
  await call('PUT', `/sessions/${p.subSession}/renegotiate`, { sessionDescription: { type: 'answer', sdp: sdpOf(sdp) } });
}

// Letting go of others' (they left, or turned their camera off): closed at once, no offer.
async function unpull(userId, channelId, mids) {
  const p = mine(userId, channelId);
  const list = (Array.isArray(mids) ? mids : []).map(String).filter((m) => MID.test(m)).slice(0, 64);
  if (!list.length) return { ok: true };
  await call('PUT', `/sessions/${p.subSession}/tracks/close`, { tracks: list.map((mid) => ({ mid })), force: true });
  return { ok: true };
}

// ---------- The server's side ----------

// Stops what someone's sending, at once (no need for their app to agree): everyone else stops
// getting it.
async function stopSending(p, kinds = KINDS) {
  const mids = kinds.map((k) => p.mids[k]).filter(Boolean);
  for (const k of kinds) {
    delete p.pub[k];
    delete p.mids[k];
    delete p.ready[k];
  }
  if (!mids.length) return;
  try {
    await call('PUT', `/sessions/${p.pubSession}/tracks/close`, { tracks: mids.map((mid) => ({ mid })), force: true });
  } catch {}
}

// Whether a leaving is about this person's current sessions: its own id, or its channel.
// (Leaving one channel for another, the old leaving can arrive after the new sessions started.)
const about = (p, { session, channelId } = {}) => Boolean(p) && (session ? p.pubSession === session : channelId ? p.channelId === channelId : false);

// Someone left the channel (or was taken out).
function left(userId, which) {
  const p = people.get(userId);
  if (!about(p, which)) return;
  clearTimeout(p.forget);
  people.delete(userId);
  stopSending(p);
}

// Their app went away without saying: it may be back (the server updating, a bad connection),
// so what they're sending is kept for ten minutes. (Nobody's sent it meanwhile: they're not in
// the list.)
function leftSoftly(userId, which) {
  const p = people.get(userId);
  if (!about(p, which)) return;
  clearTimeout(p.forget);
  p.forget = setTimeout(() => {
    if (people.get(userId) === p) left(userId, { session: p.pubSession });
  }, 10 * 60_000);
  p.forget.unref?.();
}

// Talking allowed, or not (a timeout, a role change). Not: whatever they're sending stops.
function setSpeak(userId, speak) {
  const p = people.get(userId);
  if (!p) return false;
  p.speak = Boolean(speak);
  if (!speak) stopSending(p);
  return true;
}

// A deleted channel: everyone in it.
function endChannel(channelId) {
  for (const [id, p] of people) if (p.channelId === channelId) left(id, { channelId });
}

// After the server restarted (an update), someone's app says what sessions it has in a channel
// and what it's sending. That's checked with Cloudflare (the sending session's own tracks, by
// name), and only what's really there is kept. Returns whether anything changed.
async function restore(userId, channelId, sessions, pub, tab, speak) {
  const pubSession = String((sessions && sessions.pub) || '');
  const subSession = String((sessions && sessions.sub) || '');
  const had = people.get(userId);
  if (had && had.pubSession === pubSession) {
    clearTimeout(had.forget); // (back, after going away softly)
    return false;
  }
  if (!/^[a-f0-9]{16,64}$/.test(pubSession) || !/^[a-f0-9]{16,64}$/.test(subSession)) return false;
  let state;
  try {
    [state] = await Promise.all([call('GET', `/sessions/${pubSession}`), call('GET', `/sessions/${subSession}`)]);
  } catch {
    return false;
  }
  const p = { channelId, pubSession, subSession, tab: String(tab || ''), speak: Boolean(speak), pub: {}, mids: {}, ready: {} };
  for (const k of KINDS) {
    const name = pub && pub[k];
    const t = name && (state.tracks || []).find((x) => x.location === 'local' && x.trackName === name && x.status === 'active');
    if (t && t.mid) {
      p.pub[k] = name;
      p.mids[k] = String(t.mid);
      p.ready[k] = Date.now();
    }
  }
  if (!p.speak) await stopSending(p);
  const now = people.get(userId);
  if (now && now !== had) return false; // (they started new sessions meanwhile)
  people.set(userId, p);
  return true;
}

module.exports = { enabled, KINDS, VoiceError, pubOf, start, publish, ready, unpublish, pull, repub, resub, answer, unpull, left, leftSoftly, setSpeak, endChannel, restore, whenLost };
