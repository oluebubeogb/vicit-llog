'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, KeyRound, Lock } from 'lucide-react';
import { api, getUser, setUser } from '@/lib/api';
import BrandMark from '@/components/BrandMark';
import { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const checks = [
    { ok: newPassword.length >= 5, l: 'At least 5 characters' },
    { ok: !!newPassword && newPassword !== currentPassword, l: 'Different from the temporary one' },
    { ok: !!confirm && newPassword === confirm, l: 'Both entries match' },
  ];
  const strength = Math.min(4, Math.floor(newPassword.length / 3) + (/[0-9]/.test(newPassword) ? 1 : 0) + (/[^a-z0-9]/i.test(newPassword) ? 1 : 0));

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
    <div className="page pt-10">
      <div className="hero animate-in mb-5 flex items-center gap-4">
        <BrandMark size={52} />
        <div>
          <h1 className="text-xl font-bold">Set your password</h1>
          <p className="flex items-center gap-1 text-sm text-white/75">
            One quick step before you continue
            <InfoTip text="You signed in with a temporary password. Choose a new one — don’t reuse the temporary password." className="!text-white/80" />
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="surface animate-in space-y-4">
        {[
          { l: 'Current (temporary) password', v: currentPassword, s: setCurrent, icon: <KeyRound size={16} />, ac: 'current-password' },
          { l: 'New password', v: newPassword, s: setNew, icon: <Lock size={16} />, ac: 'new-password' },
          { l: 'Confirm new password', v: confirm, s: setConfirm, icon: <Lock size={16} />, ac: 'new-password' },
        ].map((f) => (
          <label key={f.l} className="block">
            <span className="label">{f.l}</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{f.icon}</span>
              <input type="password" value={f.v} onChange={(e) => f.s(e.target.value)} autoComplete={f.ac} className="input pl-10" required />
            </span>
          </label>
        ))}
        <div className="tile space-y-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i < strength ? (strength > 2 ? 'bg-emerald-500' : strength > 1 ? 'bg-amber-400' : 'bg-rose-400') : 'bg-slate-200'}`} />
            ))}
          </div>
          {checks.map((c) => (
            <p key={c.l} className={`flex items-center gap-2 text-xs transition ${c.ok ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full transition ${c.ok ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>
                <Check size={10} />
              </span>
              {c.l}
            </p>
          ))}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5">
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
