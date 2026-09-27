'use strict';

// Voice channels go through LiveKit (livekit.io): a media server in the middle that everyone
// in a channel connects to, so a call can have more than a few people. It's open source, so
// people running their own Rainlit can run it too, or use LiveKit Cloud.
//
// Rainlit gives each person a pass (a signed token) for the one channel they're joining, and
// what they're allowed to do there. The audio and video are end-to-end encrypted with each
// channel's own key, which only Rainlit hands out, so LiveKit can't listen in.
//
// Settings: LIVEKIT_URL (wss://…), LIVEKIT_API_KEY and LIVEKIT_API_SECRET.

const crypto = require('crypto');

const URL_ = String(process.env.LIVEKIT_URL || '').trim();
const KEY = String(process.env.LIVEKIT_API_KEY || '').trim();
const SECRET = String(process.env.LIVEKIT_API_SECRET || '').trim();
const enabled = Boolean(URL_ && KEY && SECRET);

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
  if (!enabled) return;
  const http = URL_.replace(/^ws/, 'http').replace(/\/$/, '');
  try {
    await fetch(`${http}/twirp/livekit.RoomService/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sign({ video: { room, roomAdmin: true, roomCreate: true } }, 60)}` },
      body: JSON.stringify({ room, ...body }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

// Takes someone out of a room at once (they were kicked, banned, or lost access).
const removeParticipant = (room, identity) => roomService('RemoveParticipant', room, { identity });

// Lets someone talk, or makes them listen only (a timeout, or a role change).
const setSpeak = (room, identity, speak) => roomService('UpdateParticipant', room, {
  identity,
  permission: {
    can_subscribe: true, can_publish: speak, can_publish_data: false,
    can_publish_sources: speak ? ['MICROPHONE', 'CAMERA', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'] : [],
  },
});

// A deleted voice channel: everyone in it goes.
const deleteRoom = (room) => roomService('DeleteRoom', room, {});

// A channel's key for its end-to-end encryption.
const newKey = () => crypto.randomBytes(32).toString('base64url');

module.exports = { enabled, url: URL_, joinToken, removeParticipant, setSpeak, deleteRoom, newKey };
