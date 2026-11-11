'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { getUser, api } from '@/lib/api';
import { buildNavLinks, buildSidebarLinks, isBarePath } from '@/lib/navLinks';
import BrandMark from '@/components/BrandMark';
import BottomNav from '@/components/BottomNav';
import AgencyIdentity from '@/components/AgencyIdentity';
import { useBrand } from '@/components/BrandProvider';
import FooterCredit from '@/components/FooterCredit';

function useSessionNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [unread, setUnread] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const refresh = () => {
      const u = getUser();
      setRole(u?.role ?? null);
      setPermissions(u?.permissions || []);
    };
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
    setPermissions(u?.permissions || []);
  }, [pathname]);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    const load = () =>
      api
        .unreadNotificationsCount()
        .then(setUnread)
        .catch(() => setUnread(0));
    load();
    if (pathname === '/notifications') setUnread(0);
    const t = setInterval(load, 60000);
    window.addEventListener('vicit:notification', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('vicit:notification', load);
    };
  }, [pathname]);

  return { pathname, role, permissions, unread, mounted, links: buildSidebarLinks(role, permissions) };
}

function DesktopSidebar({
  links,
  unread,
  pathname,
}: {
  links: ReturnType<typeof buildNavLinks>;
  unread: number;
  pathname: string | null;
}) {
  const { brand } = useBrand();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200/80 bg-white/85 px-3 py-5 shadow-[8px_0_24px_-20px_rgb(15_23_42/0.25)] backdrop-blur-xl lg:flex">
      <Link href={links[0]?.href || '/dashboard'} className="mb-6 flex items-center gap-2.5 px-2">
        <BrandMark size={36} />
        <span className="min-w-0">
          <b className="block truncate text-sm font-semibold text-slate-900">{brand.name || 'Vicit'}</b>
          <span className="block text-[11px] text-slate-500">Desktop workspace</span>
        </span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map(({ href, icon: Icon, label, exact, badge }) => {
          const active = exact
            ? pathname === href
            : pathname === href || Boolean(pathname?.startsWith(href + '/'));
          return (
            <Link
              key={href + label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'bg-gradient-to-br from-brand-50 via-brand-100 to-accent-100 text-brand-800 shadow-sm ring-1 ring-inset ring-brand-200/70'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-brand-700',
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              <span className="flex-1">{label}</span>
              {badge && unread > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1.5 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-slate-100 px-2 pt-4">
        <FooterCredit />
      </div>
    </aside>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname, links, unread, mounted, role } = useSessionNav();
  const { brand } = useBrand();
  const bare = isBarePath(pathname);
  const mobileStatic = brand.footerCreditMobileMode === 'STATIC';

  if (bare) {
    return (
      <main className="relative mx-auto min-h-screen max-w-lg pt-[env(safe-area-inset-top)]">
        {children}
      </main>
    );
  }

  return (
    <div className="relative min-h-screen">
      {mounted && role && <DesktopSidebar links={links} unread={unread} pathname={pathname} />}
      <main
        className={clsx(
          'relative mx-auto min-h-screen pt-[env(safe-area-inset-top)]',
          'max-w-lg pb-36 px-0',
          'lg:ml-60 lg:max-w-none lg:pb-10 lg:pr-8 lg:pt-6',
        )}
      >
        <div className="mx-auto w-full max-w-lg lg:max-w-6xl">
          <AgencyIdentity />
          {children}
          {mobileStatic && (
            <div className="lg:hidden px-4 pb-3 pt-10">
              <FooterCredit />
            </div>
          )}
        </div>
      </main>
      <div className="lg:hidden">
        {!mobileStatic && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[5.6rem] z-40 px-4 pb-[env(safe-area-inset-bottom)]">
            <FooterCredit className="pointer-events-auto" />
          </div>
        )}
        <BottomNav />
      </div>
    </div>
  );
}
