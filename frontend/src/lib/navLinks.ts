import {
  Home,
  UserPlus,
  Users,
  Bell,
  User,
  ScanLine,
  LayoutDashboard,
  ClipboardCheck,
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

/** Desktop sidebar: same as the mobile footer, plus Attendance for admins (not added to the crowded bottom nav). */
export function buildSidebarLinks(role?: string | null, permissions: string[] = []): AppNavLink[] {
  const links = buildNavLinks(role, permissions);
  if (role === 'SUPER_ADMIN' || role === 'GLOBAL_ADMIN' || role === 'ADMIN') {
    const att: AppNavLink = { href: '/attendance', icon: ClipboardCheck, label: 'Attendance' };
    const idx = links.findIndex((l) => l.href === '/profile');
    if (idx >= 0) links.splice(idx, 0, att);
    else links.push(att);
  }
  return links;
}

export function platformHome(role?: string | null) {
  if (role === 'SUPER_ADMIN' || role === 'GLOBAL_ADMIN') return '/platform';
  if (role === 'GATE' || role === 'GLOBAL_GATE') return '/gate';
  if (role === 'ADMIN') return '/dashboard';
  return '/dashboard';
}
