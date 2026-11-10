import {
  Home,
  UserPlus,
  Users,
  Bell,
  User,
  ScanLine,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export type AppNavLink = {
  href: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
  badge?: boolean;
};

export const BARE_PATH_PREFIXES = ['/visitor/', '/u/'];
export const BARE_PATHS = ['/login', '/', '/change-password'];

export function isBarePath(pathname?: string | null) {
  if (!pathname) return true;
  if (BARE_PATHS.includes(pathname)) return true;
  return BARE_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function buildNavLinks(
  role?: string | null,
  permissions: string[] = [],
): AppNavLink[] {
  const staffLinks: AppNavLink[] = [
    { href: '/dashboard', icon: Home, label: 'Home' },
    { href: '/invite/new', icon: UserPlus, label: 'Invite' },
    { href: '/visitors', icon: Users, label: 'Visitors' },
    { href: '/notifications', icon: Bell, label: 'Alerts', badge: true },
    { href: '/profile', icon: User, label: 'Profile' },
  ];
  const gateLinks: AppNavLink[] = [
    { href: '/gate', icon: ScanLine, label: 'Scan', exact: true },
    { href: '/invite/new', icon: UserPlus, label: 'Invite' },
    { href: '/gate/visits', icon: LayoutDashboard, label: 'Visits' },
    { href: '/notifications', icon: Bell, label: 'Alerts', badge: true },
    { href: '/profile', icon: User, label: 'Profile' },
  ];

  if (role === 'SUPER_ADMIN' || role === 'GLOBAL_ADMIN') {
    const canSeeGlobalVisits = role === 'SUPER_ADMIN' || permissions.includes('visits.view');
    const links: AppNavLink[] = [
      { href: '/platform', icon: LayoutDashboard, label: 'Platform' },
      { href: '/notifications', icon: Bell, label: 'Alerts', badge: true },
      ...(canSeeGlobalVisits ? [{ href: '/gate/visits', icon: Users, label: 'Visits' } as AppNavLink] : []),
      ...(role === 'SUPER_ADMIN' ? [{ href: '/gate', icon: ScanLine, label: 'Gate' } as AppNavLink] : []),
      { href: '/profile', icon: User, label: 'Profile' },
    ];
    return links;
  }
  if (role === 'GATE' || role === 'GLOBAL_GATE') return gateLinks;
  return staffLinks;
}

export function platformHome(role?: string | null) {
  if (role === 'SUPER_ADMIN' || role === 'GLOBAL_ADMIN') return '/platform';
  if (role === 'GATE' || role === 'GLOBAL_GATE') return '/gate';
  if (role === 'ADMIN') return '/dashboard';
  return '/dashboard';
}
