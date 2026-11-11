export function pageLabel(pathname?: string | null): string {
  if (!pathname) return '';
  const exact: Record<string, string> = {
    '/': 'Sign in',
    '/login': 'Sign in',
    '/change-password': 'Change password',
    '/platform': 'Platform',
    '/invite/new': 'Invite',
    '/visitors': 'Visitors',
    '/gate/visits': 'Visits',
    '/notifications': 'Alerts',
    '/gate': 'Gate',
    '/gate/dispatch': 'Dispatch',
    '/contractors': 'Contractors',
    '/attendance': 'Attendance',
    '/profile': 'Profile',
    '/dashboard': 'Home',
    '/branding': 'Branding',
    '/ring': 'Call',
    '/locations': 'Locations',
    '/users': 'Users',
  };
  if (exact[pathname]) return exact[pathname];
  if (pathname.startsWith('/contractors/')) return 'Contractor';
  if (pathname.startsWith('/visitor/')) return 'Visitor';
  if (pathname.startsWith('/invite')) return 'Invite';
  if (pathname.startsWith('/gate/dispatch')) return 'Dispatch';
  if (pathname.startsWith('/gate')) return 'Gate';
  if (pathname.startsWith('/platform')) return 'Platform';
  if (pathname.startsWith('/branding')) return 'Branding';
  if (pathname.startsWith('/u/')) return 'Profile';
  const tail = pathname.split('/').filter(Boolean).pop() || '';
  return tail ? tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

export function documentTitle(pathname: string | null | undefined, brandName?: string | null, loginTitle?: string | null) {
  const base = (loginTitle || brandName || 'Defence Headquarters').trim();
  const page = pageLabel(pathname);
  if (pathname === '/' || pathname === '/login') return `Sign in · ${base}`;
  return page ? `${page} · ${base}` : base;
}
