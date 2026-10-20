'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  UserPlus,
  Users,
  Bell,
  User,
  ScanLine,
  LayoutDashboard,
  LogOut,
} from 'lucide-react';
import { getUser, clearToken } from '@/lib/api';
import clsx from 'clsx';

const staffLinks = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/invite/new', icon: UserPlus, label: 'Invite' },
  { href: '/visitors', icon: Users, label: 'Visitors' },
  { href: '/notifications', icon: Bell, label: 'Alerts' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getUser();
    setRole(u?.role ?? null);
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

  function logout() {
    clearToken();
    router.replace('/login');
  }

  if (isGate) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-900/95 shadow-[0_-4px_16px_rgba(0,0,0,0.35)] backdrop-blur bottom-nav">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-2">
          <Link
            href="/gate"
            className={clsx(
              'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
              pathname === '/gate'
                ? 'text-brand-400'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <ScanLine size={22} strokeWidth={pathname === '/gate' ? 2.5 : 2} />
            <span>Scan</span>
          </Link>
          <Link
            href="/gate"
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <LayoutDashboard size={22} />
            <span>Visits</span>
          </Link>
          <Link
            href="/notifications"
            className={clsx(
              'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
              pathname === '/notifications'
                ? 'text-brand-400'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Bell size={22} strokeWidth={pathname === '/notifications' ? 2.5 : 2} />
            <span>Alerts</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300"
          >
            <LogOut size={22} />
            <span>Sign out</span>
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mt-4 border-t border-slate-200 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur bottom-nav">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-2">
        {staffLinks.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                active ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
