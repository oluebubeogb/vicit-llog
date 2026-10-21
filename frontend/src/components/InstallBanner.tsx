'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share, PlusSquare, ChevronRight } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useBrand } from '@/components/BrandProvider';

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
  const { brand } = useBrand();
  const appName = brand.name || 'Vicit Llog';

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
  const steps = [
    { t: 'Tap Share', d: <>The <span className="chip !text-brand-700"><Share size={12} /> Share</span> icon at the bottom of Safari</> },
    { t: 'Add to Home Screen', d: <>Scroll and tap <span className="chip !text-brand-700"><PlusSquare size={12} /> Add to Home Screen</span></> },
    { t: 'Confirm', d: <>Tap <strong>Add</strong> in the top right — {appName} appears on your Home Screen</> },
  ];

  return (
    <>
      <div className={`w-full ${className}`}>
        <div
          className={
            isLogin
              ? 'group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white backdrop-blur-md transition hover:bg-white/15'
              : 'card card-art group relative flex w-full items-center gap-3 !overflow-visible px-4 py-3.5 text-slate-800'
          }
        >
          <div
            className={
              isLogin
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/25 transition group-hover:scale-110'
                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 transition group-hover:scale-110'
            }
          >
            <Download size={20} className="transition group-hover:translate-y-0.5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${isLogin ? 'text-white' : 'text-slate-900'}`}>Install {appName}</p>
            <p className={`text-xs ${isLogin ? 'text-white/70' : 'text-slate-500'}`}>
              {isIos && !canInstall ? 'Add to Home Screen for quick access' : 'One tap, works offline'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleInstall}
            className={isLogin ? 'btn shrink-0 bg-white !px-3.5 !py-2 text-brand-800 shadow-lg hover:bg-brand-50' : 'btn-primary shrink-0 !px-3.5 !py-2'}
          >
            Install
          </button>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className={
              isLogin
                ? 'absolute right-1 top-1 rounded-full p-1 text-white/60 transition hover:bg-black/20 hover:text-white'
                : 'absolute -right-1.5 -top-1.5 rounded-full border border-slate-200 bg-white p-1 text-slate-400 shadow-sm transition hover:text-slate-600'
            }
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <Sheet
        open={showIosSheet && isIos}
        onClose={() => setShowIosSheet(false)}
        icon={<Download size={20} />}
        title={`Install ${appName}`}
        subtitle="Add to your Home Screen"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={dismiss} className="btn-ghost flex-1">
              Not now
            </button>
            <button type="button" onClick={() => setShowIosSheet(false)} className="btn-primary flex-[1.4]">
              Got it <ChevronRight size={16} />
            </button>
          </div>
        }
      >
        <p className="mb-4 text-sm text-slate-600">Safari does not allow one-tap install. It takes about 10 seconds:</p>
        <ol className="stagger space-y-2.5">
          {steps.map((st, i) => (
            <li key={i} className="tile flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-700 text-sm font-bold text-white shadow-glow">{i + 1}</span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-semibold text-slate-900">{st.t}</p>
                <p className="mt-0.5 text-xs leading-6 text-slate-500">{st.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
