// Keeps the app installable and lets it open instantly. Always tries the
// network first so updates show up right away; falls back to the saved copy.
const CACHE = 'rainlit-v1';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon.svg', '/icons/mark.svg', '/icons/drop-clean.svg'];

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
  // Live data and people's pictures always come straight from the server.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/avatars/') || url.pathname === '/ws') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }
        // The server is restarting (an update): the saved copy starts Rainlit, which then
        // waits for the server instead of showing an error page.
        if (res.status >= 500) return caches.match(e.request).then((r) => r || res);
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
