'use strict';

// Where Rainlit keeps files: what people send, the chat's smaller copies of photos, profile and
// homepage pictures and songs, and spaces' custom emoji.
//
// Without R2_* settings they stay on this server's disk, as they always have. With them, each
// one goes to a Cloudflare R2 bucket as soon as it's written (its copy here is deleted), and is
// served from there: the server still checks who may see it, then sends the browser on to a
// link that works for about a day. Sending from R2 is free; sending from here is paid by the
// gigabyte. Files from before R2 was set up move over in the background.
//
// Settings: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (from an R2 API
// token with Object Read & Write on that bucket). R2_ENDPOINT overrides the address (tests).

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { db, DATA_DIR, AVATAR_DIR } = require('./db');

const ACCOUNT = String(process.env.R2_ACCOUNT_ID || '').trim();
const KEY_ID = String(process.env.R2_ACCESS_KEY_ID || '').trim();
const SECRET = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
const BUCKET = String(process.env.R2_BUCKET || '').trim();
const ENDPOINT = String(process.env.R2_ENDPOINT || (ACCOUNT ? `https://${ACCOUNT}.r2.cloudflarestorage.com` : '')).trim().replace(/\/+$/, '');
const enabled = Boolean(ENDPOINT && KEY_ID && SECRET && BUCKET);
const REGION = 'auto';
const LINK_HOURS = 25; // (signed on the hour, so a link works for at least a day, and stays the same for an hour)

// Each kind of file, and its folder here.
const DIRS = {
  files: path.join(DATA_DIR, 'files'),
  previews: path.join(DATA_DIR, 'previews'),
  avatars: AVATAR_DIR,
  homepages: path.join(DATA_DIR, 'homepages'),
  emoji: path.join(DATA_DIR, 'emoji'),
};
for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });
const CACHE_DIR = path.join(DATA_DIR, 'r2-cache'); // (copies fetched back to work from: see localCopy)
if (enabled) fs.mkdirSync(CACHE_DIR, { recursive: true });

const localPath = (kind, name) => path.join(DIRS[kind], name);
const keyOf = (kind, name) => `${kind}/${name}`;
const inR2 = (kind, name) => enabled && Boolean(db.prepare('SELECT 1 FROM blobs WHERE key = ?').get(keyOf(kind, name)));

// ---------- Signing (AWS Signature Version 4, which R2 speaks) ----------

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
// Everything but letters, digits and -_.~ is escaped (and in a path, not the slashes).
const escape = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const escapePath = (p) => p.split('/').map(escape).join('/');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20260929T140000Z

function signingKey(secret, day, region) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
}

// A link to GET an object without signing in, good for `expires` seconds from `at`. extra: more
// query parameters to sign in (R2 honours response-content-type, -disposition and -cache-control).
function presign({ host, pathname, keyId, secret, region, at, expires, extra = {} }) {
  const time = stamp(at);
  const day = time.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${keyId}/${scope}`,
    'X-Amz-Date': time,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
    ...extra,
  };
  const query = Object.keys(params).sort().map((k) => `${escape(k)}=${escape(params[k])}`).join('&');
  const request = ['GET', escapePath(pathname), query, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', time, scope, sha256(request)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(secret, day, region)).update(toSign).digest('hex');
  return `${query}&X-Amz-Signature=${signature}`;
}

// The headers that sign a request (PUT, DELETE, GET) to R2 itself. (payload: the body's hash, or
// that it isn't signed, which R2 allows.)
function signedHeaders({ method, host, pathname, keyId, secret, region, at, headers = {}, payload = 'UNSIGNED-PAYLOAD' }) {
  const time = stamp(at);
  const day = time.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host, 'x-amz-content-sha256': payload, 'x-amz-date': time };
  const names = Object.keys(all).sort();
  const request = [method, escapePath(pathname), '', ...names.map((n) => `${n}:${all[n]}`), '', names.join(';'), payload].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', time, scope, sha256(request)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(secret, day, region)).update(toSign).digest('hex');
  delete all.host;
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

// ---------- Talking to R2 ----------

const endpoint = enabled ? new URL(ENDPOINT) : null;
const objectPath = (key) => `/${BUCKET}/${key}`;

function r2(method, key, { headers = {}, body = null } = {}) {
  const pathname = objectPath(key);
  const signed = signedHeaders({ method, host: endpoint.host, pathname, keyId: KEY_ID, secret: SECRET, region: REGION, at: new Date(), headers });
  const lib = endpoint.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request({ method, host: endpoint.hostname, port: endpoint.port || undefined, path: escapePath(pathname), headers: signed, timeout: 60_000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('R2 took too long')));
    req.on('error', reject);
    if (body && typeof body.pipe === 'function') body.pipe(req);
    else req.end(body || undefined);
  });
}

// A link for the browser: the object, as `type`, shown or saved as `disposition`, cached for
// `cache`. Signed at the top of the hour, so the same link comes back for an hour (the browser
// keeps its copy) and still works a day later (a long video, paused).
function linkFor(key, { type, disposition, cache }) {
  const at = new Date();
  at.setUTCMinutes(0, 0, 0);
  const extra = {};
  if (type) extra['response-content-type'] = type;
  if (disposition) extra['response-content-disposition'] = disposition;
  if (cache) extra['response-cache-control'] = cache;
  const query = presign({ host: endpoint.host, pathname: objectPath(key), keyId: KEY_ID, secret: SECRET, region: REGION, at, expires: LINK_HOURS * 3600, extra });
  return `${ENDPOINT}${escapePath(objectPath(key))}?${query}`;
}

// ---------- What the rest of Rainlit uses ----------

// Sends a file (the caller's already checked who may see it): from the disk if it's here,
// otherwise on to R2. opts: { type, disposition, cache, headers }.
function send(res, kind, name, opts = {}) {
  const { type, disposition, cache = 'private, max-age=31536000, immutable', headers = {} } = opts;
  if (typeof name !== 'string' || !name || path.basename(name) !== name) return res.sendStatus(404); // (a name, never a path)
  const here = localPath(kind, name);
  if (fs.existsSync(here)) {
    res.set({ ...headers, 'Cache-Control': cache, ...(type ? { 'Content-Type': type } : {}), ...(disposition ? { 'Content-Disposition': disposition } : {}) });
    return res.sendFile(name, { root: DIRS[kind] }, (err) => {
      if (err && !res.headersSent) res.sendStatus(404);
    });
  }
  if (!inR2(kind, name)) return res.sendStatus(404);
  // (Where it went is remembered for most of the hour its link stays the same.)
  res.set('Cache-Control', /public/.test(cache) ? 'public, max-age=3000' : 'private, max-age=3000');
  res.redirect(302, linkFor(keyOf(kind, name), { type, disposition, cache }));
}

// A file that's just been written here goes to R2 (with R2 set up), and its copy here is
// deleted. If that fails, it stays here, for the background mover to try again.
async function offload(kind, name, type = 'application/octet-stream') {
  if (!enabled) return false;
  const here = localPath(kind, name);
  let size;
  try {
    size = fs.statSync(here).size;
  } catch {
    return false;
  }
  try {
    const r = await r2('PUT', keyOf(kind, name), { headers: { 'content-type': type, 'content-length': size }, body: fs.createReadStream(here) });
    if (r.status !== 200) throw new Error(`R2 said ${r.status}: ${r.body.toString().slice(0, 200)}`);
    db.prepare('INSERT OR REPLACE INTO blobs (key, bytes, stored_at) VALUES (?, ?, ?)').run(keyOf(kind, name), size, Date.now());
    // (Still wanted? It may have been deleted while it was on its way.)
    if (!fs.existsSync(here)) return true;
    fs.rmSync(here, { force: true });
    return true;
  } catch (err) {
    console.warn(`[r2] Couldn't move ${keyOf(kind, name)} to R2 (it stays here for now): ${err.message}`);
    return false;
  }
}

// Deletes a file, wherever it is.
async function remove(kind, name) {
  if (!name) return;
  fs.rm(localPath(kind, name), { force: true }, () => {});
  if (!inR2(kind, name)) return;
  db.prepare('DELETE FROM blobs WHERE key = ?').run(keyOf(kind, name));
  try {
    const r = await r2('DELETE', keyOf(kind, name));
    if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw new Error(`R2 said ${r.status}`);
  } catch (err) {
    // (It'll be tidied up with the other leftovers: see sweep.)
    db.prepare('INSERT OR IGNORE INTO blobs_gone (key, since) VALUES (?, ?)').run(keyOf(kind, name), Date.now());
    console.warn(`[r2] Couldn't delete ${keyOf(kind, name)} yet: ${err.message}`);
  }
}

// Whether a file's kept (here or in R2).
const exists = (kind, name) => fs.existsSync(localPath(kind, name)) || inR2(kind, name);

// A copy on this disk to work from (to make a photo's smaller copy, say): the file itself if
// it's here, otherwise fetched back from R2 into a cache that's emptied now and then. Resolves
// its path, or null.
async function localCopy(kind, name) {
  const here = localPath(kind, name);
  if (fs.existsSync(here)) return here;
  if (!inR2(kind, name)) return null;
  const cached = path.join(CACHE_DIR, `${kind}-${name}`);
  if (fs.existsSync(cached)) return cached;
  const r = await r2('GET', keyOf(kind, name));
  if (r.status !== 200) return null;
  fs.writeFileSync(`${cached}.part`, r.body);
  fs.renameSync(`${cached}.part`, cached);
  return cached;
}

// ---------- Moving older files over, and tidying up ----------

let moving = null;
const progress = { moved: 0, failed: 0, left: 0, running: false };

// Files still on this disk (not half-written ones, and not the markers for photos without a
// smaller copy) go to R2, a few at a time.
function waiting() {
  const out = [];
  for (const kind of Object.keys(DIRS)) {
    for (const name of fs.readdirSync(DIRS[kind])) {
      if (/\.(part|same)$/.test(name)) continue;
      try {
        if (fs.statSync(localPath(kind, name)).isFile()) out.push([kind, name]);
      } catch {}
    }
  }
  return out;
}

function moveOld() {
  if (!enabled || moving) return moving;
  moving = (async () => {
    const list = waiting();
    Object.assign(progress, { left: list.length, running: true });
    if (list.length) console.log(`[r2] Moving ${list.length} files from before to R2...`);
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const [kind, name] = list[i++];
        const ok = await offload(kind, name, TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream');
        ok ? progress.moved++ : progress.failed++;
        progress.left--;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (list.length) console.log(`[r2] Moved ${progress.moved} files to R2${progress.failed ? `; ${progress.failed} will be tried again later` : ''}.`);
    progress.running = false;
    moving = null;
  })();
  return moving;
}

// (What R2 stores each as, going by its name. Files people send are named by their id alone:
// their own type is set when they're served.)
const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.weba': 'audio/webm',
};

// Deletes that didn't reach R2 at the time, tried again; and the cache of fetched copies emptied.
async function sweep() {
  if (!enabled) return;
  for (const { key } of db.prepare('SELECT key FROM blobs_gone').all()) {
    try {
      const r = await r2('DELETE', key);
      if (r.status === 204 || r.status === 200 || r.status === 404) db.prepare('DELETE FROM blobs_gone WHERE key = ?').run(key);
    } catch {}
  }
  const old = Date.now() - 3600_000;
  for (const name of fs.readdirSync(CACHE_DIR)) {
    try {
      if (fs.statSync(path.join(CACHE_DIR, name)).mtimeMs < old) fs.rmSync(path.join(CACHE_DIR, name), { force: true });
    } catch {}
  }
}

if (enabled) {
  setTimeout(() => { moveOld(); sweep(); }, 30_000).unref();
  setInterval(() => { moveOld(); sweep(); }, 6 * 3600_000).unref();
}

// For the Admin panel: how many are in R2, and how many are still waiting to move.
function status() {
  if (!enabled) return { enabled: false };
  const { n, bytes } = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(bytes), 0) bytes FROM blobs').get();
  return { enabled: true, inR2: n, bytes, moving: progress.running, left: progress.running ? progress.left : waiting().length };
}

// The page's own address list needs R2's, for pictures and videos to load from it.
const origin = enabled ? endpoint.origin : '';

module.exports = { enabled, origin, DIRS, localPath, send, offload, remove, exists, localCopy, moveOld, sweep, status, presign, signedHeaders };
