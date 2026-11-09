'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import { useBrand } from '@/components/BrandProvider';
import { getToken, getUser } from '@/lib/api';

/** Compact authenticated identity strip; agency users see their own white-label identity. */
export default function AgencyIdentity() {
  const pathname = usePathname();
  const { brand, ready } = useBrand();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const sync = () => setAuthenticated(!!getToken() && !!getUser());
    sync();
    window.addEventListener('vicit-auth-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('vicit-auth-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, [pathname]);

  if (pathname === '/' || pathname === '/login' || pathname?.startsWith('/visitor/') || pathname?.startsWith('/u/') || pathname === '/change-password') return null;
  if (!authenticated || !ready) return <div className="auth-reserve mx-4 mb-1 mt-3 hidden min-h-11" aria-hidden />;

  return (
    <div className="mx-4 mb-1 mt-3 flex min-h-11 items-center gap-2.5 rounded-2xl border border-white/70 bg-white/65 px-3 py-2 shadow-[0_5px_18px_-14px_rgb(15_23_42/0.35)] backdrop-blur-md">
      <BrandMark size={28} glow={false} className="rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold tracking-tight text-slate-800">{brand.name || brand.appName || 'Vicit Llog'}</p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400">Visitor access &amp; exit control</p>
      </div>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgb(var(--brand-100))]" />
    </div>
  );
}
