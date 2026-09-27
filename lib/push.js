// Push notifications, for when someone's Rainlit app is fully closed: "Alex is calling",
// "New message from Alex". They use Web Push (the same standard browsers use), which is
// what UnifiedPush apps like ntfy speak, so phones without Google services can get them.
//
// Each note is encrypted for the one phone it's going to. The push service in between
// (ntfy.sh, for example) can't read it, and it never contains the message itself.

'use strict';

const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const webpush = require('web-push');
const { db, DATA_DIR } = require('./db');

const MAX_PER_USER = 10;

// The server's own key pair (VAPID), made once and kept with the data. Phones register
// with its public half, and push services only accept notes signed with the private half.
const KEYS_FILE = path.join(DATA_DIR, 'vapid.json');
let keys;
try {
  keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
} catch {
  keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys), { mode: 0o600 });
}
// (Who push services can contact about these: this server's address. Render sets
// RENDER_EXTERNAL_URL by itself; elsewhere, set PUBLIC_URL. It has to be an https:// one: a
// server on an http:// address, like one being tried out at home, names Rainlit's instead of
// failing to start.)
const contact = [process.env.PUBLIC_URL, process.env.RENDER_EXTERNAL_URL].find((u) => /^https:\/\//i.test(String(u || '').trim()));
webpush.setVapidDetails(contact ? contact.trim() : 'https://rainlit.app', keys.publicKey, keys.privateKey);

const publicKey = () => keys.publicKey;

// Push addresses come from the phone, so make sure one can't point the server at itself
// or at something on a private network.
async function safeEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || endpoint.length > 1000) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  let addresses;
  try {
    addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return false;
  }
  return addresses.length > 0 && addresses.every((a) => !privateAddress(a));
}

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return privateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

const B64URL = /^[A-Za-z0-9_-]+=*$/;

async function subscribe(userId, sub) {
  const endpoint = String((sub && sub.endpoint) || '');
  const p256dh = String((sub && sub.keys && sub.keys.p256dh) || '');
  const auth = String((sub && sub.keys && sub.keys.auth) || '');
  if (!B64URL.test(p256dh) || p256dh.length > 200 || !B64URL.test(auth) || auth.length > 100) return false;
  if (!(await safeEndpoint(endpoint))) return false;
  db.prepare(`
    INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(endpoint, userId, p256dh, auth, Date.now());
  // Keep the newest few per person (old phones, reinstalls).
  db.prepare(`
    DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN (
      SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    )
  `).run(userId, userId, MAX_PER_USER);
  return true;
}

function unsubscribe(userId, endpoint) {
  db.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || ''));
}

/**
 * Sends a note to every phone the person has registered. `topic` lets a newer note
 * replace an older one still waiting (for example, the latest ring for a friend).
 */
function send(userId, note, { topic, urgency = 'high', ttl = 60 } = {}) {
  const subs = db.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').all(userId);
  for (const s of subs) {
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(note),
      { TTL: ttl, urgency, topic: topic ? topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : undefined, timeout: 10_000 },
    ).catch((err) => {
      // Gone: the app was uninstalled or unregistered. Forget the address.
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint);
      } else {
        console.warn(`[push] couldn't reach a phone for ${userId}: ${err.statusCode || err.code || err.message}`);
      }
    });
  }
}

module.exports = { publicKey, subscribe, unsubscribe, send };
