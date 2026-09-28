'use strict';

// Fetching things from other sites for people (link previews, and their pictures and videos).
// Only from the public internet: never from this server itself or the network it sits on, so
// a link can't be used to reach things that aren't meant to be reachable from outside.

const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const zlib = require('zlib');
const { pipeline } = require('stream');

const USER_AGENT = 'Mozilla/5.0 (compatible; RainlitBot/1.0; +https://github.com/coldsignals/rainlit)';

// This machine, private networks, and addresses that aren't really out on the internet.
const PRIVATE = new net.BlockList();
for (const [range, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) PRIVATE.addSubnet(range, bits, 'ipv4');
for (const [range, bits] of [
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) PRIVATE.addSubnet(range, bits, 'ipv6');

// (An IPv4 address written the IPv6 way, like ::ffff:127.0.0.1, is checked as the IPv4 one.)
function privateAddress(ip) {
  const type = net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null;
  return !type || PRIVATE.check(ip, type);
}

class FetchError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

// Finds a site's address, refusing a private one. It runs as the connection is made, so a
// name can't give one answer when it's checked and another when it's connected to.
function publicLookup(hostname, options, callback) {
  const opts = options && typeof options === 'object' ? options : { family: options || 0 };
  dns.lookup(hostname, { family: opts.family || 0, hints: opts.hints, all: true }, (err, list) => {
    if (err) return callback(err);
    if (!list.length || list.some((a) => privateAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} isn't on the public internet.`), { code: 'EPRIVATE' }));
    }
    if (opts.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

function checkTarget(u) {
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new FetchError("That isn't a web link.");
  if (u.port && u.port !== '80' && u.port !== '443') throw new FetchError("That isn't on a usual web port.");
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const inside = net.isIP(host) ? privateAddress(host) : !host.includes('.') || /\.(localhost|local|internal|lan|home|arpa)$/.test(host);
  if (inside) throw new FetchError("That isn't on the public internet.");
}

/**
 * Opens a link, following any redirects (each one checked again), and resolves with the
 * response once its headers are in. The caller reads the body, or passes it on. `signal`
 * can end it all after a while; without one, only a site that goes quiet for 10 seconds is
 * given up on (a long video can take its time).
 */
function open(url, { headers = {}, signal, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
      checkTarget(u);
    } catch (err) {
      return reject(err instanceof FetchError ? err : new FetchError("That isn't a link."));
    }
    const req = (u.protocol === 'https:' ? https : http).get(u, {
      headers: { 'User-Agent': USER_AGENT, ...headers },
      lookup: publicLookup,
      signal,
      timeout: 10_000,
      maxHeaderSize: 64 * 1024, // (some sites send a lot of cookies)
    }, (res) => {
      const to = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && to) {
        res.resume();
        if (redirects <= 0) return reject(new FetchError('Too many redirects.'));
        let next;
        try {
          next = new URL(to, u).href;
        } catch {
          return reject(new FetchError('The site sent a broken redirect.'));
        }
        return open(next, { headers, signal, redirects: redirects - 1 }).then(resolve, reject);
      }
      res.finalUrl = u.href;
      resolve(res);
    });
    req.on('timeout', () => req.destroy(new FetchError('The site took too long to answer.')));
    req.on('error', (err) => reject(err instanceof FetchError ? err : new FetchError(err.code === 'EPRIVATE' ? err.message : "Couldn't reach the site.")));
  });
}

/**
 * Reads a response as text, unzipped and in the right character set: up to `max` bytes, or
 * with `head`, only as far as the end of an HTML page's <head> (where previews are described).
 */
async function readText(res, { max = 1_000_000, head = false } = {}) {
  const enc = String(res.headers['content-encoding'] || '').trim().toLowerCase();
  const unzip = enc === 'gzip' || enc === 'x-gzip' ? zlib.createGunzip()
    : enc === 'deflate' ? zlib.createInflate()
    : enc === 'br' ? zlib.createBrotliDecompress()
    : null;
  const body = unzip ? pipeline(res, unzip, () => {}) : res;
  const chunks = [];
  let size = 0;
  let tail = '';
  try {
    for await (const chunk of body) {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= max) break;
      if (head) {
        const seen = tail + chunk.toString('latin1');
        if (/<\/head\s*>|<body[\s>]/i.test(seen)) break;
        tail = seen.slice(-12);
      }
    }
  } finally {
    res.destroy();
  }
  const buf = Buffer.concat(chunks).subarray(0, max);
  let charset = /charset=["']?([\w-]+)/i.exec(String(res.headers['content-type'] || ''))?.[1];
  if (!charset) charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

// A site's API: its answer, as JSON.
async function getJson(url, { timeout = 8000, max = 2_000_000 } = {}) {
  const res = await open(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
  if (res.statusCode !== 200) {
    res.destroy();
    throw new FetchError(`The site answered ${res.statusCode}.`, res.statusCode);
  }
  return JSON.parse(await readText(res, { max }));
}

module.exports = { USER_AGENT, FetchError, privateAddress, open, readText, getJson };
