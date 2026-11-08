/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { initials } from '@/lib/format';

const GRADS = [
  'from-brand-400 to-brand-700',
  'from-accent-400 to-accent-700',
  'from-emerald-400 to-emerald-700',
  'from-amber-400 to-amber-600',
  'from-violet-400 to-violet-700',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Avatar({
  name,
  src,
  size = 40,
  ring = true,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const g = GRADS[hash(name || '?') % GRADS.length];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-semibold text-white',
        g,
        ring && 'ring-2 ring-white shadow-[0_4px_12px_-4px_rgb(15_23_42/0.35)]',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {src && !failed ? (
        <img src={src} alt={name || ''} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="drop-shadow-sm">{initials(name)}</span>
      )}
    </span>
  );
}
