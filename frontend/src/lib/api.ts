const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vicit_token');
}

export function setToken(token: string) {
  localStorage.setItem('vicit_token', token);
}

export function clearToken() {
  localStorage.removeItem('vicit_token');
  localStorage.removeItem('vicit_user');
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('vicit_user');
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user: any) {
  localStorage.setItem('vicit_user', JSON.stringify(user));
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

  // CSV download
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv')) {
    return res.text();
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request('/users/me'),

  // Invites
  createInvite: (data: any) =>
    request('/invites', { method: 'POST', body: JSON.stringify(data) }),
  myInvites: () => request('/invites/mine'),
  allInvites: () => request('/invites'),
  publicInvite: (token: string) => request(`/invites/public/${token}`),
  reviveInvite: (id: string) =>
    request(`/invites/${id}/revive`, { method: 'POST' }),
  approveOffline: (id: string) =>
    request(`/invites/${id}/approve-offline`, { method: 'POST' }),

  // Visitors
  uploadPhoto: async (token: string, visitorId: string, file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return request(`/visitors/${token}/${visitorId}/photo`, {
      method: 'POST',
      body: form,
    });
  },

  // Gate
  gateLookup: (code: string) =>
    request(`/gate/lookup?code=${encodeURIComponent(code)}`),
  recordEntry: (data: any) =>
    request('/gate/entry', { method: 'POST', body: JSON.stringify(data) }),
  recordExit: (visitorId: string, notes?: string) =>
    request(`/gate/exit/${visitorId}`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  // Notifications
  notifications: () => request('/notifications'),
  markRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),

  // Users
  users: () => request('/users'),
  createUser: (data: any) =>
    request('/users', { method: 'POST', body: JSON.stringify(data) }),

  // Audit
  audit: () => request('/audit'),

  // Phase 2 – Analytics
  analytics: (days = 30) => request(`/analytics/dashboard?days=${days}`),

  // Phase 2 – Blacklist
  blacklist: () => request('/blacklist'),
  addBlacklist: (data: any) =>
    request('/blacklist', { method: 'POST', body: JSON.stringify(data) }),
  deactivateBlacklist: (id: string) =>
    request(`/blacklist/${id}/deactivate`, { method: 'PATCH' }),
  checkBlacklist: (params: { fullName?: string; idNumber?: string; phone?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request(`/blacklist/check?${q}`);
  },

  // Phase 2 – Locations
  locations: () => request('/locations'),
  createLocation: (data: any) =>
    request('/locations', { method: 'POST', body: JSON.stringify(data) }),
  addGate: (locationId: string, data: any) =>
    request(`/locations/${locationId}/gates`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  gates: () => request('/locations/gates/all'),

  // Phase 2 – Reports
  exportCsv: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return request(`/reports/visits.csv?${q.toString()}`);
  },
  visitorHistory: (q: string) =>
    request(`/reports/history?q=${encodeURIComponent(q)}`),

  // Phase 2 – Branding
  branding: () => request('/branding'),
  updateBranding: (data: any) =>
    request('/branding', { method: 'PATCH', body: JSON.stringify(data) }),

  // Phase 2 – Health
  health: () => request('/health'),
  cleanupPhotos: () =>
    request('/health/cleanup-photos', { method: 'POST' }),
};
