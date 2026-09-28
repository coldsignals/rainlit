'use strict';

// Link previews ("embeds"), like Discord's. A link to an X post shows the post: who posted it,
// what they said, its pictures or video, and how many replies and likes it has. A YouTube or
// TikTok link shows the video's picture, title and who made it. Anything else shows its page's
// title, description and picture, from the tags sites put in their pages for exactly this
// (Open Graph: the same ones Discord, iMessage and the rest read).
//
// This server fetches the link, not the people in the conversation, and the pictures and
// videos come through this server too, so a site never learns who's looking. (Messages aren't
// end-to-end encrypted, so the server seeing a link isn't anything new.) A self-hosted server
// can turn previews off with LINK_PREVIEWS=off.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline, Transform } = require('stream');
const { DATA_DIR } = require('./db');
const outbound = require('./outbound');

const enabled = !/^(off|false|no|0)$/i.test(String(process.env.LINK_PREVIEWS || '').trim());

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const CACHE_MAX = 2000;
const IMAGE_MAX = 15 * 1024 * 1024; // (a bigger picture isn't passed along)
const PICTURE_TYPES = /^image\/(png|jpeg|gif|webp|avif)$/;
const VIDEO_TYPES = /^video\/(mp4|webm)$/;
const cache = new Map(); // link -> { until, embed }
const pending = new Map(); // link -> its lookup, while it's under way

// ----- Pictures and videos come through this server -----
// ...but only ones a preview named: their addresses carry a signature only this server can make.

const KEY_FILE = path.join(DATA_DIR, 'embed-key');
let key;
try {
  key = fs.readFileSync(KEY_FILE);
  if (key.length < 32) throw new Error('too short');
} catch {
  key = crypto.randomBytes(32);
  try { fs.writeFileSync(KEY_FILE, key, { mode: 0o600 }); } catch {}
}

const signature = (url) => crypto.createHmac('sha256', key).update(url).digest('base64url').slice(0, 32);

function proxied(url) {
  return url ? `/api/embeds/media?u=${encodeURIComponent(url)}&s=${signature(url)}` : null;
}

function signed(url, sig) {
  const want = Buffer.from(signature(url));
  const got = Buffer.from(String(sig || ''));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ----- Text -----

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', times: '×', deg: '°', euro: '€', pound: '£', yen: '¥', cent: '¢',
};

// Undoes HTML's escapes (&amp;, &#39;, &#x2022; and the usual named ones). Twice at most, as
// some sites escape their tags twice.
function unescapeHtml(s) {
  let out = String(s || '');
  for (let pass = 0; pass < 2 && /&(#\d+|#x[\da-f]+|[a-z]+);/i.test(out); pass++) {
    out = out.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
      }
      const name = Object.hasOwn(NAMED, e) ? e : e.toLowerCase();
      return Object.hasOwn(NAMED, name) ? NAMED[name] : all;
    });
  }
  return out;
}

// At most n characters (with an ellipsis if there were more).
function clip(s, n) {
  const chars = Array.from(String(s || '').trim());
  return chars.length > n ? `${chars.slice(0, n - 1).join('').trimEnd()}…` : chars.join('');
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const count = (n) => (Number.isFinite(n) ? n : null);

function absolute(u, base) {
  if (!u) return null;
  try {
    const x = new URL(u, base);
    return /^https?:$/.test(x.protocol) ? x.href : null;
  } catch {
    return null;
  }
}

// A link as it's looked up and remembered: a web one, without its #part.
function linkOf(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  u.hash = '';
  return u.href.length <= 2000 ? u.href : null;
}

// ----- X (Twitter) -----
// From X's own embed data (what its "embed this post" widget shows), or failing that from
// FxTwitter (the service Discord servers use to fix X links), which has some posts X's doesn't.

const X_HOSTS = /^(?:(?:www|mobile)\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com$/i;
const X_COLOR = '#1d9bf0';

function xPostId(u) {
  if (!X_HOSTS.test(u.hostname)) return null;
  const m = /^\/(?:[A-Za-z0-9_]{1,15}|i(?:\/web)?)\/status(?:es)?\/(\d{1,20})(?:\/|$)/.exec(u.pathname);
  return m ? m[1] : null;
}

// (The token X's own embed code sends along with a post's number, worked out from the number.)
const xToken = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');

// One of X's pictures at a size: "900x900" (at most 900 across) in the chat, "large" to see it big.
const twimg = (url, size) => (/^https:\/\/pbs\.twimg\.com\/media\//.test(url || '') ? `${url.split('?')[0]}?name=${size}` : url);

// The video to play: phone-sized (720p or so), not the 4K original.
function pickVideo(list) {
  const mp4 = list.filter((v) => v && v.url && /mp4/.test(v.content_type || v.container || ''));
  if (!mp4.length) return null;
  const side = (v) => {
    const m = /\/(\d{2,5})x(\d{2,5})\//.exec(v.url);
    return m ? Math.max(Number(m[1]), Number(m[2])) : null;
  };
  const fits = mp4.filter((v) => (side(v) ? side(v) <= 1280 : (v.bitrate || 0) <= 2_500_000));
  if (fits.length) return fits.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0].url;
  return mp4.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0].url;
}

const xPicture = (url, w, h) => ({ kind: 'image', src: proxied(twimg(url, '900x900')), full: proxied(twimg(url, 'large')), w: w || null, h: h || null });

const xAuthor = (name, handle, avatar) => ({
  name: clip(name, 80),
  handle: `@${handle}`,
  url: `https://x.com/${handle}`,
  icon: proxied(String(avatar || '').replace(/_normal(\.\w+)$/, '_bigger$1')),
});

// A post's words as they read on X: without the @names a reply starts with or the links to its
// own pictures, and with its links whole again (X shortens them to t.co ones).
function xText(t, quoted = null) {
  let text = String(t.text || '');
  const range = t.display_text_range;
  if (Array.isArray(range) && range[0] > 0) text = Array.from(text).slice(range[0]).join('');
  const ents = t.entities || {};
  for (const m of ents.media || []) if (m.url) text = text.split(m.url).join('');
  for (const u of ents.urls || []) {
    if (!u.url) continue;
    const full = u.expanded_url || u.url;
    const toQuote = quoted && full.includes(`/status/${quoted.id_str}`); // (the quoted post shows below)
    text = text.split(u.url).join(toQuote ? '' : full);
  }
  return clip(unescapeHtml(text).trim(), 1000);
}

function xEmbed(t) {
  const media = [];
  for (const m of (t.mediaDetails || []).slice(0, 4)) {
    const w = m.original_info && m.original_info.width;
    const h = m.original_info && m.original_info.height;
    const video = m.type !== 'photo' && pickVideo((m.video_info && m.video_info.variants) || []);
    media.push(video
      ? { kind: m.type === 'animated_gif' ? 'gif' : 'video', src: proxied(video), poster: proxied(m.media_url_https), w: w || null, h: h || null, ms: (m.video_info && m.video_info.duration_millis) || null }
      : xPicture(m.media_url_https, w, h));
  }
  const q = t.quoted_tweet && t.quoted_tweet.user ? t.quoted_tweet : null;
  return {
    url: `https://x.com/${t.user.screen_name}/status/${t.id_str}`,
    site: 'X',
    color: X_COLOR,
    author: xAuthor(t.user.name, t.user.screen_name, t.user.profile_image_url_https),
    replyTo: t.in_reply_to_screen_name ? `@${t.in_reply_to_screen_name}` : null,
    text: xText(t, q) || null,
    media,
    quote: q ? {
      author: xAuthor(q.user.name, q.user.screen_name, q.user.profile_image_url_https),
      text: clip(xText(q), 400) || null,
      url: `https://x.com/${q.user.screen_name}/status/${q.id_str}`,
    } : null,
    at: t.created_at || null,
    stats: { replies: count(t.conversation_count), likes: count(t.favorite_count) },
    sensitive: Boolean(t.possibly_sensitive),
  };
}

function fxEmbed(t) {
  const media = [];
  for (const m of ((t.media && t.media.all) || []).slice(0, 4)) {
    const video = m.type !== 'photo'
      && (pickVideo((m.formats || []).map((f) => ({ url: f.url, bitrate: f.bitrate, container: f.container })))
        || (/\.mp4(\?|$)/.test(m.url || '') ? m.url : null));
    media.push(video
      ? { kind: m.type === 'gif' ? 'gif' : 'video', src: proxied(video), poster: proxied(m.thumbnail_url), w: m.width || null, h: m.height || null, ms: m.duration ? Math.round(m.duration * 1000) : null }
      : xPicture(m.type === 'photo' ? m.url : m.thumbnail_url, m.width, m.height));
  }
  const q = t.quote && t.quote.author ? t.quote : null;
  return {
    url: `https://x.com/${t.author.screen_name}/status/${t.id}`,
    site: 'X',
    color: X_COLOR,
    author: xAuthor(t.author.name, t.author.screen_name, t.author.avatar_url),
    replyTo: t.replying_to ? `@${t.replying_to}` : null,
    text: clip(t.text, 1000) || null,
    media,
    quote: q ? {
      author: xAuthor(q.author.name, q.author.screen_name, q.author.avatar_url),
      text: clip(q.text, 400) || null,
      url: `https://x.com/${q.author.screen_name}/status/${q.id}`,
    } : null,
    at: t.created_timestamp ? new Date(t.created_timestamp * 1000).toISOString() : null,
    stats: { replies: count(t.replies), reposts: count(t.retweets), likes: count(t.likes) },
    sensitive: Boolean(t.possibly_sensitive),
  };
}

async function fromX(id) {
  try {
    const t = await outbound.getJson(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${xToken(id)}`);
    if (t && t.__typename === 'Tweet' && t.user && t.id_str) return xEmbed(t);
  } catch {}
  try {
    const j = await outbound.getJson(`https://api.fxtwitter.com/status/${id}`);
    if (j && j.tweet && j.tweet.author) return fxEmbed(j.tweet);
  } catch {}
  return null;
}

// ----- YouTube and TikTok, from their own embed data (oEmbed) -----

const YOUTUBE_HOSTS = /^(?:(?:www|m|music)\.)?youtube\.com$|^youtu\.be$/i;
const TIKTOK_HOSTS = /^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/i;

function youTubeVideo(u) {
  if (!YOUTUBE_HOSTS.test(u.hostname)) return null;
  let id = null;
  let tall = false;
  if (/^youtu\.be$/i.test(u.hostname)) id = u.pathname.split('/')[1];
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else {
    const m = /^\/(shorts|live|embed)\/([\w-]+)/.exec(u.pathname);
    if (m) {
      id = m[2];
      tall = m[1] === 'shorts';
    }
  }
  return /^[\w-]{6,20}$/.test(id || '') ? { id, tall } : null;
}

async function fromYouTube(link, video) {
  const o = await outbound.getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`);
  if (!o || !o.title) return null;
  return {
    url: link,
    site: 'YouTube',
    color: '#ff0033',
    author: o.author_name ? { name: clip(o.author_name, 80), url: absolute(o.author_url) } : null,
    title: clip(oneLine(o.title), 256),
    // (Its picture has black bars, above and below, or at the sides of a Short. Filling a
    // box the video's own shape cuts them off.)
    media: [{ kind: 'image', src: proxied(`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`), w: video.tall ? 9 : 16, h: video.tall ? 16 : 9, fill: true, play: true }],
  };
}

const tikTokVideo = (u) => TIKTOK_HOSTS.test(u.hostname) && (/\/video\/\d+/.test(u.pathname) || /^v[mt]\./i.test(u.hostname) || u.pathname.startsWith('/t/'));

async function fromTikTok(link) {
  const o = await outbound.getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`);
  if (!o || (!o.title && !o.author_name)) return null;
  return {
    url: link,
    site: 'TikTok',
    color: '#fe2c55',
    author: o.author_name ? {
      name: clip(o.author_name, 80),
      handle: o.author_unique_id ? `@${o.author_unique_id}` : null,
      url: absolute(o.author_url),
    } : null,
    text: clip(o.title, 500) || null,
    media: o.thumbnail_url ? [{ kind: 'image', src: proxied(o.thumbnail_url), w: Number(o.thumbnail_width) || 9, h: Number(o.thumbnail_height) || 16, fill: true, play: true }] : [],
  };
}

// ----- Any other page, from its Open Graph tags -----

function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([^\s=<>/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const k = m[1].toLowerCase();
    if (!Object.hasOwn(out, k)) out[k] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

function pageEmbed(html, base, link) {
  const meta = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(tag);
    const k = String(a.property || a.name || a.itemprop || '').toLowerCase();
    if (k && a.content && !meta.has(k)) meta.set(k, unescapeHtml(a.content).trim());
  }
  const get = (...keys) => keys.map((k) => meta.get(k)).find(Boolean) || '';
  const title = oneLine(get('og:title', 'twitter:title'));
  const text = oneLine(get('og:description', 'twitter:description', 'description'));
  const picture = absolute(get('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), base);
  if (!title && !text && !picture) return null; // (a page with just a <title> doesn't get one)
  const titleTag = oneLine(unescapeHtml((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1]));
  const w = Number(get('og:image:width')) || null;
  const h = Number(get('og:image:height')) || null;
  // A big picture under the words, or a small one beside them (sites say which they want).
  const card = get('twitter:card');
  const big = card === 'summary_large_image' || (!card && w >= 600);
  const color = get('theme-color');
  return {
    url: link,
    site: clip(oneLine(get('og:site_name', 'application-name')) || new URL(base).hostname.replace(/^www\./, ''), 80),
    color: /^#([\da-f]{3}|[\da-f]{6})$/i.test(color) ? color : null,
    title: clip(title || titleTag, 256) || null,
    text: clip(text, 350) || null,
    media: picture && big ? [{ kind: 'image', src: proxied(picture), full: proxied(picture), w, h }] : [],
    thumb: picture && !big ? { src: proxied(picture), full: proxied(picture) } : null,
  };
}

async function fromPage(link) {
  const res = await outbound.open(link, {
    headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(8000),
  });
  const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (res.statusCode !== 200) {
    res.destroy();
    return null;
  }
  // A link straight to a picture or a video: that's what shows.
  if (PICTURE_TYPES.test(type) || VIDEO_TYPES.test(type)) {
    res.destroy();
    const src = proxied(res.finalUrl);
    return { url: link, bare: true, media: [PICTURE_TYPES.test(type) ? { kind: 'image', src, full: src } : { kind: 'video', src }] };
  }
  if (type !== 'text/html' && type !== 'application/xhtml+xml') {
    res.destroy();
    return null;
  }
  return pageEmbed(await outbound.readText(res, { max: 1_500_000, head: true }), res.finalUrl, link);
}

// ----- Looking one up -----

async function lookUp(link) {
  const u = new URL(link);
  const post = xPostId(u);
  if (post) return fromX(post);
  const video = youTubeVideo(u);
  if (video) return (await fromYouTube(link, video).catch(() => null)) || fromPage(link);
  if (tikTokVideo(u)) return fromTikTok(link);
  return fromPage(link);
}

// Whether a link's preview is already known (or being found), so asking costs nothing.
const known = (link) => pending.has(link) || (cache.has(link) && cache.get(link).until > Date.now());

// A link's preview (null: it hasn't got one). Each is remembered for a while: an X post for half
// an hour (its likes move), a page for a few hours, and a link without one for a little while.
function embedFor(link) {
  const hit = cache.get(link);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.embed);
  if (!pending.has(link)) {
    pending.set(link, lookUp(link).catch(() => null).then((embed) => {
      pending.delete(link);
      cache.delete(link);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // (the one kept longest)
      cache.set(link, { until: Date.now() + (!embed ? 20 * MINUTE : embed.site === 'X' ? 30 * MINUTE : 6 * HOUR), embed });
      return embed;
    }));
  }
  return pending.get(link);
}

// A preview's picture or video, passed along from its site. (Asking for part of one works too,
// so a video can be skipped through.)
async function proxy(req, res) {
  const url = String(req.query.u || '');
  if (!enabled || !signed(url, req.query.s)) return res.status(404).end();
  const headers = { Accept: 'image/avif,image/webp,image/*,video/*;q=0.9,*/*;q=0.5' };
  if (typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range)) headers.Range = req.headers.range;
  let up;
  try {
    up = await outbound.open(url, { headers });
  } catch {
    return res.status(502).end();
  }
  const type = String(up.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const picture = PICTURE_TYPES.test(type);
  if (![200, 206].includes(up.statusCode) || !(picture || VIDEO_TYPES.test(type))
    || (picture && Number(up.headers['content-length']) > IMAGE_MAX)) {
    up.destroy();
    return res.status(up.statusCode === 404 || up.statusCode === 410 ? 404 : 502).end();
  }
  res.status(up.statusCode).set({
    'Content-Type': type,
    'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'content-encoding', 'last-modified', 'etag']) {
    if (up.headers[h]) res.set(h, up.headers[h]);
  }
  let seen = 0;
  const limit = new Transform({
    transform(chunk, _enc, done) {
      seen += chunk.length;
      done(picture && seen > IMAGE_MAX ? new Error('too big') : null, chunk);
    },
  });
  pipeline(up, limit, res, () => {});
}

module.exports = { enabled, linkOf, known, embedFor, proxy };
