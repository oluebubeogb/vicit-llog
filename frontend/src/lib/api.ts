const API_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('vicit_token');
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('vicit_token', token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('vicit_token');
  localStorage.removeItem('vicit_user');
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('vicit_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('vicit_user', JSON.stringify(user));
}

function toQuery(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  return q.toString();
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv')) {
    return res.text();
  }

  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request('/users/me'),
  publicProfile: (id: string) => request(`/users/public/${id}`),
  uploadAvatar: async (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return request('/users/me/avatar', { method: 'POST', body: form });
  },
  createInvite: (data: any) =>
    request('/invites', { method: 'POST', body: JSON.stringify(data) }),
  myInvites: () => request('/invites/mine'),
  allInvites: () => request('/invites'),
  publicInvite: (token: string) => request(`/invites/public/${token}`),
  reviveInvite: (id: string) =>
    request(`/invites/${id}/revive`, { method: 'POST' }),
  approveOffline: (id: string) =>
    request(`/invites/${id}/approve-offline`, { method: 'POST' }),
  uploadPhoto: async (token: string, visitorId: string, file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return request(`/visitors/${token}/${visitorId}/photo`, {
      method: 'POST',
      body: form,
    });
  },
  gateLookup: (code: string) =>
    request(`/gate/lookup?code=${encodeURIComponent(code)}`),
  gateVisits: (filter?: string) =>
    request(`/gate/visits${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`),
  recordEntry: (data: any) =>
    request('/gate/entry', { method: 'POST', body: JSON.stringify(data) }),
  recordExit: (visitorId: string, notes?: string) =>
    request(`/gate/exit/${visitorId}`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  denyEntry: (visitorId: string, reason: string) =>
    request(`/gate/deny/${visitorId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  notifications: () => request('/notifications'),
  markRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () =>
    request('/notifications/read-all', { method: 'PATCH' }),
  users: () => request('/users'),
  createUser: (data: any) =>
    request('/users', { method: 'POST', body: JSON.stringify(data) }),
  audit: () => request('/audit'),
  analytics: (days = 30, from?: string, to?: string) => {
    const q = new URLSearchParams({ days: String(days) });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return request(`/analytics/dashboard?${q.toString()}`);
  },
  analyticsVisitors: (params: {
    days?: number;
    metric?: string;
    purpose?: string;
    entryMode?: string;
    status?: string;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    if (params.days) q.set('days', String(params.days));
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    if (params.metric) q.set('metric', params.metric);
    if (params.purpose) q.set('purpose', params.purpose);
    if (params.entryMode) q.set('entryMode', params.entryMode);
    if (params.status) q.set('status', params.status);
    return request(`/analytics/visitors?${q.toString()}`);
  },
  /** Newest 100 records behind any analytics number, plus the real total. */
  analyticsDrill: (params: Record<string, string | number | undefined | null>) =>
    request(`/analytics/drill?${toQuery(params)}`),
  /** Full CSV (server-capped) of a drill-down; returns the file plus cap info from headers. */
  analyticsExport: async (params: Record<string, string | number | undefined | null>) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/analytics/drill/export?${toQuery(params)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Export failed');
    }
    const cd = res.headers.get('content-disposition') || '';
    const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] || 'vicit-export.csv';
    return {
      blob: await res.blob(),
      name,
      total: Number(res.headers.get('x-export-total') || 0),
      cap: Number(res.headers.get('x-export-cap') || 0),
      truncated: res.headers.get('x-export-truncated') === 'true',
    };
  },
  /** Ranked multi-word search across invites and their visitors (server-side). */
  searchInvites: (q: string, page = 1, pageSize = 30) =>
    request(`/invites/search?${toQuery({ q, page, pageSize })}`),
  blacklist: () => request('/blacklist'),
  addBlacklist: (data: any) =>
    request('/blacklist', { method: 'POST', body: JSON.stringify(data) }),
  deactivateBlacklist: (id: string) =>
    request(`/blacklist/${id}/deactivate`, { method: 'PATCH' }),
  checkBlacklist: (params: {
    fullName?: string;
    idNumber?: string;
    phone?: string;
  }) => {
    const q = new URLSearchParams(params as any).toString();
    return request(`/blacklist/check?${q}`);
  },
  locations: () => request('/locations'),
  createLocation: (data: any) =>
    request('/locations', { method: 'POST', body: JSON.stringify(data) }),
  addGate: (locationId: string, data: any) =>
    request(`/locations/${locationId}/gates`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  gates: () => request('/locations/gates/all'),
  exportCsv: (from?: string, to?: string, columns?: string[]) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (columns?.length) q.set('columns', columns.join(','));
    return request(`/reports/visits.csv?${q.toString()}`);
  },
  visitorHistory: (q: string) =>
    request(`/reports/history?q=${encodeURIComponent(q)}`),
  branding: () => request('/branding'),
  publicBranding: () => request('/branding/public'),
  updateBranding: (data: any) =>
    request('/branding', { method: 'PATCH', body: JSON.stringify(data) }),
  health: () => request('/health'),
  cleanupPhotos: () => request('/health/cleanup-photos', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  requestProfileEdit: (data: any) =>
    request('/users/me/profile-edit', { method: 'POST', body: JSON.stringify(data) }),
  listProfileEdits: () => request('/users/profile-edits'),
  reviewProfileEdit: (id: string, approve: boolean, note?: string) =>
    request(`/users/profile-edits/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ approve, note }),
    }),
  bulkReviewProfileEdits: (ids: string[], approve: boolean, note?: string) =>
    request('/users/profile-edits/bulk-review', {
      method: 'POST',
      body: JSON.stringify({ ids, approve, note }),
    }),
  unreadNotificationsCount: async () => {
    const list = await request('/notifications');
    return Array.isArray(list) ? list.filter((n: any) => !n.isRead).length : 0;
  },
  bulkUsers: (rows: any[]) =>
    request('/users/bulk', { method: 'POST', body: JSON.stringify({ rows }) }),
  resetUserPassword: (id: string) =>
    request(`/users/${id}/reset-password`, { method: 'POST' }),
  updateUser: (id: string, data: any) =>
    request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getUserById: (id: string) => request(`/users/${id}`),
  uploadLogo: async (file: File) => {
    const form = new FormData();
    form.append('logo', file);
    return request('/branding/logo', { method: 'POST', body: form });
  },
};
