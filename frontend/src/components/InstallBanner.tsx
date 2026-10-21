'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share, PlusSquare, ChevronRight } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Props = {
  /** Visual style: login (on dark gradient) or profile (on light page) */
  variant?: 'login' | 'profile';
  className?: string;
};

export default function InstallBanner({ variant = 'profile', className = '' }: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    // iPhone / iPad / iPod — including iPadOS that reports as Mac
    const ios =
      (/iphone|ipad|ipod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
      !(window as any).MSStream;
    setIsIos(ios);

    const key = 'vicit-install-dismissed';
    if (sessionStorage.getItem(key) === '1') setDismissed(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Lock body scroll while iOS sheet is open
  useEffect(() => {
    if (!showIosSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showIosSheet]);

  if (isStandalone || dismissed) return null;

  const canInstall = !!deferred;
  const showBanner = canInstall || isIos;
  if (!showBanner) return null;

  async function handleInstall() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setDeferred(null);
      return;
    }
    if (isIos) setShowIosSheet(true);
  }

  function dismiss() {
    setDismissed(true);
    setShowIosSheet(false);
    try {
      sessionStorage.setItem('vicit-install-dismissed', '1');
    } catch {
      /* ignore */
    }
  }

  const isLogin = variant === 'login';

  return (
    <>
      <div className={`w-full ${className}`}>
        <div
          className={
            isLogin
              ? 'relative flex w-full items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white backdrop-blur-sm'
              : 'relative flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3.5 text-slate-800 shadow-sm'
          }
        >
          <div
            className={
              isLogin
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20'
                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700'
            }
          >
            <Download size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${isLogin ? 'text-white' : 'text-slate-900'}`}>
              Install Vicit Llog
            </p>
            <p className={`text-xs ${isLogin ? 'text-brand-100' : 'text-slate-500'}`}>
              {isIos && !canInstall
                ? 'Add to Home Screen for quick access'
                : 'Install the app on your device'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleInstall}
            className={
              isLogin
                ? 'shrink-0 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-brand-800 transition hover:bg-brand-50'
                : 'shrink-0 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700'
            }
          >
            Install
          </button>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className={
              isLogin
                ? 'absolute -right-1 -top-1 rounded-full bg-black/30 p-1 text-white/80 hover:bg-black/50'
                : 'absolute -right-1.5 -top-1.5 rounded-full border border-slate-200 bg-white p-1 text-slate-400 shadow-sm hover:text-slate-600'
            }
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* iOS guided install sheet — closest feel to native install prompt */}
      {showIosSheet && isIos && (
        <div
          className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/50 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIosSheet(false);
          }}
        >
          <div
            className="mx-auto w-full max-w-lg rounded-t-3xl bg-white shadow-2xl"
            style={{ animation: 'slideUp 0.28s ease-out' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            <div className="px-5 pb-2 pt-2">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 p-1.5 ring-1 ring-brand-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon-192.png" alt="" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <h2 id="ios-install-title" className="text-base font-bold text-slate-900">
                      Install Vicit Llog
                    </h2>
                    <p className="text-xs text-slate-500">Add to your Home Screen</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIosSheet(false)}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mb-4 text-sm text-slate-600">
                Safari does not allow one-tap install. Follow these steps — takes about 10 seconds:
              </p>

              <ol className="space-y-3">
                <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    1
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-slate-900">Tap Share</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      The{' '}
                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-medium text-brand-700 shadow-sm ring-1 ring-slate-200">
                        <Share size={12} /> Share
                      </span>{' '}
                      icon at the bottom of Safari
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    2
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-slate-900">Add to Home Screen</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      Scroll and tap{' '}
                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-medium text-brand-700 shadow-sm ring-1 ring-slate-200">
                        <PlusSquare size={12} /> Add to Home Screen
                      </span>
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    3
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-slate-900">Confirm</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Tap <strong>Add</strong> in the top right — Vicit appears on your Home Screen
                    </p>
                  </div>
                </li>
              </ol>

              <div className="mt-5 flex items-center gap-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={() => setShowIosSheet(false)}
                  className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white"
                >
                  Got it
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
