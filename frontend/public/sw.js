/* Vicit Llog service worker — asset cache + standard Web Push (VAPID). */
const CACHE = 'vicit-llog-1.0.1-v17';
const ASSETS = ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = request.url;
  const dest = request.destination;
  // Never cache HTML/documents or branding so returning visitors never see obsolete chrome.
  if (request.mode === 'navigate' || dest === 'document' || dest === 'empty') return;
  if (
    url.includes('/auth/') ||
    url.includes('/api') ||
    url.includes('api.') ||
    url.includes('/branding') ||
    url.includes('/manifest') ||
    url.includes('/sw.js') ||
    url.includes('/rings/stream') ||
    !url.startsWith(self.location.origin)
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(request);
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
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

function targetUrl(data) {
  const raw = (data && data.url) || '/notifications';
  try {
    const next = new URL(raw, self.location.origin);
    return next.origin === self.location.origin ? next.href : new URL('/notifications', self.location.origin).href;
  } catch {
    return new URL('/notifications', self.location.origin).href;
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'PUSH',
        title: data.title || 'Vicit',
        body: data.body || '',
        url: data.url || '/notifications',
        callId: data.callId || '',
        kind: data.type || '',
      });
    }
    const visible = clients.some((client) => client.visibilityState === 'visible');
    if (visible) return;
    await self.registration.showNotification(data.title || 'Vicit', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || data.callId || data.notificationId || 'vicit',
      renotify: true,
      requireInteraction: data.type === 'RING',
      vibrate: data.type === 'RING' ? [300, 120, 300, 120, 500] : [80],
      data: { url: data.url || '/notifications', callId: data.callId || null, type: data.type || '' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data || {});
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        try { await client.navigate(url); } catch { /* older browsers */ }
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
