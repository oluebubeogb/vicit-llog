'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getUser, setUser, clearToken } from '@/lib/api';
import { isValidEmail } from '@/lib/email';
import { LogOut, User, ArrowLeft, Camera } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setLocal] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', portfolio: '', email: '' });
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setLocal(u);
    setForm({
      fullName: u.fullName || '',
      phone: u.phone || '',
      portfolio: u.portfolio || '',
      email: u.email || '',
    });
    api.me().then((me) => {
      setLocal({ ...u, ...me });
      setUser({ ...u, ...me });
      setForm({
        fullName: me.fullName || '',
        phone: me.phone || '',
        portfolio: me.portfolio || '',
        email: me.email || '',
      });
    }).catch(() => {});
  }, [router]);

  function logout() {
    clearToken();
    router.replace('/login');
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (form.email && !isValidEmail(form.email)) {
      setMsg('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      await api.requestProfileEdit({
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        portfolio: form.portfolio.trim() || null,
        email: form.email.trim().toLowerCase(),
      });
      setPending(true);
      setMsg('Changes submitted — pending admin approval.');
    } catch (err: any) {
      setMsg(err.message || 'Could not submit changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={user?.role === 'GATE' ? '/gate' : '/dashboard'}
          className="rounded-full p-2 hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm card-hover">
        <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700">
          {user?.avatarPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL || ''}/visitors/photo/${user.avatarPath}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={28} />
          )}
          <span className="absolute bottom-0 right-0 rounded-full bg-white p-1 shadow">
            <Camera size={12} className="text-slate-500" />
          </span>
        </div>
        <div>
          <p className="text-lg font-semibold">{user?.fullName}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <p className="text-xs text-slate-400">
            {user?.role} · {user?.organisation?.name}
          </p>
        </div>
      </div>

      <form onSubmit={submitEdit} className="mb-6 space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Edit details</p>
        <p className="text-xs text-slate-400">
          Changes require admin approval before they apply.
        </p>
        <input
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          placeholder="Full name"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
          required
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Email"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
          required
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Phone"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
        />
        <input
          value={form.portfolio}
          onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
          placeholder="Portfolio / department"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
        />
        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              pending ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-600'
            }`}
          >
            {msg}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Submitting…' : 'Submit for approval'}
        </button>
      </form>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 font-semibold text-red-600"
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </div>
  );
}
