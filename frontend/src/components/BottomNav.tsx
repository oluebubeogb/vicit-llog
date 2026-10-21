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
    const u = getUser();
    setRole(u?.role ?? null);
    if (u) {
      api
        .unreadNotificationsCount()
        .then(setUnread)
        .catch(() => setUnread(0));
      const t = setInterval(() => {
        api.unreadNotificationsCount().then(setUnread).catch(() => {});
      }, 60000);
      return () => clearInterval(t);
    }
  }, []);

  if (!mounted) return null;

  if (
    pathname?.startsWith('/visitor/') ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname === '/change-password'
  ) {
    return null;
  }

  const isGate = role === 'GATE';
  const links = isGate ? gateLinks : staffLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mt-4 border-t border-slate-200 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur bottom-nav">
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 pt-2">
        {links.map(({ href, icon: Icon, label, exact, badge }: any) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname?.startsWith(href + '/');
          const isActive =
            isGate && href === '/gate' ? pathname === '/gate' : active;
          return (
            <Link
              key={href + label}
              href={href}
              className={clsx(
                'relative flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:text-brand-600',
                isActive ? 'text-brand-600' : 'text-slate-500',
              )}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {badge && unread > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
