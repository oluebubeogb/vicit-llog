'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUser, api } from '@/lib/api';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { Ellipsis } from 'lucide-react';
import { buildMobileNav, isBarePath, type AppNavLink } from '@/lib/navLinks';
import Sheet from '@/components/ui/Sheet';

export default function BottomNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const refresh = () => {
      const u = getUser();
      setRole(u?.role ?? null);
    };
    refresh();
    // Re-sync role on route changes and when storage is updated (login / logout)
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
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
    // Clear badge when viewing alerts; also refresh on route change
    if (pathname === '/notifications') setUnread(0);
    const t = setInterval(load, 60000);
    // Foreground push → refresh badge right away
    window.addEventListener('vicit:notification', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('vicit:notification', load);
    };
  }, [pathname]);

  if (!mounted) return null;

  if (isBarePath(pathname)) {
    return null;
  }

  const isGate = role === 'GATE' || role === 'GLOBAL_GATE';
  const { primary, more } = buildMobileNav(role, getUser()?.permissions || []);
  const moreActive = more.some((l) => pathname === l.href || pathname?.startsWith(l.href + '/'));
  const slots: Array<AppNavLink | { href: '__more__'; icon: typeof Ellipsis; label: string; exact?: boolean; badge?: boolean }> =
    more.length
      ? [
          ...primary.slice(0, Math.floor(primary.length / 2)),
          { href: '__more__', icon: Ellipsis, label: 'More' },
          ...primary.slice(Math.floor(primary.length / 2)),
        ]
      : primary;

  function item(href: string, exact?: boolean, label?: string) {
    const active = exact
      ? pathname === href
      : pathname === href || Boolean(pathname?.startsWith(href + '/'));
    return isGate && href === '/gate' ? pathname === '/gate' : active;
  }

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 bottom-nav">
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" subtitle="Additional pages">
        <div className="grid grid-cols-2 gap-2">
          {more.map(({ href, icon: Icon, label }) => (
            <Link
              key={href + label}
              href={href}
              onClick={() => setMoreOpen(false)}
              className={clsx(
                'flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold',
                item(href) ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </div>
      </Sheet>
      <div className="pointer-events-auto mx-auto max-w-lg px-3">
        <div className="relative flex items-center justify-around overflow-hidden rounded-[26px] border border-white/70 bg-white/80 px-1.5 py-1.5 shadow-[0_18px_40px_-16px_rgb(15_23_42/0.35),0_2px_6px_rgb(15_23_42/0.06)] backdrop-blur-xl">
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-50/60 via-white/0 to-accent-50/60" />
          {/* Gradient used to paint the active icon. userSpaceOnUse (icon viewBox 0–24) so straight
              strokes with a zero-width bounding box are still painted. Follows branding colours. */}
          <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
            <defs>
              <linearGradient id="vicit-nav-active" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
                <stop offset="0" style={{ stopColor: 'rgb(var(--brand-500))' }} />
                <stop offset="0.5" style={{ stopColor: 'rgb(var(--brand-600))' }} />
                <stop offset="1" style={{ stopColor: 'rgb(var(--accent-700))' }} />
              </linearGradient>
            </defs>
          </svg>
          {slots.map((link) => {
            const { href, icon: Icon, label, exact, badge } = link as any;
            if (href === '__more__') {
              const isActive = moreOpen || moreActive;
              return (
                <button
                  type="button"
                  key="more"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMoreOpen(true)}
                  className={clsx(
                    'group relative flex min-w-[60px] flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors duration-200',
                    isActive ? 'text-brand-700' : 'text-slate-500 hover:text-brand-700',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                      className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-50 via-brand-100 to-accent-100 shadow-[0_6px_16px_-8px_rgb(var(--brand-600)/0.45)] ring-1 ring-inset ring-brand-200/70"
                    />
                  )}
                  <span className="relative"><Ellipsis size={21} strokeWidth={isActive ? 2.4 : 2} {...(isActive ? { color: 'url(#vicit-nav-active)' } : {})} /></span>
                  <span className={clsx('relative', isActive && 'bg-gradient-to-br from-brand-500 via-brand-600 to-accent-700 bg-clip-text text-transparent')}>More</span>
                </button>
              );
            }
            const isActive = item(href, exact, label);
            return (
              <Link
                key={href + label}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                  'group relative flex min-w-[60px] flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors duration-200',
                  isActive ? 'text-brand-700' : 'text-slate-500 hover:text-brand-700',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-50 via-brand-100 to-accent-100 shadow-[0_6px_16px_-8px_rgb(var(--brand-600)/0.45)] ring-1 ring-inset ring-brand-200/70"
                  />
                )}
                {!isActive && (
                  <span className="absolute inset-0 rounded-2xl bg-brand-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                )}
                <span className="relative transition-transform duration-300 group-hover:-translate-y-0.5 group-active:scale-90">
                  <Icon size={21} strokeWidth={isActive ? 2.4 : 2} {...(isActive ? { color: 'url(#vicit-nav-active)' } : {})} />
                  {badge && unread > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse-ring">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
                <span
                  className={clsx(
                    'relative',
                    isActive && 'bg-gradient-to-br from-brand-500 via-brand-600 to-accent-700 bg-clip-text text-transparent',
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
