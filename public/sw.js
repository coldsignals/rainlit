// Keeps the app installable and lets it open instantly. Always tries the
// network first so updates show up right away; falls back to the saved copy.
const CACHE = 'rainlit-v2'; // (v2: without the files v1 kept)
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon.svg', '/icons/mark.svg', '/icons/drop-clean.svg', '/fonts/fonts.css', '/fonts/bricolage-grotesque-latin.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Live data, people's pictures, custom emoji, soundboard sounds and the files in conversations
  // always come straight from the server (and files aren't kept here: a phone would fill up with
  // every photo and video). (They may be sent on to Cloudflare R2, where only the page itself may
  // follow: see lib/blobs.js.)
  if (/^\/(api|avatars|files|homepage-files|homepage-avatar|emoji|sounds)\//.test(url.pathname) || url.pathname === '/ws') return;
  e.respondWith(networkFirst(e.request));
});

// The network first, so updates show up right away, and the saved copy when it can't help:
// - the network's down;
// - the server's restarting (an update): the saved copy starts Rainlit, which then waits for
//   the server instead of showing an error page;
// - opening Rainlit, the network's too slow to answer (a weak signal, or a restart that
//   holds on to requests). A late answer still updates the saved copy for next time.
const SLOW_MS = 5000;
function networkFirst(request) {
  const network = fetch(request).then((res) => {
    if (res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  });
  network.catch(() => {}); // (answered from the saved copy, a late failure is nobody's business)
  const saved = () => caches.match(request).then((r) => r || (request.mode === 'navigate' ? caches.match('/') : undefined));
  const slow = request.mode === 'navigate' ? new Promise((resolve) => setTimeout(resolve, SLOW_MS, null)) : new Promise(() => {});
  return Promise.race([network, slow])
    .then(async (res) => {
      if (!res) return (await saved()) || network; // too slow: the saved copy (or keep waiting, without one)
      if (res.status >= 500) return (await caches.match(request)) || res;
      return res;
    })
    .catch(async () => (await saved()) || Response.error());
}
