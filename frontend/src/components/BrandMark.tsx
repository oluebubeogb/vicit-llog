/* eslint-disable @next/next/no-img-element */
'use client';

import clsx from 'clsx';
import { logoSrc } from '@/lib/brand';
import { useBrand } from './BrandProvider';

/** Organisation logo in a glassy tile — used in nav, login, splash, visitor pages. */
export default function BrandMark({ size = 40, className, glow = true }: { size?: number; className?: string; glow?: boolean }) {
  const { brand } = useBrand();
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-white',
        glow && 'shadow-[0_8px_24px_-8px_rgb(var(--brand-700)/0.55)] ring-1 ring-white/70',
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.3, padding: size * 0.1 }}
    >
      <img src={logoSrc(brand.logoUrl)} alt={brand.name} className="h-full w-full object-contain" />
    </span>
  );
}
