/* Vicit Llog service worker — asset cache + standard Web Push (VAPID). */
const CACHE = 'vicit-llog-1.0.1-v27';
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

function absolute(path) {
  return new URL(path, self.location.origin).href;
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
    const isRing = data.type === 'RING' && data.callId;
    const max = (self.Notification && self.Notification.maxActions) || 2;
    const actions = isRing
      ? [
          { action: 'answer', title: 'Answer' },
          { action: 'open', title: 'Open app' },
          { action: 'decline', title: 'Decline' },
        ].slice(0, Math.max(2, max))
      : undefined;
    await self.registration.showNotification(data.title || 'Vicit', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || data.callId || data.notificationId || 'vicit',
      renotify: true,
      requireInteraction: data.type === 'RING',
      vibrate: data.type === 'RING' ? [300, 120, 300, 120, 500] : [80],
      ...(actions ? { actions } : {}),
      data: { url: data.url || '/notifications', callId: data.callId || null, type: data.type || '' },
    });
  })());
});

/** Best signed-in app tab: a visible/focused one first, then any tab on this origin. */
function pickClient(all) {
  const mine = all.filter((c) => c.url && c.url.startsWith(self.location.origin));
  return mine.find((c) => c.focused) || mine.find((c) => c.visibilityState === 'visible') || mine[0] || null;
}

self.addEventListener('notificationclick', (event) => {
  const data = (event.notification && event.notification.data) || {};
  const action = event.action || '';
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = pickClient(all);

    if (data.type === 'RING' && data.callId) {
      const id = String(data.callId);
      if (action === 'decline') {
        // Decline without pulling the user away from what they are doing when a tab is open.
        if (client) { client.postMessage({ type: 'RING_DECLINE', callId: id }); return; }
        return self.clients.openWindow(absolute(`/ring?call=${encodeURIComponent(id)}&declineCall=${encodeURIComponent(id)}`));
      }
      if (action === 'answer') {
        // Focus the signed-in tab (whatever page it is on) and answer there.
        if (client) {
          try { await client.focus(); } catch { /* ignore */ }
          client.postMessage({ type: 'RING_ANSWER', callId: id });
          return;
        }
        return self.clients.openWindow(absolute(`/ring?call=${encodeURIComponent(id)}&answerCall=${encodeURIComponent(id)}`));
      }
      if (action === 'open') {
        // Go to the site without answering; the call keeps ringing in the app's call sheet.
        if (client) {
          try { await client.focus(); } catch { /* ignore */ }
          client.postMessage({ type: 'RING_OPEN', callId: id });
          return;
        }
        return self.clients.openWindow(absolute('/'));
      }
      // Plain click: bring the signed-in tab forward on its current page and show the call.
      if (client) {
        try { await client.focus(); } catch { /* ignore */ }
        client.postMessage({ type: 'RING_OPEN', callId: id });
        return;
      }
      return self.clients.openWindow(absolute(`/ring?call=${encodeURIComponent(id)}`));
    }

    const url = targetUrl(data);
    if (client) {
      try { await client.navigate(url); } catch { /* older browsers */ }
      return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
