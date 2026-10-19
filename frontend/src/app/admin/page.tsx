'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, UserPlus } from 'lucide-react';

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [tab, setTab] = useState<'users' | 'invites' | 'audit'>('users');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'STAFF',
    portfolio: '',
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
    api.allInvites().then(setInvites).catch(() => {});
    api.audit().then(setAudit).catch(() => {});
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createUser(form);
      setMsg('User created');
      setShowForm(false);
      const list = await api.users();
      setUsers(list);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function approve(id: string) {
    await api.approveOffline(id);
    const list = await api.allInvites();
    setInvites(list);
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Admin</h1>
      </div>

      <div className="mb-4 flex gap-2">
        {(['users', 'invites', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
              tab === t
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {msg}
        </p>
      )}

      {tab === 'users' && (
        <div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="mb-4 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <UserPlus size={16} /> Onboard Staff
          </button>
          {showForm && (
            <form onSubmit={createUser} className="mb-4 space-y-3 rounded-xl border p-4">
              <input
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                required
              />
              <input
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                required
              />
              <input
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                required
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="STAFF">Staff</option>
                <option value="GATE">Gate Officer</option>
                <option value="ADMIN">Admin</option>
              </select>
              <input
                placeholder="Portfolio / Dept"
                value={form.portfolio}
                onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
              <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-white">
                Create
              </button>
            </form>
          )}
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border bg-white p-3">
                <p className="font-medium">{u.fullName}</p>
                <p className="text-xs text-slate-500">
                  {u.email} · {u.role}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'invites' && (
        <ul className="space-y-2">
          {invites.map((inv) => (
            <li key={inv.id} className="rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{inv.purpose}</p>
                  <p className="text-xs text-slate-500">
                    {inv.host?.fullName} · {inv.status}
                  </p>
                </div>
                {inv.status === 'OFFLINE_PENDING' && (
                  <button
                    onClick={() => approve(inv.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-white"
                  >
                    Approve
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'audit' && (
        <ul className="space-y-2">
          {audit.map((a) => (
            <li key={a.id} className="rounded-xl border bg-white p-3 text-sm">
              <p className="font-medium">{a.action}</p>
              <p className="text-xs text-slate-500">
                {a.user?.fullName || 'System'} ·{' '}
                {new Date(a.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
