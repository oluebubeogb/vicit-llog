'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import { useBrand } from '@/components/BrandProvider';
import { getToken, getUser } from '@/lib/api';
import { roleLabel } from '@/lib/roleLabels';

/** Compact authenticated identity strip. */
export default function AgencyIdentity() {
  const pathname = usePathname();
  const { brand, ready } = useBrand();
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const user = getUser();
      setAuthenticated(!!getToken() && !!user);
      setRole(user?.role ?? null);
      setOrgName(user?.organisation?.name || user?.organisationName || null);
    };
    sync();
    window.addEventListener('vicit-auth-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('vicit-auth-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, [pathname]);

  if (pathname === '/' || pathname === '/login' || pathname?.startsWith('/visitor/') || pathname?.startsWith('/u/') || pathname === '/change-password') return null;
  if (!authenticated || !ready) return <div className="auth-reserve mx-4 mb-1 mt-3 hidden min-h-11 lg:block" aria-hidden />;

  const roleName = roleLabel(role);
  const agencyName = (brand.name || orgName || '').trim();
  const roleLine = [agencyName, roleName].filter(Boolean).join(' - ');

  return (
    <>
      {/* Mobile: keep the agency mark so the workspace still has an identity without a sidebar. */}
      <div className="mx-4 mb-1 mt-3 flex min-h-11 items-center gap-2.5 rounded-2xl border border-white/70 bg-white/65 px-4 py-2 shadow-[0_5px_18px_-14px_rgb(15_23_42/0.35)] backdrop-blur-md lg:hidden">
        <BrandMark size={28} glow={false} className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold tracking-tight text-slate-800">{brand.name || brand.appName || 'Vicit Llog'}</p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400">Visitor Access &amp; Exit Control</p>
        </div>
        {roleLine && (
          <span className="max-w-[48%] shrink-0 truncate text-right text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600" title={roleLine}>
            {roleLine}
          </span>
        )}
      </div>

      {/* Desktop main panel: tagline on the left, agency and role on the right. */}
      <div className="mb-3 hidden items-center justify-between gap-4 pl-8 pr-8 pt-1 lg:flex">
        <p className="min-w-0 shrink text-sm font-medium tracking-tight text-slate-600">Visitor Access &amp; Exit Control</p>
        {roleLine && (
          <p className="min-w-0 max-w-[58%] shrink truncate text-right text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700" title={roleLine}>
            {roleLine}
          </p>
        )}
      </div>
    </>
  );
}
