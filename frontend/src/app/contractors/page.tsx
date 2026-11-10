'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Plus, Search } from 'lucide-react';
import { api, getUser } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { Notice, SkeletonList } from '@/components/ui/Bits';
import SleekOverlay from '@/components/ui/SleekOverlay';
import StatusPill from '@/components/ui/StatusPill';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ContractorsPage() {
  const user = getUser();
  const canManage = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'ADMIN'].includes(String(user?.role));
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const rows = await api.contractors({ q, status: status === 'all' ? '' : status });
    setData(rows);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [q, status]);

  return (
    <div className="page">
      <PageHeader
        icon={<Briefcase size={20} />}
        title="Contractors"
        subtitle="Duration-based ID cards. No login required."
        info="Only Super Admins, agency admins and gate officers can open a contractor's long-tail profile."
        actions={canManage ? (
          <button type="button" className="btn-primary !px-3 !py-2 text-sm" onClick={() => setOpen(true)}>
            <Plus size={15} /> New
          </button>
        ) : undefined}
      />

      <div className="mb-3 flex gap-2">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder="Search name, company, phone" />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-32">
          <option value="all">All</option>
          <option value="active">Valid</option>
          <option value="expired">Expired</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && <SkeletonList />}
      <ul className="space-y-2">
        {(data?.rows || []).map((c: any) => (
          <li key={c.id}>
            <Link href={`/contractors/${c.token}`} className="tile flex items-center gap-3 hover:shadow-soft">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-brand-700">
                {c.photoPath ? <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/contractors/photo/${c.photoPath}`} alt="" className="h-full w-full object-cover" /> : <Briefcase size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm text-slate-900">{c.fullName}</b>
                <span className="block truncate text-xs text-slate-500">{[c.company, c.organisation?.name].filter(Boolean).join(' · ')}</span>
              </span>
              <StatusPill tone={c.status === 'valid' ? 'emerald' : c.status === 'expired' ? 'rose' : 'slate'} label={c.status === 'valid' ? 'Valid' : c.status === 'expired' ? 'Expired' : c.status} />
            </Link>
          </li>
        ))}
      </ul>
      {data && !data.rows?.length && <p className="py-10 text-center text-sm text-slate-500">No contractors match.</p>}

      <ContractorForm open={open} onClose={() => setOpen(false)} minDays={data?.minDays || 1} onCreated={() => { setOpen(false); load(); }} />
    </div>
  );
}

function ContractorForm({ open, onClose, minDays, onCreated }: { open: boolean; onClose: () => void; minDays: number; onCreated: () => void }) {
  const user = getUser();
  const [agencies, setAgencies] = useState<any[]>([]);
  const [form, setForm] = useState({ fullName: '', company: '', phone: '', email: '', organisationId: '', validFrom: isoDate(new Date()), validThrough: isoDate(new Date(Date.now() + minDays * 86400000)) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) api.directoryAgencies().then(setAgencies).catch(() => {}); }, [open]);
  useEffect(() => { setForm((f) => ({ ...f, validThrough: isoDate(new Date(new Date(f.validFrom).getTime() + minDays * 86400000)) })); }, [minDays]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const row = await api.createContractor({ ...form, organisationId: form.organisationId || user?.organisationId });
      onCreated();
      if (row?.token) window.location.href = `/contractors/${row.token}`;
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <SleekOverlay open={open} onClose={onClose} title="New contractor" subtitle={`ID card valid for at least ${minDays} day${minDays === 1 ? '' : 's'}.`}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="label">Full name</span><input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
        <label className="block"><span className="label">Company</span><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="label">Phone</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="block"><span className="label">Email</span><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        </div>
        {['SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(String(user?.role)) && (
          <label className="block">
            <span className="label">Agency</span>
            <select className="input" required value={form.organisationId} onChange={(e) => setForm({ ...form, organisationId: e.target.value })}>
              <option value="">Choose</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="label">Valid from</span><input type="date" className="input" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></label>
          <label className="block"><span className="label">Valid through</span><input type="date" className="input" value={form.validThrough} onChange={(e) => setForm({ ...form, validThrough: e.target.value })} /></label>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Create and open card'}</button>
      </form>
    </SleekOverlay>
  );
}
