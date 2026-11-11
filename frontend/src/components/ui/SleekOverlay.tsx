'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Glassmorphism overlay used for PIN onboarding, confirmations, camera capture, and long forms.
 * Default: centred modal. `placement="sheet"` becomes a bottom sheet below the lg breakpoint
 * and a centred (optionally wide) modal at >=1024px. The dialog is capped at 85dvh; the
 * header and footer stay put while the body (or a column inside it) scrolls.
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
  placement = 'modal',
  contentClassName,
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
  size?: 'sm' | 'md' | 'lg' | 'xl';
  placement?: 'modal' | 'sheet';
  contentClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const asSheet = placement === 'sheet';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    const prevOverscroll = body.style.overscrollBehavior;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
      body.style.overscrollBehavior = prevOverscroll;
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
  const width =
    size === 'sm' ? 'max-w-sm' :
    size === 'lg' ? 'max-w-lg' :
    size === 'xl' ? 'lg:w-[min(92vw,1100px)] lg:max-w-[1100px]' :
    'max-w-md';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={clsx(
            'fixed inset-0 z-[100] flex justify-center overflow-hidden',
            asSheet ? 'items-end p-0 lg:items-center lg:p-6' : 'items-center p-4',
          )}
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
            data-overlay-dialog
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: asSheet ? 32 : 24, scale: asSheet ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: asSheet ? 24 : 16, scale: asSheet ? 1 : 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={clsx(
              'relative flex w-full min-h-0 min-w-0 flex-col overflow-hidden overflow-x-hidden border border-white/70 bg-white/95 shadow-[0_30px_80px_-20px_rgb(15_23_42/0.55)] max-h-overlay',
              width,
              asSheet
                ? 'rounded-t-[28px] lg:rounded-[28px]'
                : 'rounded-[28px]',
            )}
          >
            {asSheet && (
              <div className="relative flex h-5 shrink-0 items-center justify-center lg:hidden">
                <span className="h-1.5 w-11 rounded-full bg-slate-300/80" />
              </div>
            )}
            <div className="relative z-10 flex shrink-0 items-start gap-3 bg-white/95 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${toneIcon[tone]} opacity-20`} />
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
                <button type="button" onClick={onClose} className="back-btn !h-9 !w-9 shrink-0" aria-label="Close">
                  <X size={16} />
                </button>
              )}
            </div>
            <div
              data-overlay-scroll
              className={clsx(
                'relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 sm:px-6',
                footer ? 'pb-4' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]',
                contentClassName,
              )}
            >
              {children}
            </div>
            {footer && (
              <div className="relative flex shrink-0 flex-wrap gap-2 border-t border-slate-100 bg-white/90 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Scroll a child into view inside the overlay (or column) scroller — never the page behind it. */
export function scrollIntoOverlay(el: HTMLElement | null) {
  if (!el) return;
  let scroller = el.closest('[data-overlay-scroll]') as HTMLElement | null;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) {
    const parent = scroller.parentElement?.closest('[data-overlay-scroll]') as HTMLElement | null;
    if (!parent) break;
    scroller = parent;
  }
  if (!scroller) return;
  const sRect = scroller.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const top = scroller.scrollTop + (eRect.top - sRect.top) - Math.max(12, (scroller.clientHeight - eRect.height) / 2);
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}
