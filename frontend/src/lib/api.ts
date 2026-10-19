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
};
