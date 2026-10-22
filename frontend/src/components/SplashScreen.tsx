'use client';

import LineArt from './ui/LineArt';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BrandMark from './BrandMark';
import { useBrand } from './BrandProvider';

/**
 * Branded launch screen. Shown on cold start of the installed PWA and on the first page
 * load of a browser session; fades away as soon as the app is ready (min ~700ms).
 */
export default function SplashScreen() {
  const { brand, ready } = useBrand();
  const [show, setShow] = useState(false);
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('nosplash')) return;
      // Staff profile links opened on a signed-out device must reveal nothing (not even the brand)
      if (window.location.pathname.startsWith('/u/') && !localStorage.getItem('vicit_token')) return;
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      const seen = sessionStorage.getItem('vicit-splash') === '1';
      if (standalone || !seen) {
        setShow(true);
        sessionStorage.setItem('vicit-splash', '1');
        const t = setTimeout(() => setMinDone(true), 750);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (show && minDone && ready) {
      const t = setTimeout(() => setShow(false), 120);
      return () => clearTimeout(t);
    }
    if (show && minDone) {
      const t = setTimeout(() => setShow(false), 1600); // never block longer than this
      return () => clearTimeout(t);
    }
  }, [show, minDone, ready]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden text-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            backgroundImage:
              'radial-gradient(120% 80% at 100% 0%, rgb(var(--accent-400) / 0.6), transparent 55%), radial-gradient(90% 60% at 0% 100%, rgb(var(--brand-300) / 0.35), transparent 60%), linear-gradient(160deg, rgb(var(--brand-600)), rgb(var(--brand-900)) 70%, rgb(var(--accent-950)))',
          }}
        >
          <LineArt className="text-white" opacity={0.08} />
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 160 }}
            className="relative"
          >
            <span className="absolute inset-0 animate-ping rounded-[30px] bg-white/25" style={{ animationDuration: '2.2s' }} />
            <BrandMark size={96} className="relative" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.5 }}
            className="mt-6 text-2xl font-bold tracking-tight"
          >
            {brand.name}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.75 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-1 text-xs uppercase tracking-[0.3em]"
          >
            Visitor Access
          </motion.p>
          <div className="mt-10 h-1 w-28 overflow-hidden rounded-full bg-white/20">
            <motion.div
              className="h-full w-1/2 rounded-full bg-white/90"
              initial={{ x: '-100%' }}
              animate={{ x: '220%' }}
              transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
