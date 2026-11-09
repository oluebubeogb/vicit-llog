'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Building2, DoorOpen, MapPin, Plus, ChevronUp, ChevronDown, UserPlus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Collapse from '@/components/ui/Collapse';
import { Empty, SkeletonList } from '@/components/ui/Bits';

export default function LocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [showLoc, setShowLoc] = useState(false);
  const [showGate, setShowGate] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({ name: '', code: '', address: '' });
  const [gateForm, setGateForm] = useState({ name: '', code: '' });
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([api.locations(), api.users()])
      .then(([locs, people]) => { setLocations(locs); setOfficers((people || []).filter((p: any) => p.role === 'GATE')); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function createLoc(e: React.FormEvent) {
    e.preventDefault();
    await api.createLocation(locForm);
    setShowLoc(false);
    setLocForm({ name: '', code: '', address: '' });
    load();
  }

  async function createGate(e: React.FormEvent, locId: string) {
    e.preventDefault();
    await api.addGate(locId, gateForm);
    setShowGate(null);
    setGateForm({ name: '', code: '' });
    load();
  }

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        icon={<MapPin size={20} />}
        title="Locations & gates"
        subtitle={loading ? 'Loading…' : `${locations.length} sites · ${locations.reduce((a, l) => a + (l.gates?.length || 0), 0)} gates`}
        info="Sites your visitors are invited to, and the gates officers check them in at."
        actions={
          <button onClick={() => setShowLoc(!showLoc)} className="btn-primary !px-3">
            <Plus size={16} /> Location
          </button>
        }
      />

      <Collapse open={showLoc}>
        <form onSubmit={createLoc} className="surface mb-4 space-y-2.5">
          <p className="section-title">New location</p>
          <input placeholder="Name" value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} className="input" required />
          <input placeholder="Code (e.g. HQ)" value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} className="input uppercase" required />
          <input placeholder="Address (optional)" value={locForm.address} onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} className="input" />
          <button type="submit" className="btn-primary w-full">
            Create location
          </button>
        </form>
      </Collapse>

      {loading ? (
        <SkeletonList rows={3} h={120} />
      ) : locations.length === 0 ? (
        <Empty icon={<MapPin size={24} />} title="No locations yet" hint="Add your first site, then the gates where officers scan visitors." />
      ) : (
        <ul className="stagger space-y-3">
          {locations.map((loc) => (
            <li key={loc.id} className="card card-art p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">{loc.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="chip mr-1 !py-0 font-mono">{loc.code}</span>
                    {loc.address}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 border-l-2 border-emerald-100 pl-3">
                {(loc.gates || []).length === 0 && <p className="text-xs text-slate-400">No gates yet</p>}
                {(loc.gates || []).map((g: any) => (
                  <div key={g.id} className="tile flex flex-wrap items-center gap-2 !py-2 text-sm">
                    <DoorOpen size={14} className="text-brand-500" />
                    <span className="min-w-0 flex-1 font-medium text-slate-700">{g.sequence + 1}. {g.name}</span>
                    <span className="font-mono text-[11px] text-slate-400">{g.code}</span>
                    <button type="button" title="Move earlier" disabled={g.sequence === 0} onClick={async () => { await api.reorderGate(g.id, Math.max(0, g.sequence - 1)); load(); }} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronUp size={14}/></button>
                    <button type="button" title="Move later" onClick={async () => { await api.reorderGate(g.id, g.sequence + 1); load(); }} className="rounded-lg p-1 text-slate-500 hover:bg-white"><ChevronDown size={14}/></button>
                    <select aria-label={`Assign officer to ${g.name}`} className="input !w-full !py-1.5 text-xs sm:!w-auto" defaultValue="" onChange={async e => { if (e.target.value) { await api.assignGateOfficer(g.id, e.target.value); load(); e.target.value = ''; } }}>
                      <option value="">Assign gate officer…</option>
                      {officers.map((o: any) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                    </select>
                    <span className="w-full pl-6 text-[11px] text-slate-500">{(g.assignments || []).map((a: any) => a.user?.fullName).filter(Boolean).join(', ') || 'No officers assigned'}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowGate(showGate === loc.id ? null : loc.id)} className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50">
                <Plus size={13} className={`transition-transform ${showGate === loc.id ? 'rotate-45' : ''}`} /> Add gate
              </button>
              <Collapse open={showGate === loc.id}>
                <form onSubmit={(e) => createGate(e, loc.id)} className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
                  <input placeholder="Gate name" value={gateForm.name} onChange={(e) => setGateForm({ ...gateForm, name: e.target.value })} className="input !py-2 text-sm" required />
                  <input placeholder="Gate code" value={gateForm.code} onChange={(e) => setGateForm({ ...gateForm, code: e.target.value })} className="input !py-2 text-sm" required />
                  <button type="submit" className="btn-primary col-span-2 !py-2">
                    Save gate
                  </button>
                </form>
              </Collapse>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
