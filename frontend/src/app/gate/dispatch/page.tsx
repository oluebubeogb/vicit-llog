'use client';

import { useEffect, useState } from 'react';
import { BellRing, Package, Plus } from 'lucide-react';
import { api, getUser } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { Notice, SkeletonList } from '@/components/ui/Bits';
import SleekOverlay from '@/components/ui/SleekOverlay';
import StatusPill from '@/components/ui/StatusPill';
import Collapse from '@/components/ui/Collapse';

const TONE: Record<string, 'emerald' | 'amber' | 'rose' | 'slate'> = {
  REGISTERED: 'slate',
  AWAITING_APPROVAL: 'amber',
  APPROVED: 'emerald',
  DECLINED: 'rose',
  DELIVERED: 'emerald',
  EXITED: 'slate',
};

export default function DispatchPage() {
  const user = getUser();
  const isGate = ['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN'].includes(String(user?.role));
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  async function load() {
    setError('');
    const list = await api.dispatches(status || undefined);
    setRows(Array.isArray(list) ? list : list?.rows || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [status]);

  async function decide(id: string, organisationId: string, approve: boolean) {
    try { await api.decideDispatch(id, { organisationId, approve }); await load(); } catch (e: any) { setError(e.message); }
  }
  async function mark(id: string, s: string) {
    try { await api.markDispatch(id, s); await load(); } catch (e: any) { setError(e.message); }
  }
  async function ring(id: string, hostId: string) {
    try { const call = await api.startDispatchRing(id, hostId); window.dispatchEvent(new CustomEvent('vicit:ring-local', { detail: call })); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="page">
      <PageHeader icon={<Package size={20} />} title="Dispatch" subtitle="Uninvited couriers, letters and parcels" info="Register a courier, choose one or more agencies, and optionally ring a host for approval."
        actions={isGate ? <button type="button" className="btn-primary !px-3 !py-2 text-sm" onClick={() => setOpen(true)}><Plus size={15} /> New</button> : undefined}
      />
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {['', 'AWAITING_APPROVAL', 'REGISTERED', 'APPROVED', 'DELIVERED'].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`chip whitespace-nowrap ${status === s ? '!bg-brand-600 !text-on-brand' : ''}`}>{s ? s.replace(/_/g, ' ').toLowerCase() : 'All'}</button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && <SkeletonList />}
      <ul className="space-y-3">
        {(rows || []).map((d) => (
          <li key={d.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{d.courierName}</p>
                <p className="text-xs text-slate-500">{[d.courierCompany, d.courierPhone].filter(Boolean).join(' · ')}</p>
              </div>
              <StatusPill tone={TONE[d.status] || 'slate'} label={String(d.status || '').replace(/_/g, ' ').toLowerCase()} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(d.items || []).map((it: any) => (
                <li key={it.id} className="chip !py-0.5">{it.description}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5">
              {(d.destinations || []).map((dest: any) => (
                <div key={dest.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                  <b className="text-slate-800">{dest.organisation?.name}</b>
                  <span className="text-slate-400">{dest.host?.fullName || 'No host yet'}</span>
                  <StatusPill tone={TONE[dest.status] || 'slate'} label={String(dest.status || '').replace(/_/g, ' ').toLowerCase()} />
                  <span className="ml-auto flex gap-1">
                    {dest.hostId && isGate && <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => ring(d.id, dest.hostId)}><BellRing size={12} /> Ring</button>}
                    {dest.status === 'PENDING' && <button type="button" className="btn-success !px-2 !py-1" onClick={() => decide(d.id, dest.organisationId, true)}>Approve</button>}
                    {dest.status === 'PENDING' && <button type="button" className="btn-danger !px-2 !py-1" onClick={() => decide(d.id, dest.organisationId, false)}>Decline</button>}
                  </span>
                </div>
              ))}
            </div>
            {isGate && d.status !== 'EXITED' && d.status !== 'DECLINED' && (
              <div className="mt-3 flex gap-2">
                {d.status !== 'DELIVERED' && <button type="button" className="btn-quiet flex-1 !py-2 text-xs" onClick={() => mark(d.id, 'DELIVERED')}>Mark delivered</button>}
                <button type="button" className="btn-quiet flex-1 !py-2 text-xs" onClick={() => mark(d.id, 'EXITED')}>Courier left</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows && !rows.length && <p className="py-10 text-center text-sm text-slate-500">No dispatches yet.</p>}
      <NewDispatch open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); load(); }} />
    </div>
  );
}

function NewDispatch({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [hosts, setHosts] = useState<Record<string, any[]>>({});
  const [form, setForm] = useState({ courierName: '', courierPhone: '', courierCompany: '', notes: '', items: 'Letter' });
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [pickedHosts, setPickedHosts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) api.directoryAgencies().then(setAgencies).catch(() => {}); }, [open]);
  useEffect(() => {
    orgIds.forEach((id) => {
      if (hosts[id]) return;
      api.directoryHosts(id).then((list) => setHosts((h) => ({ ...h, [id]: list }))).catch(() => {});
    });
  }, [orgIds, hosts]);

  function toggleOrg(id: string) {
    setOrgIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const items = form.items.split(/\n|,/).map((s) => s.trim()).filter(Boolean).map((description) => ({ description, quantity: 1 }));
      await api.createDispatch({ ...form, items, organisationIds: orgIds, hosts: pickedHosts });
      onCreated();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <SleekOverlay open={open} onClose={onClose} title="Register dispatch" subtitle="Courier with letters, parcels or physical mail" size="lg">
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="label">Courier name</span><input className="input" required value={form.courierName} onChange={(e) => setForm({ ...form, courierName: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="label">Phone</span><input className="input" value={form.courierPhone} onChange={(e) => setForm({ ...form, courierPhone: e.target.value })} /></label>
          <label className="block"><span className="label">Company</span><input className="input" value={form.courierCompany} onChange={(e) => setForm({ ...form, courierCompany: e.target.value })} /></label>
        </div>
        <label className="block"><span className="label">Items (one per line)</span><textarea className="input min-h-[72px]" required value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} /></label>
        <div>
          <p className="label">Destination agencies</p>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {agencies.map((a) => (
              <label key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={orgIds.includes(a.id)} onChange={() => toggleOrg(a.id)} />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
              </label>
            ))}
          </div>
        </div>
        <Collapse open={orgIds.length > 0}>
          <div className="space-y-2">
            {orgIds.map((id) => (
              <label key={id} className="block">
                <span className="label">Host at {agencies.find((a) => a.id === id)?.name}</span>
                <select className="input" value={pickedHosts[id] || ''} onChange={(e) => setPickedHosts((h) => ({ ...h, [id]: e.target.value }))}>
                  <option value="">Optional — speculate a host</option>
                  {(hosts[id] || []).map((h) => <option key={h.id} value={h.id}>{h.fullName}</option>)}
                </select>
              </label>
            ))}
          </div>
        </Collapse>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" disabled={busy || !orgIds.length} className="btn-primary w-full">{busy ? 'Saving…' : 'Register dispatch'}</button>
      </form>
    </SleekOverlay>
  );
}
