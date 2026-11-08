'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Animated bottom sheet (mobile) / centred dialog (desktop) with a rich open AND close:
 * backdrop blur fade, spring slide + scale, staggered content, drag-to-dismiss handle.
 * Content is retained during the exit animation even if the caller clears its state.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  tone = 'brand',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'violet';
}) {
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const retained = useRef<{ title?: ReactNode; subtitle?: ReactNode; icon?: ReactNode; children?: ReactNode; footer?: ReactNode }>({});
  if (open) retained.current = { title, subtitle, icon, children, footer };
  const c = open ? { title, subtitle, icon, children, footer } : retained.current;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const toneBg: Record<string, string> = {
    brand: 'from-brand-100/80 via-white to-accent-50/60',
    emerald: 'from-emerald-100/80 via-white to-emerald-50/40',
    amber: 'from-amber-100/80 via-white to-amber-50/40',
    rose: 'from-rose-100/80 via-white to-rose-50/40',
    violet: 'from-violet-100/80 via-white to-violet-50/40',
  };
  const toneIcon: Record<string, string> = {
    brand: 'from-brand-500 to-accent-600 shadow-glow',
    emerald: 'from-emerald-500 to-emerald-700 shadow-[0_10px_24px_-10px_rgb(5_150_105/0.7)]',
    amber: 'from-amber-400 to-amber-600 shadow-[0_10px_24px_-10px_rgb(217_119_6/0.7)]',
    rose: 'from-rose-500 to-red-600 shadow-[0_10px_24px_-10px_rgb(225_29_72/0.7)]',
    violet: 'from-violet-500 to-violet-700 shadow-[0_10px_24px_-10px_rgb(124_58_237/0.7)]',
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-root"
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
          initial="closed"
          animate="open"
          exit="closed"
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[6px]"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            transition={{ duration: 0.28 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            drag={reduce ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose();
            }}
            variants={{
              open: { y: 0, opacity: 1, scale: 1 },
              closed: { y: reduce ? 0 : '18%', opacity: 0, scale: reduce ? 1 : 0.97 },
            }}
            transition={{ type: 'spring', damping: 30, stiffness: 320, mass: 0.9 }}
            className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/70 bg-white shadow-[0_-20px_60px_-20px_rgb(15_23_42/0.45)] sm:rounded-[28px] ${
              size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
            }`}
          >
            {/* header artwork */}
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b ${toneBg[tone]}`} />
            <div className="art-dots !-z-0 h-36 opacity-[0.07]" />
            <div
              onPointerDown={(e) => drag.start(e)}
              className="relative flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing sm:hidden"
            >
              <span className="h-1.5 w-11 rounded-full bg-slate-300/80" />
            </div>
            {(c.title || c.icon) && (
              <motion.div
                onPointerDown={(e) => drag.start(e)}
                className="relative flex touch-none items-start gap-3 px-5 pb-3 pt-1 sm:pt-5"
                variants={{ open: { opacity: 1, y: 0 }, closed: { opacity: 0, y: -6 } }}
                transition={{ delay: 0.06, duration: 0.3 }}
              >
                {c.icon && (
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${toneIcon[tone]}`}>
                    {c.icon}
                  </div>
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  {c.title && <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">{c.title}</h2>}
                  {c.subtitle && <div className="mt-0.5 text-sm text-slate-500">{c.subtitle}</div>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="icon-btn h-9 w-9 shrink-0 rounded-full"
                >
                  <X size={18} />
                </button>
              </motion.div>
            )}
            <motion.div
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              variants={{ open: { opacity: 1, y: 0 }, closed: { opacity: 0, y: 10 } }}
              transition={{ delay: 0.1, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {c.children}
            </motion.div>
            {c.footer && (
              <div className="relative border-t border-slate-100 bg-gradient-to-b from-white to-slate-50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {c.footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
