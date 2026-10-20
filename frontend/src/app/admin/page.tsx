'use client';

import { useEffect, useState, useRef } from 'react';
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
  Upload,
  KeyRound,
  X,
} from 'lucide-react';

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [tab, setTab] = useState<'tools' | 'users' | 'invites' | 'audit'>('tools');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    role: 'STAFF',
    portfolio: '',
    phone: '',
  });
  const [msg, setMsg] = useState('');
  const [oncePassword, setOncePassword] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadUsers() {
    api.users().then(setUsers).catch(() => {});
  }

  useEffect(() => {
    loadUsers();
    api.allInvites().then(setInvites).catch(() => {});
    api.audit().then(setAudit).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api.createUser(form);
      setMsg('User created');
      setOncePassword(res.initialPassword);
      setShowForm(false);
      setForm({ email: '', fullName: '', role: 'STAFF', portfolio: '', phone: '' });
      loadUsers();
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function approve(id: string) {
    await api.approveOffline(id);
    setInvites(await api.allInvites());
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
      setMsg(`Cleanup: scanned ${res.scanned}, deleted ${res.deleted}`);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function onBulkFile(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setMsg('CSV needs a header and at least one row');
      return;
    }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const idx = (name: string) => header.indexOf(name);
    const rows = lines.slice(1).map((line) => {
      const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
      return {
        fullName: cols[idx('fullname')] || cols[0] || '',
        email: cols[idx('email')] || cols[1] || '',
        role: cols[idx('role')] || 'STAFF',
        portfolio: cols[idx('portfolio')] || '',
        phone: cols[idx('phone')] || '',
      };
    }).filter((r) => r.email);

    try {
      const res = await api.bulkUsers(rows);
      setBulkResult(res);
      setMsg(`Bulk: ${res.createdCount} created, ${res.errorCount} errors`);
      loadUsers();
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  function downloadCredentialsCsv() {
    if (!bulkResult?.credentialsCsv) return;
    const blob = new Blob([bulkResult.credentialsCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-credentials-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const csv = 'fullName,email,role,portfolio,phone\nJane Doe,jane@org.com,STAFF,HR,+2348012345678\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function resetPw(id: string) {
    try {
      const res = await api.resetUserPassword(id);
      if (res.initialPassword) setOncePassword(res.initialPassword);
      setMsg(res.initialPassword ? `Password reset for ${res.email}` : `Password reset for ${res.email} — new temp password emailed.`);
      setSelected((s: any) => (s ? { ...s, mustChangePassword: true } : s));
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function saveSelected(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const updated = await api.updateUser(selected.id, {
        fullName: selected.fullName,
        phone: selected.phone,
        portfolio: selected.portfolio,
        role: selected.role,
        isActive: selected.isActive,
      });
      setMsg('User updated');
      setSelected(updated);
      loadUsers();
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

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link href="/analytics" className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm">
          <BarChart3 size={22} className="text-brand-600" />
          <span className="text-xs font-semibold">Analytics</span>
        </Link>
        <Link href="/blacklist" className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm">
          <Ban size={22} className="text-red-600" />
          <span className="text-xs font-semibold">Blacklist</span>
        </Link>
        <Link href="/locations" className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm">
          <MapPin size={22} className="text-emerald-600" />
          <span className="text-xs font-semibold">Locations</span>
        </Link>
        <Link href="/branding" className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white p-4 shadow-sm">
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

      {oncePassword && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-amber-900">Temporary password (copy now)</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-amber-950">
                {oncePassword}
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Shown only once. User must change it on first sign-in.
              </p>
            </div>
            <button onClick={() => setOncePassword(null)} className="p-1 text-amber-700">
              <X size={18} />
            </button>
          </div>
        </div>
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
                DB: {health.checks?.database} · Photos: {health.checks?.photoCount}
              </p>
            </div>
          )}
          <button onClick={exportCsv} className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-3 font-medium shadow-sm">
            <Download size={18} /> Export Visits CSV
          </button>
          <button onClick={cleanup} className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-3 font-medium shadow-sm">
            <Trash2 size={18} /> Run Photo Cleanup
          </button>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <UserPlus size={16} /> Add Staff
            </button>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium"
            >
              <Download size={16} /> CSV Template
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium"
            >
              <Upload size={16} /> Bulk CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onBulkFile(e.target.files[0])}
            />
          </div>

          {bulkResult?.credentialsCsv && (
            <button
              onClick={downloadCredentialsCsv}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
            >
              <Download size={16} /> Download credentials CSV ({bulkResult.createdCount})
            </button>
          )}

          {showForm && (
            <form onSubmit={createUser} className="mb-4 space-y-3 rounded-xl border p-4">
              <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full rounded-lg border px-3 py-2" required />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border px-3 py-2" required />
              <input placeholder="Phone (+234…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border px-3 py-2" />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-lg border px-3 py-2">
                <option value="STAFF">Staff</option>
                <option value="GATE">Gate Officer</option>
                <option value="ADMIN">Admin</option>
              </select>
              <input placeholder="Portfolio / Dept" value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className="w-full rounded-lg border px-3 py-2" />
              <p className="text-xs text-slate-500">Password is auto-generated (5-letter Nigerian word) and shown once.</p>
              <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-white">Create</button>
            </form>
          )}

          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                onClick={() => setSelected(u)}
                className="cursor-pointer rounded-xl border bg-white p-3 active:bg-slate-50"
              >
                <p className="font-medium">{u.fullName}</p>
                <p className="text-xs text-slate-500">
                  {u.email} · {u.role}
                  {u.phone ? ` · ${u.phone}` : ''}
                  {u.mustChangePassword ? ' · must change password' : ''}
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
                  <p className="text-xs text-slate-500">{inv.host?.fullName} · {inv.status}</p>
                </div>
                {inv.status === 'OFFLINE_PENDING' && (
                  <button onClick={() => approve(inv.id)} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-white">
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
                {a.user?.fullName || 'System'} · {new Date(a.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* User detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Staff details</h2>
              <button onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveSelected} className="space-y-3">
              <input
                value={selected.fullName || ''}
                onChange={(e) => setSelected({ ...selected, fullName: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Full name"
              />
              <input value={selected.email || ''} disabled className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-slate-500" />
              <input
                value={selected.phone || ''}
                onChange={(e) => setSelected({ ...selected, phone: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Phone"
              />
              <input
                value={selected.portfolio || ''}
                onChange={(e) => setSelected({ ...selected, portfolio: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Portfolio"
              />
              <select
                value={selected.role}
                onChange={(e) => setSelected({ ...selected, role: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="STAFF">Staff</option>
                <option value="GATE">Gate</option>
                <option value="ADMIN">Admin</option>
              </select>
              <p className="text-xs text-slate-500">
                Passwords are never shown after save. Use reset to issue a new temporary password.
              </p>
              <button type="submit" className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white">
                Save details
              </button>
              <button
                type="button"
                onClick={() => resetPw(selected.id)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 font-semibold text-amber-900"
              >
                <KeyRound size={18} /> Reset password
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
