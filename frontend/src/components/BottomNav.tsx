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
} from 'lucide-react';
import { getUser } from '@/lib/api';
import clsx from 'clsx';

const staffLinks = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/invite/new', icon: UserPlus, label: 'Invite' },
  { href: '/visitors', icon: Users, label: 'Visitors' },
  { href: '/notifications', icon: Bell, label: 'Alerts' },
  { href: '/profile', icon: User, label: 'Profile' },
];

const gateLinks = [
  { href: '/gate', icon: ScanLine, label: 'Scan' },
  { href: '/notifications', icon: Bell, label: 'Alerts' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getUser();
    setRole(u?.role ?? null);
  }, []);

  if (!mounted) return null;

  // Hide on public visitor page and login
  if (
    pathname?.startsWith('/visitor/') ||
    pathname === '/login' ||
    pathname === '/'
  ) {
    return null;
  }

  const isGate = role === 'GATE';
  const links = isGate ? gateLinks : staffLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur bottom-nav safe-area">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-2">
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                active
                  ? 'text-brand-600'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 2}
                className={active ? 'text-brand-600' : ''}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
