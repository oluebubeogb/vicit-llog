'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { getToken } from '@/lib/api';
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
      setupPush((p) => {
        window.dispatchEvent(new Event('vicit:notification'));
        if (p.callId || (p.url || '').includes('/ring')) return;
        setToast(p);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(null), 6000);
      })
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
