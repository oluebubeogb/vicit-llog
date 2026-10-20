'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser, setUser } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 5) {
      setError('New password must be at least 5 characters');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the temporary one');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      const u = getUser();
      if (u) setUser({ ...u, mustChangePassword: false });
      if (u?.role === 'GATE') router.replace('/gate');
      else router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pt-10 pb-28">
      <h1 className="mb-2 text-xl font-bold">Change password</h1>
      <p className="mb-6 text-sm text-slate-500">
        You must set a new password before continuing. Do not reuse the temporary password.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Current (temporary) password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
            minLength={5}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
            minLength={5}
            required
          />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
