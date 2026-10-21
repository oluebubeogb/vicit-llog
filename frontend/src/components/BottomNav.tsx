'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  UserPlus,
  Users,
  Bell,
  User,
  ScanLine,
  LayoutDashboard,
} from 'lucide-react';
import { getUser, api } from '@/lib/api';
import clsx from 'clsx';
import { motion } from 'framer-motion';

const staffLinks = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/invite/new', icon: UserPlus, label: 'Invite' },
  { href: '/visitors', icon: Users, label: 'Visitors' },
  { href: '/notifications', icon: Bell, label: 'Alerts', badge: true },
  { href: '/profile', icon: User, label: 'Profile' },
];

const gateLinks = [
  { href: '/gate', icon: ScanLine, label: 'Scan', exact: true },
  { href: '/gate/visits', icon: LayoutDashboard, label: 'Visits' },
  { href: '/visitors', icon: Users, label: 'Visitors' },
  { href: '/notifications', icon: Bell, label: 'Alerts', badge: true },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);

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
    return () => clearInterval(t);
  }, [pathname]);

  if (!mounted) return null;

  if (
    pathname?.startsWith('/visitor/') ||
    pathname?.startsWith('/u/') ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname === '/change-password'
  ) {
    return null;
  }

  const isGate = role === 'GATE';
  const links = isGate ? gateLinks : staffLinks;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 bottom-nav">
      <div className="pointer-events-auto mx-auto max-w-lg px-3">
        <div className="relative flex items-center justify-around overflow-hidden rounded-[26px] border border-white/70 bg-white/80 px-1.5 py-1.5 shadow-[0_18px_40px_-16px_rgb(15_23_42/0.35),0_2px_6px_rgb(15_23_42/0.06)] backdrop-blur-xl">
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-50/60 via-white/0 to-accent-50/60" />
          {links.map(({ href, icon: Icon, label, exact, badge }: any) => {
            const active = exact
              ? pathname === href
              : pathname === href || pathname?.startsWith(href + '/');
            const isActive = isGate && href === '/gate' ? pathname === '/gate' : active;
            return (
              <Link
                key={href + label}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                  'group relative flex min-w-[60px] flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors duration-200',
                  isActive ? 'text-white' : 'text-slate-500 hover:text-brand-700',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-accent-700 shadow-glow"
                  />
                )}
                {!isActive && (
                  <span className="absolute inset-0 rounded-2xl bg-brand-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                )}
                <span className="relative transition-transform duration-300 group-hover:-translate-y-0.5 group-active:scale-90">
                  <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                  {badge && unread > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse-ring">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
