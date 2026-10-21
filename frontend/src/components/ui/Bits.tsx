'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

/** Empty state with faint artwork. */
export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface animate-in flex flex-col items-center px-6 py-10 text-center">
      {icon && (
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 shadow-inner">
          {icon}
        </div>
      )}
      <p className="font-semibold text-slate-800">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonList({ rows = 4, h = 64 }: { rows?: number; h?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: h, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

/** Label/value line used in every detail view. */
export function Field({
  icon,
  label,
  children,
  mono,
  className,
}: {
  icon?: ReactNode;
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <div className={clsx('group flex items-start gap-3 px-3 py-2.5 transition hover:bg-brand-50/60', className)}>
      {icon && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 transition group-hover:scale-110">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <div className={clsx('mt-0.5 break-words text-sm font-medium text-slate-800', mono && 'font-mono tracking-wide')}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Fields({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-soft', className)}>
      {children}
    </div>
  );
}

/** Message banner (success / info / error) that animates in. */
export function Notice({ tone = 'brand', children, onClose }: { tone?: 'brand' | 'error' | 'success' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const t = {
    brand: 'border-brand-200 from-brand-50 to-white text-brand-800',
    error: 'border-rose-200 from-rose-50 to-white text-rose-700',
    success: 'border-emerald-200 from-emerald-50 to-white text-emerald-800',
    warn: 'border-amber-200 from-amber-50 to-white text-amber-800',
  }[tone];
  return (
    <div className={clsx('animate-in mb-3 flex items-start gap-2 rounded-2xl border bg-gradient-to-r px-3.5 py-2.5 text-sm shadow-soft', t)}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="text-current/60 rounded-md px-1 hover:bg-white/70" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
