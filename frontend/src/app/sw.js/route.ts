import { readFirebaseEnv } from '@/lib/firebaseEnv';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Keep in sync with the `firebase` version in package.json.
const FIREBASE_JS_VERSION = '10.14.1';
const CACHE = 'vicit-llog-v5';

/**
 * Runtime service worker: PWA asset cache + (when Firebase env is set) FCM background push.
 * Served dynamically so Firebase config comes from the container env at request time.
 */
export async function GET() {
  const fb = readFirebaseEnv();
  const firebaseConfig = fb.configured
    ? {
        apiKey: fb.apiKey,
        authDomain: fb.authDomain,
        projectId: fb.projectId,
        storageBucket: fb.storageBucket || undefined,
        messagingSenderId: fb.messagingSenderId,
        appId: fb.appId,
      }
    : null;

  const js = `/* Vicit Llog service worker (${fb.configured ? 'cache + push' : 'cache only'}) */
const CACHE = ${JSON.stringify(CACHE)};
const ASSETS = ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];
const FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig)};

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
  // Never intercept API / SW / cross-origin / non-http
  if (
    url.includes('/auth/') ||
    url.includes('/api') ||
    url.includes('api.') ||
    url.endsWith('/sw.js') ||
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

// Notification click: open (or focus) the target page. Registered before the Firebase SDK
// so it handles both SDK-displayed and our own notifications consistently.
function targetUrl(n) {
  const d = (n && n.data) || {};
  const fcm = d.FCM_MSG || {};
  const raw = d.url || (fcm.data && fcm.data.url) || (fcm.fcmOptions && fcm.fcmOptions.link) || '/notifications';
  try {
    const u = new URL(raw, self.location.origin);
    return u.origin === self.location.origin ? u.href : new URL('/notifications', self.location.origin).href;
  } catch {
    return new URL('/notifications', self.location.origin).href;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const url = targetUrl(event.notification);
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          try { await c.navigate(url); } catch {}
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

if (FIREBASE_CONFIG) {
  try {
    importScripts(
      'https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-messaging-compat.js',
    );
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      // Messages with a "notification" block are displayed by the Firebase SDK itself;
      // only data-only messages need to be shown here (avoids duplicate notifications).
      if (payload && payload.notification) return;
      const d = (payload && payload.data) || {};
      const title = d.title || 'Vicit Llog';
      return self.registration.showNotification(title, {
        body: d.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: d.notificationId || undefined,
        data: { url: d.url || '/notifications', notificationId: d.notificationId || null },
      });
    });
  } catch (err) {
    console.warn('[sw] Firebase messaging unavailable', err);
  }
}
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
