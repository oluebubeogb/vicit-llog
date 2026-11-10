/* eslint-disable @next/next/no-img-element */
'use client';

import clsx from 'clsx';
import { logoSrc } from '@/lib/brand';
import { useBrand } from './BrandProvider';

/** Organisation logo in a glassy tile — used in nav, splash, visitor pages. Never flashes the default Vicit icon while branding is loading. */
export default function BrandMark({
  size = 40,
  className,
  glow = true,
  src,
  alt,
  width,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  src?: string | null;
  alt?: string;
  width?: number | string;
}) {
  const { brand, ready } = useBrand();
  const logo = src ?? logoSrc(brand.logoUrl, { fallback: false, version: brand.assetVersion });
  const label = alt || brand.name || 'Brand';
  const style: React.CSSProperties = width
    ? { width, height: 'auto', maxHeight: typeof size === 'number' ? size : undefined, borderRadius: 16, padding: 8 }
    : { width: size, height: size, borderRadius: size * 0.3, padding: size * 0.1 };

  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-white',
        glow && 'shadow-[0_8px_24px_-8px_rgb(var(--brand-700)/0.55)] ring-1 ring-white/70',
        !logo && 'bg-slate-100',
        className,
      )}
      style={style}
    >
      {logo ? (
        <img src={logo} alt={label} className="h-full w-full object-contain" />
      ) : ready && brand.name ? (
        <span className="text-sm font-bold text-brand-700" style={{ fontSize: Math.max(12, (typeof size === 'number' ? size : 40) * 0.32) }}>
          {brand.name.slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <span className="h-1/2 w-1/2 animate-pulse rounded-full bg-slate-200" aria-hidden />
      )}
    </span>
  );
}
