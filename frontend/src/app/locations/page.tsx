'use client';

import { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { Building2, DoorOpen, MapPin, Plus, ChevronUp, ChevronDown, UserPlus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Collapse from '@/components/ui/Collapse';
import { Empty, SkeletonList } from '@/components/ui/Bits';

export default function LocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const ownOrgId = getUser()?.orgId;
  const [officers, setOfficers] = useState<any[]>([]);
  const [showLoc, setShowLoc] = useState(false);
  const [showGate, setShowGate] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({ name: '', code: '', address: '' });
  const [gateForm, setGateForm] = useState<any>({ name: '', code: '', officerId: '', admissionsEnabled: true, particularsCheckEnabled: true, dailyAdmissionLimit: '' });
  const [loading, setLoading] = useState(true);
  const [maxGates, setMaxGates] = useState(10);
  const [gateSettingsOpen, setGateSettingsOpen] = useState<string | null>(null);
  const [gateSettings, setGateSettings] = useState<any>({ admissionsEnabled: true, particularsCheckEnabled: true, dailyAdmissionLimit: '' });

  function load(silent = false) {
    if (!silent) setLoading(true);
    Promise.all([api.locations(), api.users(), api.locationSettings()])
      .then(([locs, people, settings]) => { setLocations(locs); setOfficers((people || []).filter((p: any) => p.role === 'GATE' || p.role === 'GLOBAL_GATE')); setMaxGates(settings?.maxGates ?? 10); })
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
    await api.addGate(locId, { ...gateForm, officerId: (gateForm as any).officerId || undefined, admissionsEnabled: (gateForm as any).admissionsEnabled ?? true, particularsCheckEnabled: (gateForm as any).particularsCheckEnabled ?? true, dailyAdmissionLimit: (gateForm as any).dailyAdmissionLimit || null });
    setShowGate(null);
    setGateForm({ name: '', code: '', officerId: '', admissionsEnabled: true, particularsCheckEnabled: true, dailyAdmissionLimit: '' });
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

      <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Gate capacity settings</p><p className="text-xs text-slate-500">{locations.reduce((n,l)=>n+(l.gates?.length||0),0)} gates currently created · limit {maxGates}</p></div><form className="flex items-center gap-2" onSubmit={async e=>{e.preventDefault();try{await api.updateLocationSettings({maxGates});load()}catch(err:any){window.alert(err.message)}}}><input aria-label="Maximum gates" type="number" min={Math.max(1,locations.reduce((n,l)=>n+(l.gates?.length||0),0))} max={500} className="input !w-24" value={maxGates} onChange={e=>setMaxGates(Number(e.target.value))}/><button className="btn-primary !py-2 text-xs">Save limit</button></form></div>

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
        <ul className="space-y-3">
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
                    {loc.address} {loc.isShared ? '· Shared site' : ''} {loc.organisation?.id && loc.organisation.id !== ownOrgId ? `· Managed by ${loc.organisation.name}` : ''}
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
                    <button type="button" title="Move earlier" disabled={g.sequence === 0 || (!!loc.isShared && !!loc.organisation?.id && loc.organisation.id !== ownOrgId)} onClick={async () => { await api.reorderGate(g.id, Math.max(0, g.sequence - 1)); load(true); }} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronUp size={14}/></button>
                    <button type="button" title="Move later" disabled={!!loc.isShared && !!loc.organisation?.id && loc.organisation.id !== ownOrgId} onClick={async () => { await api.reorderGate(g.id, g.sequence + 1); load(true); }} className="rounded-lg p-1 text-slate-500 hover:bg-white"><ChevronDown size={14}/></button>
                    <select aria-label={`Assign officer to ${g.name}`} className="input !w-full !py-1.5 text-xs sm:!w-auto" value="" onChange={async e => { const userId = e.target.value; if (!userId) return; try { await api.assignGateOfficer(g.id, userId); await load(true); } catch (err: any) { window.alert(err.message || 'Could not assign that officer'); } }}>
                      <option value="">Assign gate officer…</option>
                      {officers.map((o: any) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                    </select>
                    <span className="w-full pl-6 text-[11px] text-slate-500">{(g.assignments || []).map((a: any) => a.user?.fullName).filter(Boolean).join(', ') || 'No officers assigned'}</span>
                    <button type="button" disabled={!!loc.isShared && !!loc.organisation?.id && loc.organisation.id !== ownOrgId} title="Shared checkpoint settings are managed by the owning agency" className="ml-6 text-[11px] font-semibold text-brand-700 underline disabled:opacity-40" onClick={()=>{setGateSettingsOpen(gateSettingsOpen===g.id?null:g.id);setGateSettings({admissionsEnabled:g.admissionsEnabled??true,particularsCheckEnabled:g.particularsCheckEnabled??true,dailyAdmissionLimit:g.dailyAdmissionLimit??''})}}>Gate settings</button>
                    {gateSettingsOpen===g.id&&<form className="grid w-full gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();try{await api.updateGateSettings(g.id,{...gateSettings,dailyAdmissionLimit:gateSettings.dailyAdmissionLimit||null});setGateSettingsOpen(null);load(true)}catch(err:any){window.alert(err.message)}}}>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={gateSettings.admissionsEnabled} onChange={e=>setGateSettings({...gateSettings,admissionsEnabled:e.target.checked})}/> Admissions enabled</label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={gateSettings.particularsCheckEnabled} onChange={e=>setGateSettings({...gateSettings,particularsCheckEnabled:e.target.checked})}/> Require particulars check</label>
                      <input type="number" min="1" className="input !py-2 text-xs sm:col-span-2" placeholder="Daily admission limit (blank = unlimited)" value={gateSettings.dailyAdmissionLimit} onChange={e=>setGateSettings({...gateSettings,dailyAdmissionLimit:e.target.value})}/>
                      <button className="btn-primary !py-2 text-xs sm:col-span-2">Save gate settings</button>
                    </form>}
                  </div>
                ))}
              </div>
              <button disabled={!!loc.isShared && !!loc.organisation?.id && loc.organisation.id !== ownOrgId} title={loc.isShared && loc.organisation?.id !== ownOrgId ? "Shared location gates are managed by the owning agency" : "Add gate"} onClick={() => setShowGate(showGate === loc.id ? null : loc.id)} className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40">
                <Plus size={13} className={`transition-transform ${showGate === loc.id ? 'rotate-45' : ''}`} /> Add gate
              </button>
              <Collapse open={showGate === loc.id}>
                <form onSubmit={(e) => createGate(e, loc.id)} className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
                  <input placeholder="Gate name" value={gateForm.name} onChange={(e) => setGateForm({ ...gateForm, name: e.target.value })} className="input !py-2 text-sm" required />
                  <input placeholder="Gate code" value={gateForm.code} onChange={(e) => setGateForm({ ...gateForm, code: e.target.value })} className="input !py-2 text-sm" required />
                  <select className="input col-span-2 !py-2 text-sm" value={(gateForm as any).officerId||''} onChange={e=>setGateForm({...gateForm,officerId:e.target.value} as any)}><option value="">Assign officer now (optional)</option>{officers.map(o=><option key={o.id} value={o.id}>{o.fullName}</option>)}</select>
                  <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={(gateForm as any).admissionsEnabled??true} onChange={e=>setGateForm({...gateForm,admissionsEnabled:e.target.checked} as any)}/> Admissions enabled</label>
                  <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={(gateForm as any).particularsCheckEnabled??true} onChange={e=>setGateForm({...gateForm,particularsCheckEnabled:e.target.checked} as any)}/> Require particulars check confirmation</label>
                  <input type="number" min="1" placeholder="Daily admission limit (optional)" className="input col-span-2 !py-2 text-sm" value={(gateForm as any).dailyAdmissionLimit||''} onChange={e=>setGateForm({...gateForm,dailyAdmissionLimit:e.target.value} as any)}/>
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
