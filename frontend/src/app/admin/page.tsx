'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, getUser } from '@/lib/api';
import { isValidEmail } from '@/lib/email';
import {
  Activity,
  BarChart3,
  Ban,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  KeyRound,
  Mail,
  MapPin,
  Palette,
  Pencil,
  Phone,
  Search,
  Shield,
  Sparkles,
  Upload,
  UserCog,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Sheet from '@/components/ui/Sheet';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import Collapse from '@/components/ui/Collapse';
import { Empty, Field, Fields, Notice } from '@/components/ui/Bits';
import PersonLink from '@/components/PersonLink';
import { InviteDetail, InviteRow, VisitorCard } from '@/components/InviteBits';
import { AUDIT_TILE, auditMeta, fieldLabel, fmtValue } from '@/components/AuditBits';
import { avatarUrl, fmtDate, inviteStatus, photoUrl, plural, relTime, titleCase } from '@/lib/format';

type Tab = 'tools' | 'users' | 'invites' | 'audit';
const PENDING = ['OFFLINE_PENDING', 'AWAITING_APPROVAL'];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition duration-300 disabled:opacity-50 ${
        checked ? 'bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-[0_6px_16px_-6px_rgb(5_150_105/0.7)]' : 'bg-slate-200'
      }`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export default function AdminPage() {
  const [me, setMe] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('tools');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'STAFF', portfolio: '', phone: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'brand'; text: string } | null>(null);
  const [oncePassword, setOncePassword] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [original, setOriginal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
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
  const [overlayMsg, setOverlayMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [userQ, setUserQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'STAFF' | 'GATE'>('ALL');
  const [auditFilter, setAuditFilter] = useState<'all' | 'gate' | 'invites' | 'people' | 'security'>('all');

  const ok = (text: string) => setMsg({ tone: 'success', text });
  const fail = (text: string) => setMsg({ tone: 'error', text });

  function loadUsers() {
    api.users().then(setUsers).catch(() => {});
  }

  useEffect(() => {
    setMe(getUser());
    loadUsers();
    api.allInvites().then(setInvites).catch(() => {});
    api.audit().then(setAudit).catch(() => {});
    api.health().then(setHealth).catch(() => {});
    api.listProfileEdits().then(setProfileEdits).catch(() => {});
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t && ['tools', 'users', 'invites', 'audit'].includes(t)) setTab(t);
    }
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(form.email)) {
      fail('Please enter a valid email address that can receive mail.');
      return;
    }
    try {
      const res = await api.createUser(form);
      ok(`${form.fullName} was added`);
      setOncePassword(res.initialPassword);
      setShowForm(false);
      setForm({ email: '', fullName: '', role: 'STAFF', portfolio: '', phone: '' });
      loadUsers();
    } catch (err: any) {
      fail(err.message);
    }
  }

  async function approve(id: string) {
    try {
      const res = await api.approveOffline(id);
      const list = await api.allInvites();
      setInvites(list);
      setDetailInvite((d: any) => (d && d.id === id ? list.find((x: any) => x.id === id) || null : d));
      ok(res?.emailsSent ? 'Invite approved — guests have been emailed their link' : 'Invite approved');
    } catch (err: any) {
      fail(err.message);
    }
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
      ok('CSV exported');
    } catch (err: any) {
      fail(err.message);
    }
  }

  async function onBulkFile(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      fail('CSV needs a header and at least one row');
      return;
    }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const idx = (name: string) => header.indexOf(name);
    const rows = lines
      .slice(1)
      .map((line) => {
        const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
        return {
          fullName: cols[idx('fullname')] || cols[0] || '',
          email: cols[idx('email')] || cols[1] || '',
          role: cols[idx('role')] || 'STAFF',
          portfolio: cols[idx('portfolio')] || '',
          phone: cols[idx('phone')] || '',
        };
      })
      .filter((r) => r.email);

    try {
      const res = await api.bulkUsers(rows);
      setBulkResult(res);
      setMsg({ tone: res.errorCount ? 'brand' : 'success', text: `Bulk import: ${res.createdCount} created, ${res.errorCount} errors` });
      loadUsers();
    } catch (err: any) {
      fail(err.message);
    }
  }

  function download(name: string, csv: string) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
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
      setOverlayMsg({ tone: 'success', text: m });
      setSelected((s: any) => (s ? { ...s, mustChangePassword: true } : s));
    } catch (err: any) {
      setOverlayMsg({ tone: 'error', text: err.message });
    }
  }

  function openUser(u: any) {
    setSelected({ ...u });
    setOriginal({ ...u });
    setOverlayMsg(null);
    setOncePassword(null);
  }

  const EDIT_FIELDS = ['fullName', 'email', 'phone', 'portfolio', 'role', 'isActive'] as const;
  const dirty = selected && original ? EDIT_FIELDS.filter((k) => (selected[k] ?? '') !== (original[k] ?? '')) : [];
  const isSelf = selected && me && selected.id === me.id;

  async function saveSelected(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !dirty.length) return;
    if (dirty.includes('email') && !isValidEmail(selected.email || '')) {
      setOverlayMsg({ tone: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setSaving(true);
    try {
      const patch: any = {};
      for (const k of dirty) patch[k] = selected[k];
      const updated = await api.updateUser(selected.id, patch);
      setOverlayMsg({ tone: 'success', text: `Saved ${dirty.map((k) => fieldLabel(k).toLowerCase()).join(', ')}` });
      setSelected({ ...selected, ...updated });
      setOriginal({ ...selected, ...updated });
      loadUsers();
      api.audit().then(setAudit).catch(() => {});
    } catch (err: any) {
      setOverlayMsg({ tone: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const t = userQ.trim().toLowerCase();
    return users.filter(
      (u) =>
        (roleFilter === 'ALL' || u.role === roleFilter) &&
        (!t || `${u.fullName} ${u.email} ${u.phone || ''} ${u.portfolio || ''}`.toLowerCase().includes(t)),
    );
  }, [users, userQ, roleFilter]);

  const filteredAudit = useMemo(
    () => audit.filter((a) => auditFilter === 'all' || auditMeta(a).group === auditFilter),
    [audit, auditFilter],
  );

  const pendingInvites = invites.filter((i) => PENDING.includes(i.status));
  const pendingEdits = profileEdits.filter((e) => e.status === 'PENDING');

  const TABS: { k: Tab; l: string; icon: any; n?: number }[] = [
    { k: 'tools', l: 'Tools', icon: Wrench, n: pendingEdits.length || undefined },
    { k: 'users', l: 'Users', icon: Users },
    { k: 'invites', l: 'Invites', icon: ClipboardList, n: pendingInvites.length || undefined },
    { k: 'audit', l: 'Audit', icon: History },
  ];

  const tools = [
    { href: '/analytics', l: 'Analytics', tip: 'Charts for visits, peak hours, hosts and gates', icon: BarChart3, tone: 'from-brand-50 to-brand-100 text-brand-600' },
    { href: '/blacklist', l: 'Blacklist', tip: 'People who must be stopped at the gate', icon: Ban, tone: 'from-rose-50 to-rose-100 text-rose-600' },
    { href: '/locations', l: 'Locations', tip: 'Sites and the gates officers scan at', icon: MapPin, tone: 'from-emerald-50 to-emerald-100 text-emerald-600' },
    { href: '/branding', l: 'Branding', tip: 'Name, logo, colours and approval rules', icon: Palette, tone: 'from-violet-50 to-violet-100 text-violet-600' },
  ];

  /* ------------------------------------------------------------ */
  const audRel = detailAudit?.related;
  const audEntity = String(detailAudit?.entity || '').toLowerCase();
  const audM = detailAudit ? auditMeta(detailAudit) : null;
  const changes: [string, { from: any; to: any }][] =
    detailAudit?.details?.changes && typeof detailAudit.details.changes === 'object' ? Object.entries(detailAudit.details.changes) : [];
  const extraDetails: [string, any][] = detailAudit?.details
    ? Object.entries(detailAudit.details).filter(([k, v]) => k !== 'changes' && v !== null && v !== undefined && v !== '' && k !== 'inviteId')
    : [];

  return (
    <div className="page">
      <PageHeader
        back="/dashboard"
        icon={<Shield size={20} />}
        title="Admin"
        eyebrow={me?.organisation?.name}
        subtitle="Control centre"
        info="Manage people, approve invites, export reports and review every action taken on Vicit."
      />

      <div className="stagger mb-5 grid grid-cols-4 gap-2">
        {tools.map((t) => (
          <Tooltip key={t.href} content={t.tip}>
            <Link href={t.href} className="card card-art group flex flex-col items-center gap-1.5 px-1 py-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${t.tone} transition duration-300 group-hover:-rotate-6 group-hover:scale-110`}>
                <t.icon size={19} />
              </span>
              <span className="text-[11px] font-semibold text-slate-700">{t.l}</span>
            </Link>
          </Tooltip>
        ))}
      </div>

      <div className="mb-4">
        <div className="segmented grid w-full grid-cols-4">
          {TABS.map((t) => (
            <button key={t.k} type="button" data-active={tab === t.k} onClick={() => setTab(t.k)} className="!flex items-center justify-center gap-1 !px-1.5">
              <t.icon size={14} className="hidden min-[400px]:block" /> {t.l}
              {t.n ? (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === t.k ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>{t.n}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {oncePassword && !selected && (
        <div className="animate-in mb-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <KeyRound size={15} /> Temporary password
                <InfoTip text="Shown only once. The user must change it on first sign-in." />
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-amber-950">{oncePassword}</p>
            </div>
            <button onClick={() => setOncePassword(null)} className="icon-btn" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ TOOLS ------------------------------ */}
      {tab === 'tools' && (
        <div className="stagger space-y-3">
          {health && (
            <div className="card card-art p-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600">
                  <Activity size={19} />
                  <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white ${health.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">System health</p>
                  <p className="text-xs text-slate-500">Database and photo storage</p>
                </div>
                <StatusPill label={titleCase(health.status)} tone={health.status === 'healthy' ? 'emerald' : 'amber'} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="tile">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Database</p>
                  <p className="text-sm font-bold capitalize text-slate-800">{health.checks?.database}</p>
                </div>
                <div className="tile">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Stored photos</p>
                  <p className="text-sm font-bold text-slate-800">{health.checks?.photoCount ?? '—'}</p>
                </div>
              </div>
            </div>
          )}

          <button type="button" onClick={() => setShowExport(true)} className="card card-art group flex w-full items-center gap-3 p-4 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 transition group-hover:scale-110">
              <FileSpreadsheet size={19} />
            </span>
            <span className="flex-1">
              <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                Export visits
                <InfoTip text="Choose columns, then download a CSV with natural dates and gate officers." />
              </span>
              <span className="block text-xs text-slate-500">{exportCols.length} columns selected</span>
            </span>
            <ChevronRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
          </button>

          <div className="surface">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600">
                <UserCog size={18} />
              </span>
              <span className="font-semibold text-slate-800">Profile change requests</span>
              <StatusPill className="ml-auto" label={`${pendingEdits.length} pending`} tone={pendingEdits.length ? 'amber' : 'slate'} />
            </div>
            {(() => {
              const pending = pendingEdits;
              if (!pending.length) return <p className="tile-muted text-center text-xs text-slate-500">No pending profile edits — you’re all caught up.</p>;
              const allSelected = pending.every((e) => selectedEdits.includes(e.id));
              const toggle = (id: string) => setSelectedEdits((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
              async function bulk(approve: boolean) {
                if (!selectedEdits.length) return;
                setBulkBusy(true);
                try {
                  await api.bulkReviewProfileEdits(selectedEdits, approve);
                  setProfileEdits(await api.listProfileEdits());
                  ok(approve ? `Approved ${selectedEdits.length} change(s)` : `Declined ${selectedEdits.length} change(s)`);
                  setSelectedEdits([]);
                } catch (err: any) {
                  fail(err.message);
                } finally {
                  setBulkBusy(false);
                }
              }
              const fieldRows = (before: any, after: any) =>
                Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
                  .filter((k) => k !== 'avatarPath')
                  .filter((k) => String(before?.[k] ?? '') !== String(after?.[k] ?? ''))
                  .map((k) => ({ key: k, from: before?.[k] ?? '—', to: after?.[k] ?? '—' }));
              return (
                <div className="space-y-3">
                  <div className="tile flex flex-wrap items-center gap-2 !py-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                      <input type="checkbox" checked={allSelected} onChange={() => setSelectedEdits(allSelected ? [] : pending.map((e) => e.id))} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                      Select all
                    </label>
                    <span className="text-xs text-slate-400">{selectedEdits.length} selected</span>
                    <div className="ml-auto flex gap-2">
                      <button type="button" disabled={!selectedEdits.length || bulkBusy} onClick={() => bulk(true)} className="btn-success !px-3 !py-1.5 !text-xs">
                        Approve
                      </button>
                      <button type="button" disabled={!selectedEdits.length || bulkBusy} onClick={() => bulk(false)} className="btn-ghost !px-3 !py-1.5 !text-xs !text-rose-600">
                        Decline
                      </button>
                    </div>
                  </div>
                  <ul className="rows">
                    {pending.map((e) => {
                      const rows = fieldRows(e.before, e.after);
                      const checked = selectedEdits.includes(e.id);
                      const who = users.find((x) => x.id === e.userId)?.fullName || e.before?.fullName;
                      return (
                        <li key={e.id} className={`p-3 text-sm ${checked ? '!bg-brand-50' : ''}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600" />
                            <Avatar name={who} size={32} />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800">{who || 'Staff member'}</p>
                              <p className="text-[11px] text-slate-400">{relTime(e.createdAt)}</p>
                              <div className="mt-1.5 space-y-1">
                                {rows.length === 0 ? (
                                  <p className="text-xs text-slate-500">No field changes listed</p>
                                ) : (
                                  rows.map((r) => (
                                    <div key={r.key} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                                      <span className="font-medium text-slate-500">{fieldLabel(r.key)}</span>
                                      <span className="text-slate-400 line-through decoration-rose-300">{String(r.from)}</span>
                                      <span className="text-slate-300">→</span>
                                      <span className="font-semibold text-emerald-700">{String(r.to)}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="ml-7 mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await api.reviewProfileEdit(e.id, true);
                                setProfileEdits(await api.listProfileEdits());
                                setSelectedEdits((s) => s.filter((x) => x !== e.id));
                                ok('Profile change approved');
                              }}
                              className="btn-success flex-1 !py-2 !text-xs"
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await api.reviewProfileEdit(e.id, false);
                                setProfileEdits(await api.listProfileEdits());
                                setSelectedEdits((s) => s.filter((x) => x !== e.id));
                                ok('Profile change declined');
                              }}
                              className="btn-ghost flex-1 !py-2 !text-xs !text-rose-600"
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

      {/* ------------------------------ USERS ------------------------------ */}
      {tab === 'users' && (
        <div className="animate-in">
          <div className="mb-3 grid grid-cols-3 gap-2">
            <button onClick={() => setShowForm(!showForm)} className="btn-primary !px-2">
              <UserPlus size={16} /> Add staff
            </button>
            <Tooltip content="Download a CSV template for bulk import">
              <button onClick={() => download('staff-import-template.csv', 'fullName,email,role,portfolio,phone\nJane Doe,jane@org.com,STAFF,HR,+2348012345678\n')} className="btn-ghost !px-2">
                <Download size={16} /> Template
              </button>
            </Tooltip>
            <Tooltip content="Upload a CSV to create many users at once">
              <button onClick={() => fileRef.current?.click()} className="btn-ghost !px-2">
                <Upload size={16} /> Bulk CSV
              </button>
            </Tooltip>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onBulkFile(e.target.files[0])} />
          </div>

          {bulkResult?.credentialsCsv && (
            <button onClick={() => download(`staff-credentials-${Date.now()}.csv`, bulkResult.credentialsCsv)} className="btn-success mb-3 w-full">
              <Download size={16} /> Download credentials CSV ({bulkResult.createdCount})
            </button>
          )}

          <Collapse open={showForm}>
            <form onSubmit={createUser} className="surface mb-4 space-y-3">
              <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Sparkles size={15} className="text-brand-500" /> New team member
                <InfoTip text="A password is auto-generated (5-letter Nigerian word) and shown once after creation." />
              </p>
              <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" required />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" required />
              <input placeholder="Phone (+234…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
                <option value="STAFF">Staff</option>
                <option value="GATE">Gate officer</option>
                <option value="ADMIN">Admin</option>
              </select>
              <input placeholder="Portfolio / department" value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} className="input" />
              <button type="submit" className="btn-primary w-full">
                Create user
              </button>
            </form>
          </Collapse>

          <div className="mb-3 space-y-2">
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input !py-2.5 pl-10" placeholder="Search name, email, phone" value={userQ} onChange={(e) => setUserQ(e.target.value)} />
            </label>
            <div className="segmented">
              {(['ALL', 'ADMIN', 'STAFF', 'GATE'] as const).map((r) => (
                <button key={r} type="button" data-active={roleFilter === r} onClick={() => setRoleFilter(r)}>
                  {r === 'ALL' ? `All ${users.length}` : r === 'GATE' ? 'Gate' : titleCase(r)}
                </button>
              ))}
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <Empty icon={<Users size={24} />} title="No users match" />
          ) : (
            <ul className="rows stagger">
              {filteredUsers.map((u) => (
                <li key={u.id} className="group flex items-center gap-3 px-3.5 py-3">
                  <button type="button" onClick={() => openUser(u)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="relative">
                      <Avatar name={u.fullName} src={avatarUrl(u.avatarPath)} size={42} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${u.isActive === false ? 'bg-slate-300' : 'bg-emerald-500'}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800 transition group-hover:text-brand-700">{u.fullName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {u.email}
                        {u.portfolio ? ` · ${u.portfolio}` : ''}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                          <StatusPill status={u.role} className="!py-0 !text-[10px]" />
                          {u.isActive === false && <StatusPill label="Deactivated" tone="slate" className="!py-0 !text-[10px]" />}
                          {u.mustChangePassword && <StatusPill label="Temp password" tone="amber" className="!py-0 !text-[10px]" />}
                        </span>
                    </span>
                  </button>
                  <Tooltip content="Preview profile">
                    <Link href={`/u/${u.id}`} className="icon-btn" aria-label={`Preview ${u.fullName}`}>
                      <Eye size={16} />
                    </Link>
                  </Tooltip>
                  <Tooltip content="Edit user">
                    <button type="button" onClick={() => openUser(u)} className="icon-btn" aria-label={`Edit ${u.fullName}`}>
                      <Pencil size={15} />
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------ INVITES ------------------------------ */}
      {tab === 'invites' && (
        <div className="animate-in space-y-4">
          {pendingInvites.length > 0 && (
            <div className="surface !border-amber-200/70 !p-3">
              <p className="section-title !text-amber-700">Awaiting your approval</p>
              <ul className="rows">
                {pendingInvites.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 pr-3">
                    <div className="min-w-0 flex-1">
                      <ul>
                        <InviteRow inv={inv} showHost onClick={() => setDetailInvite(inv)} />
                      </ul>
                    </div>
                    <Tooltip content={inv.status === 'OFFLINE_PENDING' ? 'Approve walk-in' : 'Approve and email guests'}>
                      <button onClick={() => approve(inv.id)} className="btn-success !px-3 !py-1.5 !text-xs">
                        <Check size={14} /> Approve
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="section-title">All invites · {invites.length}</p>
            {invites.length === 0 ? (
              <Empty icon={<ClipboardList size={24} />} title="No invites yet" />
            ) : (
              <ul className="rows stagger">
                {invites.map((inv) => (
                  <InviteRow key={inv.id} inv={inv} showHost onClick={() => setDetailInvite(inv)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------ AUDIT ------------------------------ */}
      {tab === 'audit' && (
        <div className="animate-in">
          <div className="-mx-4 mb-3 overflow-x-auto px-4">
            <div className="segmented">
              {(
                [
                  ['all', 'All'],
                  ['gate', 'Gate'],
                  ['invites', 'Invites'],
                  ['people', 'People'],
                  ['security', 'Security'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" data-active={auditFilter === k} onClick={() => setAuditFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {filteredAudit.length === 0 ? (
            <Empty icon={<History size={24} />} title="No activity recorded" />
          ) : (
            <ul className="rows stagger">
              {filteredAudit.map((a) => {
                const m = auditMeta(a);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => setDetailAudit(a)} className="row-link group items-start">
                      <span className="relative mt-0.5">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${AUDIT_TILE[m.tone]} transition duration-300 group-hover:scale-105`}>
                          {m.icon}
                        </span>
                        <Avatar name={a.user?.fullName || 'System'} src={avatarUrl(a.user?.avatarPath)} size={20} className="!absolute -bottom-1.5 -right-1.5 !text-[8px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m.label}</span>
                          <Tooltip content={fmtDate(a.createdAt)}>
                            <span className="ml-auto shrink-0 text-[11px] text-slate-400">{relTime(a.createdAt)}</span>
                          </Tooltip>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-sm font-medium text-slate-800">{m.text(a)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ------------------------------ USER EDIT SHEET ------------------------------ */}
      <Sheet
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setOverlayMsg(null);
          setOncePassword(null);
        }}
        icon={<Pencil size={18} />}
        title={original?.fullName || 'Edit user'}
        subtitle={
          original && (
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={original.role} />
              <span className="whitespace-nowrap text-xs text-slate-400">
                {[original.createdAt && `Joined ${relTime(original.createdAt)}`, original._count?.invites != null && plural(original._count.invites, 'invite')].filter(Boolean).join(' · ')}
              </span>
            </span>
          )
        }
        footer={
          selected && (
            <div className="flex gap-2">
              <Link href={`/u/${selected.id}`} className="btn-ghost">
                <Eye size={16} /> Preview
              </Link>
              <button type="submit" form="user-edit" disabled={!dirty.length || saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : dirty.length ? `Save ${dirty.length} change${dirty.length > 1 ? 's' : ''}` : 'No changes'}
              </button>
            </div>
          )
        }
      >
        {selected && (
          <form id="user-edit" onSubmit={saveSelected} className="space-y-3">
            {overlayMsg && <Notice tone={overlayMsg.tone}>{overlayMsg.text}</Notice>}
            <div className="flex items-center gap-3 tile">
              <Avatar name={selected.fullName} src={avatarUrl(selected.avatarPath)} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">{selected.fullName || '—'}</p>
                <p className="truncate text-xs text-slate-500">{selected.email}</p>
              </div>
            </div>
            <label className="block">
              <span className="label">Full name</span>
              <input value={selected.fullName || ''} onChange={(e) => setSelected({ ...selected, fullName: e.target.value })} className="input" required />
            </label>
            <label className="block">
              <span className="label">
                <Mail size={13} /> Email
                <InfoTip text="Used to sign in and to receive invites and alerts. Must be unique." />
              </span>
              <input type="email" value={selected.email || ''} onChange={(e) => setSelected({ ...selected, email: e.target.value })} className="input" required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">
                  <Phone size={13} /> Phone
                </span>
                <input value={selected.phone || ''} onChange={(e) => setSelected({ ...selected, phone: e.target.value })} className="input" placeholder="+234…" />
              </label>
              <label className="block">
                <span className="label">Portfolio</span>
                <input value={selected.portfolio || ''} onChange={(e) => setSelected({ ...selected, portfolio: e.target.value })} className="input" placeholder="Department" />
              </label>
            </div>
            <div>
              <span className="label">
                Role
                <InfoTip text={isSelf ? 'You cannot change your own role.' : 'Admins manage everything; gate officers scan and admit; staff invite guests.'} />
              </span>
              <div className="segmented w-full">
                {(['STAFF', 'GATE', 'ADMIN'] as const).map((r) => (
                  <button key={r} type="button" disabled={!!isSelf} data-active={selected.role === r} onClick={() => setSelected({ ...selected, role: r })} className="flex-1 disabled:opacity-50">
                    {r === 'GATE' ? 'Gate officer' : titleCase(r)}
                  </button>
                ))}
              </div>
            </div>
            <div className="tile-muted flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Account active</p>
                <p className="text-xs text-slate-500">{selected.isActive === false ? 'This user cannot sign in.' : 'This user can sign in.'}</p>
              </div>
              <Tooltip content={isSelf ? 'You cannot deactivate yourself' : selected.isActive === false ? 'Reactivate account' : 'Deactivate account'}>
                <span>
                  <Toggle checked={selected.isActive !== false} disabled={!!isSelf} onChange={(v) => setSelected({ ...selected, isActive: v })} />
                </span>
              </Tooltip>
            </div>
            {dirty.length > 0 && (
              <div className="animate-in rounded-2xl border border-brand-100 bg-brand-50/60 p-3 text-xs">
                <p className="mb-1 font-semibold text-brand-800">Pending changes</p>
                {dirty.map((k) => (
                  <p key={k} className="text-slate-600">
                    <span className="font-medium">{fieldLabel(k)}:</span>{' '}
                    <span className="text-slate-400 line-through">{fmtValue(original?.[k])}</span> → <span className="font-semibold text-emerald-700">{fmtValue(selected[k])}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="border-t border-slate-100 pt-3">
              {oncePassword && (
                <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Temporary password (copy now)</p>
                  <p className="mt-1 font-mono text-xl font-bold tracking-widest">{oncePassword}</p>
                </div>
              )}
              <button type="button" onClick={() => resetPw(selected.id)} className="btn w-full border border-amber-200 bg-gradient-to-r from-amber-50 to-white text-amber-900 hover:border-amber-300 hover:from-amber-100">
                <KeyRound size={17} /> Reset password
                <InfoTip text="Issues a new temporary password. Passwords are never shown after save." />
              </button>
            </div>
          </form>
        )}
      </Sheet>

      {/* ------------------------------ EXPORT SHEET ------------------------------ */}
      <Sheet
        open={showExport}
        onClose={() => setShowExport(false)}
        icon={<FileSpreadsheet size={20} />}
        title="Export visits"
        subtitle="Pick the columns for your CSV"
        footer={
          <button type="button" onClick={exportCsv} disabled={!exportCols.length} className="btn-primary w-full">
            <Download size={16} /> Download CSV
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
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
            ['entryOfficer', 'Entry officer'],
            ['exitOfficer', 'Exit officer'],
            ['createdAt', 'Registered'],
          ].map(([id, label]) => {
            const on = exportCols.includes(id);
            return (
              <label key={id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${on ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-100'}`}>
                <input type="checkbox" checked={on} onChange={(e) => setExportCols((p) => (e.target.checked ? [...p, id] : p.filter((c) => c !== id)))} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                {label}
              </label>
            );
          })}
        </div>
      </Sheet>

      {/* ------------------------------ INVITE SHEET ------------------------------ */}
      <Sheet
        open={!!detailInvite}
        onClose={() => setDetailInvite(null)}
        tone={detailInvite && PENDING.includes(detailInvite.status) ? 'amber' : 'brand'}
        icon={<ClipboardList size={20} />}
        title={detailInvite?.purpose}
        subtitle={detailInvite && <StatusPill status={inviteStatus(detailInvite)} />}
        footer={
          detailInvite &&
          (PENDING.includes(detailInvite.status) ? (
            <button type="button" onClick={() => approve(detailInvite.id)} className="btn-success w-full">
              <Check size={16} /> Approve {detailInvite.status === 'OFFLINE_PENDING' ? 'walk-in' : 'and email guests'}
            </button>
          ) : (detailInvite.status === 'EXPIRED' || (detailInvite.expiresAt && new Date(detailInvite.expiresAt) < new Date())) &&
            !(detailInvite.visitors || []).every((v: any) => v.photoPath) ? (
            <button
              type="button"
              onClick={async () => {
                await api.reviveInvite(detailInvite.id);
                setInvites(await api.allInvites());
                setDetailInvite(null);
                ok('Invite link revived');
              }}
              className="btn-primary w-full"
            >
              Revive expired link
            </button>
          ) : undefined)
        }
      >
        {detailInvite && <InviteDetail inv={detailInvite} />}
      </Sheet>

      {/* ------------------------------ AUDIT SHEET ------------------------------ */}
      <Sheet open={!!detailAudit} onClose={() => setDetailAudit(null)} tone={audM?.tone} icon={audM?.icon} title={audM?.label} subtitle={detailAudit && `${fmtDate(detailAudit.createdAt)} · ${relTime(detailAudit.createdAt)}`}>
        {detailAudit && audM && (
          <div className="space-y-4">
            <div className="card card-art p-4">
              <p className="text-[15px] font-medium leading-relaxed text-slate-800">{audM.text(detailAudit)}</p>
              <div className="mt-3 flex items-center gap-2.5 border-t border-slate-100 pt-3">
                <Avatar name={detailAudit.user?.fullName || 'System'} src={avatarUrl(detailAudit.user?.avatarPath)} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Performed by</p>
                  <p className="truncate text-sm font-semibold">
                    {detailAudit.user?.id ? <PersonLink id={detailAudit.user.id} name={detailAudit.user.fullName} /> : 'System (automatic)'}
                  </p>
                </div>
                {detailAudit.user?.role && <StatusPill status={detailAudit.user.role} />}
              </div>
            </div>

            {changes.length > 0 && (
              <div>
                <p className="section-title">What changed</p>
                <div className="rows">
                  {changes.map(([k, c]) => (
                    <div key={k} className="grid grid-cols-[96px_1fr] items-center gap-2 px-3.5 py-2.5 text-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{fieldLabel(k)}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-rose-700 line-through decoration-rose-300">{fmtValue(c?.from)}</span>
                        <ChevronRight size={14} className="text-slate-300" />
                        <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{fmtValue(c?.to)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extraDetails.length > 0 && (
              <div>
                <p className="section-title">Event details</p>
                <Fields>
                  {extraDetails.map(([k, v]) => (
                    <Field key={k} label={fieldLabel(k)}>
                      {fmtValue(v)}
                    </Field>
                  ))}
                </Fields>
              </div>
            )}

            {audRel && (
              <div>
                <p className="section-title">
                  {audEntity === 'visitor' ? 'Visitor record' : audEntity === 'invite' ? 'Invite record' : audEntity === 'user' ? 'User record' : audEntity === 'blacklistentry' ? 'Blacklist entry' : 'Related record'}
                </p>
                {audEntity === 'visitor' && (
                  <div className="space-y-3">
                    <VisitorCard v={audRel} />
                    <Fields>
                      <Field label="Visit">{audRel.invite?.purpose}</Field>
                      <Field label="Host">{audRel.invite?.host && <PersonLink id={audRel.invite.host.id} name={audRel.invite.host.fullName} />}</Field>
                      <Field label="Email">{audRel.email}</Field>
                      <Field label="Address">{audRel.address}</Field>
                    </Fields>
                  </div>
                )}
                {audEntity === 'invite' && <InviteDetail inv={audRel} />}
                {audEntity === 'user' && (
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={audRel.fullName} src={avatarUrl(audRel.avatarPath)} size={46} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{audRel.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{audRel.email}</p>
                      </div>
                      <StatusPill status={audRel.role} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="tile !p-2">
                        <p className="text-[10px] uppercase text-slate-500">Phone</p>
                        <p className="truncate text-xs font-semibold">{audRel.phone || '—'}</p>
                      </div>
                      <div className="tile !p-2">
                        <p className="text-[10px] uppercase text-slate-500">Portfolio</p>
                        <p className="truncate text-xs font-semibold">{audRel.portfolio || '—'}</p>
                      </div>
                      <div className="tile !p-2">
                        <p className="text-[10px] uppercase text-slate-500">Active</p>
                        <p className="text-xs font-semibold">{audRel.isActive ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/u/${audRel.id}`} className="btn-ghost flex-1 !py-2">
                        <Eye size={15} /> Preview
                      </Link>
                      <button type="button" className="btn-soft flex-1 !py-2" onClick={() => { const u = users.find((x) => x.id === audRel.id); if (u) { setDetailAudit(null); setTab('users'); openUser(u); } }}>
                        <Pencil size={14} /> Edit
                      </button>
                    </div>
                  </div>
                )}
                {audEntity === 'blacklistentry' && (
                  <Fields>
                    <Field label="Name">{audRel.fullName}</Field>
                    <Field label="Phone">{audRel.phone}</Field>
                    <Field label="ID number">{audRel.idNumber}</Field>
                    <Field label="Reason">{audRel.reason}</Field>
                    <Field label="Status">
                      <StatusPill label={audRel.isActive ? 'Active' : 'Lifted'} tone={audRel.isActive ? 'rose' : 'slate'} />
                    </Field>
                  </Fields>
                )}
              </div>
            )}
            {!audRel && detailAudit.entityId && (
              <p className="tile-muted text-center text-xs text-slate-500">The related {String(detailAudit.entity || 'record').toLowerCase()} is no longer available.</p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
