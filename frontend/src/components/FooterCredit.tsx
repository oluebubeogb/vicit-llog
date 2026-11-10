'use client';

import clsx from 'clsx';
import { useBrand } from './BrandProvider';

export default function FooterCredit({ className, light = false }: { className?: string; light?: boolean }) {
  const { brand } = useBrand();
  if (brand.footerCreditEnabled === false) return null;
  const text = brand.footerCredit || "Powered by CISTECH's Vicit 1.0.1";
  return (
    <p className={clsx('px-2 text-center text-[10px] font-medium leading-snug tracking-wide', light ? 'text-on-brand/70' : 'text-slate-400', className)}>
      {text}
    </p>
  );
}
