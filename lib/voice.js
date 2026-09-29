'use strict';

// Voice channels (and group calls) go through a media server in the middle that everyone in a
// channel connects to, so a call can have more than a few people. Two kinds:
//   - Cloudflare Realtime's SFU (lib/voice-cf.js), when CF_REALTIME_APP_ID and
//     CF_REALTIME_APP_SECRET are set: nothing to run, and charged only for what it sends out
//     (the first 1,000 GB a month free). rainlit.app uses this.
//   - LiveKit (livekit.io), below: open source, so people running their own Rainlit can run it
//     too (docker-compose.yml), or use LiveKit Cloud.
// With both set, it's Cloudflare.
//
// Rainlit gives each person a pass (a signed token) for the one channel they're joining, and
// what they're allowed to do there. The audio and video are end-to-end encrypted with each
// channel's own key, which only Rainlit hands out, so LiveKit can't listen in.
//
// Settings: LIVEKIT_URL (wss://…), LIVEKIT_API_KEY and LIVEKIT_API_SECRET, and optionally
// LIVEKIT_API_URL: where Rainlit itself reaches LiveKit's room controls, if not at
// LIVEKIT_URL (with both in Docker, http://livekit:7880: straight there, not out through the
// public address, which many home routers won't loop back).

const crypto = require('crypto');
const cf = require('./voice-cf');

const URL_ = String(process.env.LIVEKIT_URL || '').trim();
const API_URL = (String(process.env.LIVEKIT_API_URL || '').trim() || URL_.replace(/^ws/, 'http')).replace(/\/+$/, '');
const KEY = String(process.env.LIVEKIT_API_KEY || '').trim();
const SECRET = String(process.env.LIVEKIT_API_SECRET || '').trim();
const livekit = Boolean(URL_ && KEY && SECRET);
const backend = cf.enabled ? 'cloudflare' : livekit ? 'livekit' : null;
const enabled = Boolean(backend);

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function sign(claims, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: KEY, nbf: now - 10, exp: now + ttlSeconds, ...claims })}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

// A pass into one channel's room. Someone who can't speak there can still listen.
function joinToken({ room, user, speak }) {
  return sign({
    sub: user.id,
    name: user.display_name,
    jti: crypto.randomBytes(8).toString('hex'),
    video: {
      room, roomJoin: true, canSubscribe: true, canPublish: speak, canPublishData: false,
      canPublishSources: speak ? ['microphone', 'camera', 'screen_share', 'screen_share_audio'] : [],
    },
  }, 6 * 3600);
}

// LiveKit's room controls (its RoomService). Never throws: a room that's gone is fine.
async function roomService(method, room, body) {
  if (backend !== 'livekit') return;
  try {
    await fetch(`${API_URL}/twirp/livekit.RoomService/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sign({ video: { room, roomAdmin: true, roomCreate: true } }, 60)}` },
      body: JSON.stringify({ room, ...body }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

// Takes someone out of a room at once (they were kicked, banned, or lost access).
const removeParticipant = (room, identity) => (backend === 'cloudflare' ? cf.left(identity, { channelId: room }) : roomService('RemoveParticipant', room, { identity }));

// Lets someone talk, or makes them listen only (a timeout, or a role change).
const setSpeak = (room, identity, speak) => (backend === 'cloudflare' ? cf.setSpeak(identity, speak) : roomService('UpdateParticipant', room, {
  identity,
  permission: {
    can_subscribe: true, can_publish: speak, can_publish_data: false,
    can_publish_sources: speak ? ['MICROPHONE', 'CAMERA', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'] : [],
  },
}));

// A deleted voice channel: everyone in it goes.
const deleteRoom = (room) => (backend === 'cloudflare' ? cf.endChannel(room) : roomService('DeleteRoom', room, {}));

// (Cloudflare only.) Someone left: what they were sending stops. Or their app went away without
// saying (soft): they're kept a while, in case it comes back (an update, a bad connection).
// `which`: the session they left ({ session }), or the channel ({ channelId }).
function left(userId, soft, which) {
  if (backend !== 'cloudflare') return;
  if (soft) cf.leftSoftly(userId, which);
  else cf.left(userId, which);
}

// (Cloudflare only.) What each person's sending, for the list everyone sees.
const pubOf = (userId) => (backend === 'cloudflare' ? cf.pubOf(userId) : undefined);

// A channel's key for its end-to-end encryption.
const newKey = () => crypto.randomBytes(32).toString('base64url');

module.exports = { enabled, backend, cf, url: URL_, apiUrl: API_URL, joinToken, removeParticipant, setSpeak, deleteRoom, left, pubOf, newKey };
