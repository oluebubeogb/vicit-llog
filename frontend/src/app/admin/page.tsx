'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { isValidEmail } from '@/lib/email';
import {
  ArrowLeft,
  UserPlus,
  BarChart3,
  Ban,
  MapPin,
  Palette,
  Download,
  Activity,
  Upload,
  KeyRound,
  X,
  UserCog,
  Check,
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
  const [showExport, setShowExport] = useState(false);
  const [exportCols, setExportCols] = useState<string[]>([
    'fullName', 'status', 'purpose', 'category', 'host', 'entryMode',
    'enteredAt', 'exitedAt', 'entryOfficer', 'exitOfficer', 'createdAt',
  ]);
  const [profileEdits, setProfileEdits] = useState<any[]>([]);
  const [selectedEdits, setSelectedEdits] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [detailInvite, setDetailInvite] = useState<any | null>(null);
  const [detailAudit, setDetailAudit] = useState<any | null>(null);
  const [overlayMsg, setOverlayMsg] = useState('');

  function loadUsers() {
    api.users().then(setUsers).catch(() => {});
  }

  useEffect(() => {
    loadUsers();
    api.allInvites().then(setInvites).catch(() => {});
    api.audit().then(setAudit).catch(() => {});
    api.health().then(setHealth).catch(() => {});
    api.listProfileEdits().then(setProfileEdits).catch(() => {});
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(form.email)) {
      setMsg('Please enter a valid email address that can receive mail.');
      return;
    }
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
      const csv = await api.exportCsv(undefined, undefined, exportCols);
      const blob = new Blob([csv as string], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vicit-visits-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExport(false);
      setMsg('CSV exported');
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
      const m = res.initialPassword
        ? `Password reset for ${res.email}. Temporary password shown below — copy it now.`
        : `Password reset for ${res.email}. A temporary password was emailed to the user.`;
      setOverlayMsg(m);
      setMsg(m);
      setSelected((s: any) => (s ? { ...s, mustChangePassword: true } : s));
    } catch (err: any) {
      setOverlayMsg(err.message);
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

  function formatAuditDetails(details: any): { label: string; value: string }[] {
    if (!details || typeof details !== 'object') return [];
    const rows: { label: string; value: string }[] = [];
    for (const [k, v] of Object.entries(details)) {
      if (v === null || v === undefined || v === '') continue;
      const label = k
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      let value: string;
      if (typeof v === 'object') {
        value = Object.entries(v as object)
          .map(([ik, iv]) => `${ik}: ${iv}`)
          .join(', ');
      } else {
        value = String(v);
      }
      rows.push({ label, value });
    }
    return rows;
  }

  function entityHref(entity?: string, entityId?: string) {
    if (!entityId) return null;
    const e = (entity || '').toLowerCase();
    if (e === 'visitor') return `/visitors?id=${entityId}`;
    if (e === 'invite') return `/visitors?invite=${entityId}`;
    if (e === 'user') return `/u/${entityId}`;
    return null;
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
            <div className="rounded-xl border bg-white p-4 card-hover">
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
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="w-full rounded-xl border bg-white p-4 text-left shadow-sm card-hover"
          >
            <div className="mb-1 flex items-center gap-2">
              <Download size={18} className="text-brand-600" />
              <span className="font-semibold">Export Visits CSV</span>
            </div>
            <p className="text-xs text-slate-500">
              Choose columns, then download a report with natural dates and gate officers.
            </p>
          </button>
                    <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <UserCog size={18} className="text-violet-600" />
              <span className="font-semibold">Profile change requests</span>
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                {profileEdits.filter((e) => e.status === 'PENDING').length} pending
              </span>
            </div>
            {(() => {
              const pending = profileEdits.filter((e) => e.status === 'PENDING');
              if (!pending.length) {
                return <p className="text-xs text-slate-400">No pending profile edits</p>;
              }
              const allSelected =
                pending.length > 0 && pending.every((e) => selectedEdits.includes(e.id));
              function toggle(id: string) {
                setSelectedEdits((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                );
              }
              function toggleAll() {
                setSelectedEdits(allSelected ? [] : pending.map((e) => e.id));
              }
              async function bulk(approve: boolean) {
                if (!selectedEdits.length) return;
                setBulkBusy(true);
                try {
                  await api.bulkReviewProfileEdits(selectedEdits, approve);
                  setProfileEdits(await api.listProfileEdits());
                  setSelectedEdits([]);
                  setMsg(
                    approve
                      ? `Approved ${selectedEdits.length} change(s)`
                      : `Declined ${selectedEdits.length} change(s)`,
                  );
                } catch (err: any) {
                  setMsg(err.message);
                } finally {
                  setBulkBusy(false);
                }
              }
              function fieldRows(before: any, after: any) {
                const keys = Array.from(
                  new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
                ).filter((k) => k !== 'avatarPath');
                return keys
                  .filter((k) => String(before?.[k] ?? '') !== String(after?.[k] ?? ''))
                  .map((k) => ({
                    key: k,
                    from: before?.[k] ?? '—',
                    to: after?.[k] ?? '—',
                  }));
              }
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      Select all
                    </label>
                    <span className="text-xs text-slate-400">
                      {selectedEdits.length} selected
                    </span>
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        disabled={!selectedEdits.length || bulkBusy}
                        onClick={() => bulk(true)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Approve selected
                      </button>
                      <button
                        type="button"
                        disabled={!selectedEdits.length || bulkBusy}
                        onClick={() => bulk(false)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-40"
                      >
                        Decline selected
                      </button>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {pending.map((e) => {
                      const rows = fieldRows(e.before, e.after);
                      const checked = selectedEdits.includes(e.id);
                      return (
                        <li
                          key={e.id}
                          className={`rounded-xl border p-3 text-sm transition ${
                            checked
                              ? 'border-brand-200 bg-brand-50/40'
                              : 'border-slate-100 bg-slate-50'
                          }`}
                        >
                          <div className="mb-2 flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(e.id)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-400">
                                {new Date(e.createdAt).toLocaleString()}
                              </p>
                              {rows.length === 0 ? (
                                <p className="mt-1 text-xs text-slate-500">No field changes listed</p>
                              ) : (
                                <div className="mt-1.5 space-y-1">
                                  {rows.map((r) => (
                                    <div
                                      key={r.key}
                                      className="flex flex-wrap items-baseline gap-x-2 text-xs"
                                    >
                                      <span className="font-medium capitalize text-slate-500">
                                        {r.key}
                                      </span>
                                      <span className="text-slate-400 line-through">
                                        {String(r.from)}
                                      </span>
                                      <span className="text-slate-300">→</span>
                                      <span className="font-medium text-slate-800">
                                        {String(r.to)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="ml-7 flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await api.reviewProfileEdit(e.id, true);
                                setProfileEdits(await api.listProfileEdits());
                                setSelectedEdits((s) => s.filter((x) => x !== e.id));
                                setMsg('Profile change approved');
                              }}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white"
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await api.reviewProfileEdit(e.id, false);
                                setProfileEdits(await api.listProfileEdits());
                                setSelectedEdits((s) => s.filter((x) => x !== e.id));
                                setMsg('Profile change declined');
                              }}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-600"
                            >
                              Decline
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}
          </div>
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
            <li
              key={inv.id}
              onClick={() => setDetailInvite(inv)}
              className="rounded-xl border bg-white p-3 row-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{inv.purpose}</p>
                  <p className="text-xs text-slate-500">
                    {inv.host?.fullName} · {inv.status}
                    {inv.category ? ` · ${inv.category}` : ''}
                  </p>
                </div>
                {inv.status === 'OFFLINE_PENDING' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      approve(inv.id);
                    }}
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
            <li
              key={a.id}
              onClick={() => setDetailAudit(a)}
              className="rounded-xl border bg-white p-3 text-sm row-hover"
            >
              <p className="font-medium">{String(a.action || '').replace(/_/g, ' ')}</p>
              <p className="text-xs text-slate-500">
                {a.entity || '—'}
                {a.user?.fullName ? ` · ${a.user.fullName}` : ' · System'}
                {' · '}
                {new Date(a.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* User detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Staff details</h2>
              <button onClick={() => { setSelected(null); setOverlayMsg(''); setOncePassword(null); }} className="rounded-full p-2 hover:bg-slate-100">
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
              {overlayMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {overlayMsg}
                </div>
              )}
              {oncePassword && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Temporary password (copy now)</p>
                  <p className="mt-1 font-mono text-xl font-bold tracking-widest">{oncePassword}</p>
                </div>
              )}
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

      {/* Export columns modal */}
      {showExport && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Export Visits CSV</h2>
              <button onClick={() => setShowExport(false)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500">Select columns to include</p>
            <div className="space-y-2">
              {[
                ['fullName', 'Visitor name'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['status', 'Status'],
                ['purpose', 'Purpose'],
                ['category', 'Category'],
                ['host', 'Host'],
                ['entryMode', 'Entry mode'],
                ['enteredAt', 'Entered'],
                ['exitedAt', 'Exited'],
                ['deniedAt', 'Declined at'],
                ['deniedReason', 'Decline reason'],
                ['entryOfficer', 'Entry gate officer'],
                ['exitOfficer', 'Exit gate officer'],
                ['createdAt', 'Registered'],
              ].map(([id, label]) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exportCols.includes(id)}
                    onChange={(e) => {
                      setExportCols((prev) =>
                        e.target.checked ? [...prev, id] : prev.filter((c) => c !== id),
                      );
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!exportCols.length}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
        </div>
      )}

      {/* Invite detail */}
      {detailInvite && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Invite details</h2>
              <button onClick={() => setDetailInvite(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-slate-400">Purpose</dt><dd className="font-medium">{detailInvite.purpose}</dd></div>
              <div><dt className="text-xs text-slate-400">Category</dt><dd>{detailInvite.category || '—'}</dd></div>
              <div><dt className="text-xs text-slate-400">Status</dt><dd>{detailInvite.status}</dd></div>
              <div><dt className="text-xs text-slate-400">Host</dt><dd>{detailInvite.host?.id ? <a href={`/u/${detailInvite.host.id}`} className="text-brand-600 underline">{detailInvite.host.fullName}</a> : detailInvite.host?.fullName}</dd></div>
              <div><dt className="text-xs text-slate-400">Passphrase</dt><dd className="font-mono">{detailInvite.passphrase}</dd></div>
              <div><dt className="text-xs text-slate-400">Expires</dt><dd>{detailInvite.expiresAt ? new Date(detailInvite.expiresAt).toLocaleString() : '—'}</dd></div>
              <div><dt className="text-xs text-slate-400">Created</dt><dd>{new Date(detailInvite.createdAt).toLocaleString()}</dd></div>
            </dl>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-400">Guests</p>
              {(detailInvite.visitors || []).map((v: any) => (
                <div key={v.id} className="rounded-lg border p-2 text-sm">
                  <p className="font-medium">{v.fullName}</p>
                  <p className="text-xs text-slate-500">{v.status}{v.email ? ` · ${v.email}` : ''}</p>
                </div>
              ))}
            </div>
            {(detailInvite.status === 'EXPIRED' ||
              (detailInvite.expiresAt && new Date(detailInvite.expiresAt) < new Date())) &&
              !(detailInvite.visitors || []).every((v: any) => v.photoPath) && (
              <button
                type="button"
                onClick={async () => {
                  await api.reviveInvite(detailInvite.id);
                  setInvites(await api.allInvites());
                  setDetailInvite(null);
                  setMsg('Invite link revived');
                }}
                className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white"
              >
                Revive expired link
              </button>
            )}
          </div>
        </div>
      )}

      {/* Audit detail — full related record inline */}
      {detailAudit && (() => {
        const rel = detailAudit.related;
        const entity = String(detailAudit.entity || '').toLowerCase();
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const photo =
          rel?.photoPath
            ? `${API}/visitors/photo/${rel.photoPath}`
            : rel?.avatarPath
              ? `${API}/users/avatar/${rel.avatarPath}`
              : null;
        return (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Audit entry</h2>
                <button onClick={() => setDetailAudit(null)} className="rounded-full p-2 hover:bg-slate-100">
                  <X size={20} />
                </button>
              </div>

              <dl className="mb-5 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Action</dt>
                  <dd className="font-medium">
                    {String(detailAudit.action || '').replace(/_/g, ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">When</dt>
                  <dd>{new Date(detailAudit.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Performed by</dt>
                  <dd>
                    {detailAudit.user?.id ? (
                      <a href={`/u/${detailAudit.user.id}`} className="font-medium text-brand-600 underline">
                        {detailAudit.user.fullName}
                      </a>
                    ) : (
                      detailAudit.user?.fullName || 'System'
                    )}
                  </dd>
                </div>
                {formatAuditDetails(detailAudit.details).length > 0 && (
                  <div>
                    <dt className="mb-1 text-xs text-slate-400">Event details</dt>
                    <dd className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      {formatAuditDetails(detailAudit.details).map((row) => (
                        <div key={row.label} className="flex justify-between gap-3 text-sm">
                          <span className="text-slate-500">{row.label}</span>
                          <span className="text-right font-medium text-slate-800">{row.value}</span>
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              {rel && (
                <>
                  <hr className="mb-4 border-slate-100" />
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {entity === 'visitor'
                      ? 'Visitor record'
                      : entity === 'invite'
                        ? 'Invite record'
                        : entity === 'user'
                          ? 'User record'
                          : 'Related record'}
                  </p>

                  {photo && (
                    <div className="mb-4 flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt=""
                        className="h-28 w-28 rounded-2xl object-cover shadow-sm"
                      />
                    </div>
                  )}

                  {/* Visitor */}
                  {entity === 'visitor' && (
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400">Name</dt>
                        <dd className="font-medium">{rel.fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Status</dt>
                        <dd>{rel.status || '—'}</dd>
                      </div>
                      {rel.email && (
                        <div>
                          <dt className="text-xs text-slate-400">Email</dt>
                          <dd>{rel.email}</dd>
                        </div>
                      )}
                      {rel.phone && (
                        <div>
                          <dt className="text-xs text-slate-400">Phone</dt>
                          <dd>{rel.phone}</dd>
                        </div>
                      )}
                      {rel.address && (
                        <div>
                          <dt className="text-xs text-slate-400">Address</dt>
                          <dd>{rel.address}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs text-slate-400">Purpose</dt>
                        <dd>{rel.invite?.purpose || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Category</dt>
                        <dd>{rel.invite?.category || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Host</dt>
                        <dd>
                          {rel.invite?.host?.id ? (
                            <a href={`/u/${rel.invite.host.id}`} className="text-brand-600 underline">
                              {rel.invite.host.fullName}
                            </a>
                          ) : (
                            rel.invite?.host?.fullName || '—'
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Expected mode</dt>
                        <dd>{rel.invite?.expectedMode || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Actual mode</dt>
                        <dd>{rel.entryMode || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Entered</dt>
                        <dd>
                          {rel.enteredAt
                            ? new Date(rel.enteredAt).toLocaleString()
                            : '—'}

                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Exited</dt>
                        <dd>
                          {rel.exitedAt
                            ? new Date(rel.exitedAt).toLocaleString()
                            : '—'}

                        </dd>
                      </div>
                      {rel.deniedReason && (
                        <div>
                          <dt className="text-xs text-slate-400">Decline reason</dt>
                          <dd className="text-red-700">{rel.deniedReason}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {/* Invite */}
                  {entity === 'invite' && (
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400">Purpose</dt>
                        <dd className="font-medium">{rel.purpose || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Category</dt>
                        <dd>{rel.category || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Status</dt>
                        <dd>{rel.status || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Expected mode</dt>
                        <dd>{rel.expectedMode || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Expected at</dt>
                        <dd>
                          {rel.expectedAt
                            ? new Date(rel.expectedAt).toLocaleString()
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Host</dt>
                        <dd>
                          {rel.host?.id ? (
                            <a href={`/u/${rel.host.id}`} className="text-brand-600 underline">
                              {rel.host.fullName}
                            </a>
                          ) : (
                            rel.host?.fullName || '—'
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Created</dt>
                        <dd>
                          {rel.createdAt
                            ? new Date(rel.createdAt).toLocaleString()
                            : '—'}
                        </dd>
                      </div>
                      {Array.isArray(rel.visitors) && rel.visitors.length > 0 && (
                        <div>
                          <dt className="mb-1 text-xs text-slate-400">Guests</dt>
                          <dd className="space-y-1.5">
                            {rel.visitors.map((g: any) => (
                              <div
                                key={g.id}
                                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                              >
                                {g.photoPath ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={`${API}/visitors/photo/${g.photoPath}`}
                                    alt=""
                                    className="h-8 w-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-400">
                                    ?
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{g.fullName}</p>
                                  <p className="text-xs text-slate-400">{g.status}</p>
                                </div>
                              </div>
                            ))}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {/* User */}
                  {entity === 'user' && (
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-400">Name</dt>
                        <dd className="font-medium">{rel.fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Email</dt>
                        <dd>{rel.email || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Phone</dt>
                        <dd>{rel.phone || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Portfolio</dt>
                        <dd>{rel.portfolio || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Role</dt>
                        <dd>{rel.role || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Active</dt>
                        <dd>{rel.isActive ? 'Yes' : 'No'}</dd>
                      </div>
                    </dl>
                  )}
                </>
              )}

              {!rel && detailAudit.entityId && (
                <p className="rounded-xl bg-slate-50 py-4 text-center text-xs text-slate-400">
                  Related {detailAudit.entity || 'record'} is no longer available
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

