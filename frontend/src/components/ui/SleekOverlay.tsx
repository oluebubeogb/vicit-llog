'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Centred glassmorphism overlay used for PIN onboarding, confirmations, and camera capture.
 * Same visual language as Sheet, but always modal-centred (not a bottom sheet).
 */
export default function SleekOverlay({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  tone = 'brand',
  dismissible = true,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'violet';
  dismissible?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dismissible]);

  if (!mounted) return null;

  const toneIcon: Record<string, string> = {
    brand: 'from-brand-500 to-accent-600',
    emerald: 'from-emerald-500 to-emerald-700',
    amber: 'from-amber-400 to-amber-600',
    rose: 'from-rose-500 to-red-600',
    violet: 'from-violet-500 to-violet-700',
  };
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-lg' : 'max-w-md';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={() => dismissible && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={`relative w-full ${width} overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-[0_30px_80px_-20px_rgb(15_23_42/0.55)]`}
          >
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br ${toneIcon[tone]} opacity-20`} />
            <div className="relative p-5 sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                {icon && (
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${toneIcon[tone]} ${tone === 'brand' ? 'text-on-brand on-brand-fill' : 'text-white shadow-lg'}`}>
                    {icon}
                  </span>
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  {title && <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>}
                  {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
                </div>
                {dismissible && (
                  <button type="button" onClick={onClose} className="back-btn !h-9 !w-9" aria-label="Close">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="space-y-3">{children}</div>
              {footer && <div className="mt-5 flex flex-wrap gap-2">{footer}</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
