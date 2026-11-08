'use client';

import { api, getToken, getUser } from '@/lib/api';

export const PUSH_TOKEN_KEY = 'vicit_push_token';
const PUSH_OWNER_KEY = 'vicit_push_owner';

export type FirebaseClientConfig = {
  configured: boolean;
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

let cfgPromise: Promise<FirebaseClientConfig | null> | null = null;

export function loadFirebaseConfig() {
  if (!cfgPromise) {
    cfgPromise = fetch('/api/firebase-config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => (c && c.configured ? (c as FirebaseClientConfig) : null))
      .catch(() => null);
  }
  return cfgPromise;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

async function swRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

/**
 * Register this browser for FCM push and send the token to the API.
 * Prompts only when permission is still "default"; never nags after a denial.
 * Returns an unsubscribe for foreground messages, or null.
 */
export async function setupPush(onForeground?: (p: { title: string; body: string; url: string }) => void) {
  if (!getToken() || !pushSupported()) return null;
  const cfg = await loadFirebaseConfig();
  if (!cfg) return null;

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return null;
    }
  }
  if (Notification.permission !== 'granted') return null;

  const [{ initializeApp, getApps }, messagingMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  if (!(await messagingMod.isSupported().catch(() => false))) return null;

  const app =
    getApps().find((a) => a.name === 'vicit') ||
    initializeApp(
      {
        apiKey: cfg.apiKey,
        authDomain: cfg.authDomain,
        projectId: cfg.projectId,
        storageBucket: cfg.storageBucket || undefined,
        messagingSenderId: cfg.messagingSenderId,
        appId: cfg.appId,
      },
      'vicit',
    );
  const messaging = messagingMod.getMessaging(app);
  const reg = await swRegistration();
  const token = await messagingMod.getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
  if (!token) return null;

  const owner = getUser()?.id || '';
  if (localStorage.getItem(PUSH_TOKEN_KEY) !== token || localStorage.getItem(PUSH_OWNER_KEY) !== owner) {
    await api.registerPushToken(token, 'web', navigator.userAgent);
    localStorage.setItem(PUSH_TOKEN_KEY, token);
    localStorage.setItem(PUSH_OWNER_KEY, owner);
  }

  return messagingMod.onMessage(messaging, (payload) => {
    const d: Record<string, string> = (payload.data as any) || {};
    onForeground?.({
      title: payload.notification?.title || d.title || 'New alert',
      body: payload.notification?.body || d.body || '',
      url: d.url || '/notifications',
    });
  });
}
