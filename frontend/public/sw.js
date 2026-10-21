const CACHE = 'vicit-llog-v3';
const ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = request.url;
  // Never intercept API / cross-origin / non-http
  if (
    url.includes('/auth/') ||
    url.includes('/api') ||
    url.includes('api.') ||
    !url.startsWith(self.location.origin)
  ) {
    return;
  }

  e.respondWith(
    (async () => {
      try {
        const cached = await caches.match(request);
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        } catch {
          if (cached) return cached;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
