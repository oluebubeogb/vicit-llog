'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowLeft,
  UserPlus,
  BarChart3,
  Ban,
  MapPin,
  Palette,
  Download,
  Activity,
  Trash2,
} from 'lucide-react';

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [tab, setTab] = useState<'users' | 'invites' | 'audit' | 'tools'>('tools');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'STAFF',
    portfolio: '',
  });
  const [msg, setMsg] = useState('');
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
    api.allInvites().then(setInvites).catch(() => {});
    api.audit().then(setAudit).catch(() => {});
    api.health().then(setHealth).catch(() => {});
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

  async function exportCsv() {
    try {
      const csv = await api.exportCsv();
      const blob = new Blob([csv as string], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vicit-visits-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('CSV exported');
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function cleanup() {
    try {
      const res = await api.cleanupPhotos();
      setMsg(`Cleanup: scanned ${res.scanned}, deleted ${res.deleted} photos`);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Admin</h1>
      </div>

      {/* Phase 2 quick links */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/analytics"
          className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm"
        >
          <BarChart3 size={22} className="text-brand-600" />
          <span className="text-xs font-semibold">Analytics</span>
        </Link>
        <Link
          href="/blacklist"
          className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm"
        >
          <Ban size={22} className="text-red-600" />
          <span className="text-xs font-semibold">Blacklist</span>
        </Link>
        <Link
          href="/locations"
          className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm"
        >
          <MapPin size={22} className="text-emerald-600" />
          <span className="text-xs font-semibold">Locations</span>
        </Link>
        <Link
          href="/branding"
          className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm"
        >
          <Palette size={22} className="text-violet-600" />
          <span className="text-xs font-semibold">Branding</span>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['tools', 'users', 'invites', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
              tab === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{msg}</p>
      )}

      {tab === 'tools' && (
        <div className="space-y-3">
          {health && (
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <Activity size={18} />
                <span className="font-semibold">System Health</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                    health.status === 'healthy'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {health.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                DB: {health.checks?.database} · Photos: {health.checks?.photoStorage} (
                {health.checks?.photoCount}) · v{health.version}
              </p>
            </div>
          )}
          <button
            onClick={exportCsv}
            className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-3 font-medium shadow-sm"
          >
            <Download size={18} /> Export Visits CSV
          </button>
          <button
            onClick={cleanup}
            className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-3 font-medium shadow-sm"
          >
            <Trash2 size={18} /> Run Photo Cleanup
          </button>
        </div>
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
