'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { playChime } from '@/lib/ringtone';
import { firstTimeSeen, notificationSoundOn } from '@/lib/notifySound';
import { setupPush } from '@/lib/push';

type Toast = { title: string; body: string; url: string };

/**
 * Registers the device for Firebase push once a user is signed in (no-op when the
 * frontend has no Firebase env). Foreground pushes appear as a subtle top banner and
 * nudge the Alerts badge to refresh.
 */
export default function PushRegister() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const unsub = useRef<null | (() => void)>(null);
  const started = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  /** One path for live (SSE) and foreground push alerts: refresh the badge, toast, double-tune chime. */
  const show = (p: { title: string; body: string; url?: string; callId?: string; type?: string; notificationId?: string }) => {
    if (!firstTimeSeen(p.notificationId)) return;
    window.dispatchEvent(new Event('vicit:notification'));
    if (p.callId || p.type === 'RING' || (p.url || '').includes('/ring')) return; // calls keep their ringtone
    setToast({ title: p.title, body: p.body, url: p.url || '/notifications' });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
    if (notificationSoundOn()) playChime();
  };

  // v31: live notifications over Server-Sent Events while the app is open (push is the backup).
  const [jwtKey, setJwtKey] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setJwtKey(getToken());
    sync();
    window.addEventListener('vicit-auth-updated', sync);
    return () => window.removeEventListener('vicit-auth-updated', sync);
  }, []);
  useEffect(() => {
    if (!jwtKey || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let backoff = 2000;
    const open = () => {
      if (stopped) return;
      es = new EventSource(api.notificationStreamUrl());
      es.onmessage = (ev) => {
        backoff = 2000;
        let d: any = null;
        try { d = JSON.parse(ev.data); } catch { return; }
        if (d?.type !== 'notification') return;
        show({ title: d.title || 'Vicit', body: d.body || '', url: d.url || '/notifications', callId: d.callId || '', type: d.kind || '', notificationId: d.id });
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        retry = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwtKey]);

  useEffect(() => {
    const jwt = getToken();
    if (!jwt) {
      started.current = null;
      unsub.current?.();
      unsub.current = null;
      return;
    }
    if (started.current === jwt) return;
    started.current = jwt;
    // Let the page settle before the (one-time) browser permission prompt.
    const t = setTimeout(() => {
      setupPush((p: any) => show(p))
        .then((u) => {
          unsub.current?.();
          unsub.current = u || null;
        })
        .catch((e) => {
          started.current = null;
          console.warn('[push] setup failed', e);
        });
    }, 1500);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => () => unsub.current?.(), []);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] mx-auto w-[calc(100%-1.5rem)] max-w-md"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-3 shadow-lg backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setToast(null);
                router.push(toast.url.startsWith('/') ? toast.url : '/notifications');
              }}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-700 text-on-brand on-brand-fill">
                <Bell className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{toast.title}</span>
                {toast.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{toast.body}</span>}
              </span>
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
