'use strict';

// ICE (STUN/TURN) configuration: how two browsers find a path to each other,
// through a relay if a direct path isn't possible.

const DEFAULT_STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
let iceCache = { servers: null, expires: 0 };

async function getIceServers() {
  const now = Date.now();
  if (iceCache.servers && iceCache.expires > now) return iceCache.servers;

  let servers = DEFAULT_STUN;
  let hasTurn = false;

  const cfKeyId = process.env.CF_TURN_KEY_ID;
  const cfToken = process.env.CF_TURN_API_TOKEN;

  if (cfKeyId && cfToken) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfKeyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 86_400 }),
        }
      );
      if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`);
      const data = await res.json();
      // Port 53 is blocked by browsers and only causes timeouts, so drop it.
      servers = (data.iceServers || [])
        .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }))
        .filter((s) => s.urls.length);
      hasTurn = true;
      // Credentials last 24h; refresh well before that.
      iceCache = { servers: { list: servers, hasTurn }, expires: now + 6 * 3600_000 };
      return iceCache.servers;
    } catch (err) {
      console.error('[ice] Could not get Cloudflare TURN credentials:', err.message);
    }
  } else if (process.env.TURN_URLS) {
    servers = [
      ...DEFAULT_STUN,
      {
        urls: process.env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_CREDENTIAL || '',
      },
    ];
    hasTurn = true;
  }

  iceCache = { servers: { list: servers, hasTurn }, expires: now + 10 * 60_000 };
  return iceCache.servers;
}

module.exports = { getIceServers };
