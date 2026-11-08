'use client';

import {
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';

type Side = 'top' | 'bottom';

/**
 * Sleek, accessible tooltip.
 * - Desktop: hover / keyboard focus (with short open delay)
 * - Touch: tap toggles; long-press (400ms) also opens; tap outside closes
 * - aria-describedby wires the tip to its trigger
 */
export default function Tooltip({
  content,
  children,
  side = 'top',
  delay = 120,
  className = '',
}: {
  content: ReactNode;
  children: ReactElement;
  side?: Side;
  delay?: number;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; side: Side } | null>(null);
  const timer = useRef<number | null>(null);
  const press = useRef<number | null>(null);
  const touched = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s: Side = side === 'top' && r.top < 72 ? 'bottom' : side;
    setPos({ x: r.left + r.width / 2, y: s === 'top' ? r.top - 8 : r.bottom + 8, side: s });
  }, [side]);

  const show = useCallback(
    (now = false) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => {
          place();
          setOpen(true);
        },
        now ? 0 : delay,
      );
    },
    [delay, place],
  );
  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const onDown = (e: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) hide();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place, hide]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (press.current) window.clearTimeout(press.current);
  }, []);

  if (!isValidElement(children) || !content) return children;

  const child = children as ReactElement<any>;
  const trigger = cloneElement(child, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
      const r = (child as any).ref;
      if (typeof r === 'function') r(node);
      else if (r && typeof r === 'object') r.current = node;
    },
    'aria-describedby': open ? id : undefined,
    onPointerEnter: (e: React.PointerEvent) => {
      child.props.onPointerEnter?.(e);
      if (e.pointerType === 'mouse') show();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      child.props.onPointerLeave?.(e);
      if (e.pointerType === 'mouse') hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      child.props.onPointerDown?.(e);
      if (e.pointerType !== 'mouse') {
        touched.current = true;
        press.current = window.setTimeout(() => show(true), 400);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      child.props.onPointerUp?.(e);
      if (press.current) window.clearTimeout(press.current);
    },
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e);
      // Info icons often sit inside clickable cards/buttons: never let them trigger the parent
      if (child.props['data-infotip']) {
        e.stopPropagation();
        e.preventDefault();
      }
      // Pure info triggers (no own click handler) toggle on tap
      if (touched.current && !child.props.onClick && !child.props.href) {
        open ? hide() : show(true);
      }
      touched.current = false;
    },
    onFocus: (e: React.FocusEvent) => {
      child.props.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      child.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                id={id}
                role="tooltip"
                initial={{ opacity: 0, y: pos.side === 'top' ? 6 : -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.side === 'top' ? 4 : -4, scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                style={{
                  position: 'fixed',
                  left: Math.min(Math.max(pos.x, 132), (typeof window !== 'undefined' ? window.innerWidth : 400) - 132),
                  top: pos.y,
                  translateX: '-50%',
                  translateY: pos.side === 'top' ? '-100%' : '0%',
                  zIndex: 200,
                }}
                className={`pointer-events-none max-w-[250px] rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-center text-xs font-medium leading-snug text-white shadow-[0_12px_32px_-8px_rgb(15_23_42/0.5)] backdrop-blur-md ${className}`}
              >
                <span className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-brand-500/25 via-transparent to-accent-500/25" />
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/** Small (i) affordance carrying explanatory copy as a tooltip. */
export function InfoTip({ text, size = 14, className = '' }: { text: ReactNode; size?: number; className?: string }) {
  return (
    <Tooltip content={text}>
      {/* A span (not a button) so it can sit inside buttons/links without invalid nesting */}
      <span
        role="button"
        tabIndex={0}
        data-infotip="1"
        aria-label="More info"
        className={`inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-slate-400 outline-none transition hover:bg-brand-50 hover:text-brand-600 focus-visible:text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-200 ${className}`}
      >
        <Info size={size} />
      </span>
    </Tooltip>
  );
}
