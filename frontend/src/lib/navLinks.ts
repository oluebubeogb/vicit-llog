import {
  Home,
  UserPlus,
  Users,
  Bell,
  User,
  ScanLine,
  LayoutDashboard,
  ClipboardCheck,
  Briefcase,
  Package,
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
    { href: '/gate/dispatch', icon: Package, label: 'Dispatch' },
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

const L = {
  platform: { href: '/platform', icon: LayoutDashboard, label: 'Platform' } as AppNavLink,
  invite: { href: '/invite/new', icon: UserPlus, label: 'Invite' } as AppNavLink,
  visits: { href: '/gate/visits', icon: Users, label: 'Visits' } as AppNavLink,
  visitors: { href: '/visitors', icon: Users, label: 'Visitors' } as AppNavLink,
  alerts: { href: '/notifications', icon: Bell, label: 'Alerts', badge: true } as AppNavLink,
  gate: { href: '/gate', icon: ScanLine, label: 'Gate', exact: true } as AppNavLink,
  scan: { href: '/gate', icon: ScanLine, label: 'Scan', exact: true } as AppNavLink,
  dispatch: { href: '/gate/dispatch', icon: Package, label: 'Dispatch' } as AppNavLink,
  contractors: { href: '/contractors', icon: Briefcase, label: 'Contractors' } as AppNavLink,
  attendance: { href: '/attendance', icon: ClipboardCheck, label: 'Attendance' } as AppNavLink,
  profile: { href: '/profile', icon: User, label: 'Profile' } as AppNavLink,
  home: { href: '/dashboard', icon: Home, label: 'Home' } as AppNavLink,
};

/** Desktop sidebar. Super Admin order is fixed. */
export function buildSidebarLinks(role?: string | null, permissions: string[] = []): AppNavLink[] {
  if (role === 'SUPER_ADMIN') {
    return [L.platform, L.invite, L.visits, L.alerts, L.gate, L.dispatch, L.contractors, L.attendance, L.profile];
  }
  if (role === 'GLOBAL_ADMIN') {
    const visits = permissions.includes('visits.view') ? [L.visits] : [];
    return [L.platform, L.invite, ...visits, L.alerts, L.dispatch, L.contractors, L.attendance, L.profile];
  }
  if (role === 'ADMIN') {
    return [L.home, L.invite, L.visitors, L.alerts, L.dispatch, L.contractors, L.attendance, L.profile];
  }
  if (role === 'GATE' || role === 'GLOBAL_GATE') {
    return [L.scan, L.invite, L.visits, L.alerts, L.dispatch, L.contractors, L.profile];
  }
  return buildNavLinks(role, permissions);
}

/** Mobile footer (max ~5) plus overflow items for the More sheet. */
export function buildMobileNav(role?: string | null, permissions: string[] = []): { primary: AppNavLink[]; more: AppNavLink[] } {
  // Primary order is Platform, Gate, (More is inserted here), Alerts, Profile.
  if (role === 'SUPER_ADMIN') {
    return {
      primary: [L.platform, L.gate, L.alerts, L.profile],
      more: [L.invite, L.visits, L.dispatch, L.contractors, L.attendance],
    };
  }
  if (role === 'GLOBAL_ADMIN') {
    const visits = permissions.includes('visits.view') ? [L.visits] : [];
    return {
      primary: [L.platform, L.gate, L.alerts, L.profile],
      more: [L.invite, ...visits, L.dispatch, L.contractors, L.attendance],
    };
  }
  if (role === 'ADMIN') {
    return {
      primary: [L.home, L.invite, L.alerts, L.profile],
      more: [L.visitors, L.dispatch, L.contractors, L.attendance],
    };
  }
  if (role === 'GATE' || role === 'GLOBAL_GATE') {
    return {
      primary: [L.scan, L.dispatch, L.alerts, L.profile],
      more: [L.invite, L.visits, L.contractors],
    };
  }
  return { primary: buildNavLinks(role, permissions), more: [] };
}

export function platformHome(role?: string | null) {
  if (role === 'SUPER_ADMIN' || role === 'GLOBAL_ADMIN') return '/platform';
  if (role === 'GATE' || role === 'GLOBAL_GATE') return '/gate';
  if (role === 'ADMIN') return '/dashboard';
  return '/dashboard';
}
