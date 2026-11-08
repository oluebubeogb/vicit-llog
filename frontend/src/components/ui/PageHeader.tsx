'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import Tooltip, { InfoTip } from './Tooltip';

/** Consistent premium page header: back button, gradient icon tile, title, info tooltip, actions. */
export default function PageHeader({
  title,
  icon,
  back,
  info,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  icon?: ReactNode;
  back?: string;
  info?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="animate-in mb-5 flex items-center gap-3">
      {back && (
        <Tooltip content="Back">
          <Link href={back} className="back-btn" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
        </Tooltip>
      )}
      {icon && (
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-700 text-white shadow-glow">
          <span className="absolute inset-0 rounded-2xl bg-gradient-to-t from-transparent to-white/25" />
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="flex items-center gap-1.5 truncate text-xl font-bold tracking-tight text-slate-900">
          <span className="truncate">{title}</span>
          {info && <InfoTip text={info} />}
        </h1>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
