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
  recordEntry: (data: any) =>
    request('/gate/entry', { method: 'POST', body: JSON.stringify(data) }),
  recordExit: (visitorId: string, notes?: string) =>
    request(`/gate/exit/${visitorId}`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  notifications: () => request('/notifications'),
  markRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),
  users: () => request('/users'),
  createUser: (data: any) =>
    request('/users', { method: 'POST', body: JSON.stringify(data) }),
  audit: () => request('/audit'),
  analytics: (days = 30) => request(`/analytics/dashboard?days=${days}`),
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
  exportCsv: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return request(`/reports/visits.csv?${q.toString()}`);
  },
  visitorHistory: (q: string) =>
    request(`/reports/history?q=${encodeURIComponent(q)}`),
  branding: () => request('/branding'),
  updateBranding: (data: any) =>
    request('/branding', { method: 'PATCH', body: JSON.stringify(data) }),
  health: () => request('/health'),
  cleanupPhotos: () => request('/health/cleanup-photos', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
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
