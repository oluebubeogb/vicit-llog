'use client';

import { api, getToken, getUser } from '@/lib/api';

export const PUSH_TOKEN_KEY = 'vicit_push_token';
const PUSH_OWNER_KEY = 'vicit_push_owner';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function swRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

/**
 * Subscribe this browser to standard Web Push (VAPID) and store the subscription.
 * Prompts only while permission is "default". Returns nothing to unsubscribe from
 * a Firebase listener — foreground pushes arrive as service-worker messages.
 */
export async function setupPush(onForeground?: (p: { title: string; body: string; url: string; callId?: string; type?: string }) => void) {
  if (!getToken() || !pushSupported()) return null;
  const cfg = await api.pushConfig().catch(() => null);
  if (!cfg?.enabled || !cfg.publicKey) return null;

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return null;
    }
  }
  if (Notification.permission !== 'granted') return null;

  const reg = await swRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
    });
  }
  const token = JSON.stringify(sub.toJSON());
  const owner = getUser()?.id || '';
  if (localStorage.getItem(PUSH_TOKEN_KEY) !== token || localStorage.getItem(PUSH_OWNER_KEY) !== owner) {
    await api.registerPushToken(token, 'web', navigator.userAgent);
    localStorage.setItem(PUSH_TOKEN_KEY, token);
    localStorage.setItem(PUSH_OWNER_KEY, owner);
  }

  const onMessage = (ev: MessageEvent) => {
    const d = ev.data || {};
    if (d.type !== 'PUSH') return;
    onForeground?.({
      title: d.title || 'Vicit',
      body: d.body || '',
      url: d.url || '/notifications',
      callId: d.callId || '',
      type: d.kind || d.pushType || '',
    });
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
