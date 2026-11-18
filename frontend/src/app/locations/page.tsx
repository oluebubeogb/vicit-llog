'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { Building2, DoorOpen, MapPin, Plus, Minus, ChevronUp, ChevronDown, Pencil, Settings2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Empty, Notice, SkeletonList } from '@/components/ui/Bits';
import SleekOverlay from '@/components/ui/SleekOverlay';

type LocForm = { name: string; code: string; address: string };
type GateForm = { name: string; code: string; officerId: string; admissionsEnabled: boolean; particularsCheckEnabled: boolean; dailyAdmissionLimit: string | number };
const EMPTY_LOC: LocForm = { name: '', code: '', address: '' };
const EMPTY_GATE: GateForm = { name: '', code: '', officerId: '', admissionsEnabled: true, particularsCheckEnabled: true, dailyAdmissionLimit: '' };

export default function LocationsPage() {
  return (
    <Suspense fallback={<div className="page"><SkeletonList rows={3} h={120} /></div>}>
      <LocationsInner />
    </Suspense>
  );
}

function LocationsInner() {
  const me = getUser();
  const superAdmin = me?.role === 'SUPER_ADMIN';
  const params = useSearchParams();
  const [agencies, setAgencies] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string | null>(superAdmin ? params?.get('orgId') || null : me?.organisation?.id || me?.orgId || me?.organisationId || 'own');
  const [locations, setLocations] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxGates, setMaxGates] = useState(10);
  const [error, setError] = useState('');
  // Same overlay for add and edit
  const [locEditor, setLocEditor] = useState<{ mode: 'add' | 'edit'; id?: string; form: LocForm } | null>(null);
  const [gateEditor, setGateEditor] = useState<{ mode: 'add' | 'edit'; locationId?: string; gateId?: string; locationName?: string; form: GateForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [removeOfficer, setRemoveOfficer] = useState<{ gateId: string; gateName: string; userId: string; fullName: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  // Super Admin: pick the agency to work on
  useEffect(() => {
    if (!superAdmin) return;
    api.platformAgencies().then((list: any[]) => {
      setAgencies(list || []);
      if (!orgId && list?.length) setOrgId(list[0].id);
    }).catch((e: any) => setError(e.message || 'Could not load agencies'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin]);

  function load(silent = false) {
    if (!orgId) return;
    api.setLocationsOrg(superAdmin ? orgId : null);
    if (!silent) setLoading(true);
    setError('');
    Promise.all([api.locations(), api.locationOfficers(), api.locationSettings()])
      .then(([locs, people, settings]) => { setLocations(locs || []); setOfficers(people || []); setMaxGates(settings?.maxGates ?? 10); })
      .catch((e: any) => setError(e.message || 'Could not load locations'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const managedElsewhere = (loc: any) => !!loc.organisation?.id && loc.organisation.id !== orgId;
  const gateCount = locations.reduce((n, l) => n + (l.organisation?.id === orgId ? l.gates?.length || 0 : 0), 0);

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!locEditor) return;
    setSaving(true); setFormError('');
    try {
      if (locEditor.mode === 'add') await api.createLocation(locEditor.form);
      else await api.updateLocation(locEditor.id!, locEditor.form);
      setLocEditor(null);
      load(true);
    } catch (err: any) { setFormError(err.message || 'Could not save location'); } finally { setSaving(false); }
  }

  async function saveGate(e: React.FormEvent) {
    e.preventDefault();
    if (!gateEditor) return;
    setSaving(true); setFormError('');
    const f = gateEditor.form;
    const body = { name: f.name, code: f.code, admissionsEnabled: f.admissionsEnabled, particularsCheckEnabled: f.particularsCheckEnabled, dailyAdmissionLimit: f.dailyAdmissionLimit === '' ? null : Number(f.dailyAdmissionLimit) };
    try {
      if (gateEditor.mode === 'add') await api.addGate(gateEditor.locationId!, { ...body, officerId: f.officerId || undefined });
      else await api.updateGate(gateEditor.gateId!, body);
      setGateEditor(null);
      load(true);
    } catch (err: any) { setFormError(err.message || 'Could not save gate'); } finally { setSaving(false); }
  }

  const agencyName = superAdmin ? agencies.find((a) => a.id === orgId)?.name : me?.organisation?.name || me?.orgName;

  return (
    <div className="page">
      <PageHeader
        back={superAdmin ? '/platform' : '/admin'}
        icon={<MapPin size={20} />}
        title="Locations & gates"
        subtitle={loading ? 'Loading…' : `${agencyName ? `${agencyName} · ` : ''}${locations.length} sites · ${locations.reduce((a, l) => a + (l.gates?.length || 0), 0)} gates`}
        info="Sites your visitors are invited to, and the gates officers check them in at."
        actions={
          <button onClick={() => { setFormError(''); setLocEditor({ mode: 'add', form: { ...EMPTY_LOC } }); }} disabled={!orgId} className="btn-primary !px-3" data-testid="add-location">
            <Plus size={16} /> Location
          </button>
        }
      />

      {superAdmin && (
        <label className="surface mb-4 flex flex-wrap items-center gap-3 p-4" data-testid="locations-agency-picker">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Agency</span>
            <span className="block text-xs text-slate-500">As Super Admin you can manage any agency&apos;s locations and gates.</span>
          </span>
          <select className="input !w-full sm:!w-72" value={orgId || ''} onChange={(e) => setOrgId(e.target.value)}>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}

      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Gate capacity settings</p><p className="text-xs text-slate-500">{gateCount} gates currently created · limit {maxGates}</p></div>
        <form className="flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api.updateLocationSettings({ maxGates }); load(true); } catch (err: any) { window.alert(err.message); } }}>
          <input aria-label="Maximum gates" type="number" min={Math.max(1, gateCount)} max={500} className="input !w-24" value={maxGates} onChange={(e) => setMaxGates(Number(e.target.value))} />
          <button className="btn-primary !py-2 text-xs">Save limit</button>
        </form>
      </div>

      {loading ? (
        <SkeletonList rows={3} h={120} />
      ) : locations.length === 0 ? (
        <Empty icon={<MapPin size={24} />} title="No locations yet" hint="Add your first site, then the gates where officers scan visitors." />
      ) : (
        <ul className="space-y-3">
          {locations.map((loc) => {
            const locked = managedElsewhere(loc);
            return (
              <li key={loc.id} className="card card-art p-4" data-testid="location-card">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600">
                    <Building2 size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{loc.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="chip mr-1 !py-0 font-mono">{loc.code}</span>
                      {loc.address} {loc.isShared ? '· Shared site' : ''} {locked ? `· Managed by ${loc.organisation.name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={locked}
                    title={locked ? 'Shared locations are managed by the owning agency' : `Edit ${loc.name}`}
                    aria-label={`Edit ${loc.name}`}
                    data-testid="edit-location"
                    onClick={() => { setFormError(''); setLocEditor({ mode: 'edit', id: loc.id, form: { name: loc.name || '', code: loc.code || '', address: loc.address || '' } }); }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <div className="mt-3 space-y-1.5 border-l-2 border-emerald-100 pl-3">
                  {(loc.gates || []).length === 0 && <p className="text-xs text-slate-400">No gates yet</p>}
                  {(loc.gates || []).map((g: any) => (
                    <div key={g.id} className="tile flex flex-wrap items-center gap-2 !py-2 text-sm" data-testid="gate-row">
                      <DoorOpen size={14} className="text-brand-500" />
                      <span className="min-w-0 flex-1 font-medium text-slate-700">{g.sequence + 1}. {g.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">{g.code}</span>
                      <button type="button" title="Move earlier" disabled={g.sequence === 0 || locked} onClick={async () => { await api.reorderGate(g.id, Math.max(0, g.sequence - 1)); load(true); }} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronUp size={14} /></button>
                      <button type="button" title="Move later" disabled={locked} onClick={async () => { await api.reorderGate(g.id, g.sequence + 1); load(true); }} className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronDown size={14} /></button>
                      <button
                        type="button"
                        disabled={locked}
                        title={locked ? 'Shared checkpoints are managed by the owning agency' : `Edit ${g.name}`}
                        aria-label={`Edit ${g.name}`}
                        data-testid="edit-gate"
                        onClick={() => { setFormError(''); setGateEditor({ mode: 'edit', gateId: g.id, locationName: loc.name, form: { name: g.name || '', code: g.code || '', officerId: '', admissionsEnabled: g.admissionsEnabled ?? true, particularsCheckEnabled: g.particularsCheckEnabled ?? true, dailyAdmissionLimit: g.dailyAdmissionLimit ?? '' } }); }}
                        className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-brand-700 disabled:opacity-30"
                      >
                        <Pencil size={14} />
                      </button>
                      <select aria-label={`Assign officer to ${g.name}`} disabled={locked} className="input !w-full !py-1.5 text-xs sm:!w-auto" value="" onChange={async (e) => { const userId = e.target.value; if (!userId) return; try { await api.assignGateOfficer(g.id, userId); await load(true); } catch (err: any) { window.alert(err.message || 'Could not assign that officer'); } }}>
                        <option value="">Assign gate officer…</option>
                        {officers.filter((o: any) => !(g.assignments || []).some((a: any) => a.user?.id === o.id)).map((o: any) => <option key={o.id} value={o.id}>{o.fullName}{o.role === 'GLOBAL_GATE' ? ' (Super gate)' : ''}</option>)}
                      </select>
                      <div className="w-full space-y-1.5 pl-6">
                        <p className="text-[11px] font-semibold tracking-wide text-slate-600">Gate Officers currently assigned</p>
                        {(g.assignments || []).length === 0 ? (
                          <p className="text-[11px] text-slate-400">No officers assigned</p>
                        ) : (
                          <ul className="space-y-1">
                            {(g.assignments || []).map((a: any) => (
                              <li key={a.user?.id || a.id} className="flex items-center gap-2 text-sm text-slate-700" data-testid="assigned-officer">
                                <span className="min-w-0 flex-1 font-medium">{a.user?.fullName || 'Unknown officer'}{a.user?.role === 'GLOBAL_GATE' ? <span className="ml-1.5 text-[11px] font-normal text-slate-400">Super gate</span> : null}</span>
                                <button
                                  type="button"
                                  title={`Remove ${a.user?.fullName || 'officer'} from ${g.name}`}
                                  aria-label={`Remove ${a.user?.fullName || 'officer'} from ${g.name}`}
                                  data-testid="remove-officer"
                                  disabled={!a.user?.id || locked}
                                  onClick={() => { if (a.user?.id) setRemoveOfficer({ gateId: g.id, gateName: g.name, userId: a.user.id, fullName: a.user.fullName }); }}
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Minus size={13} strokeWidth={3} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  disabled={locked}
                  title={locked ? 'Shared location gates are managed by the owning agency' : 'Add gate'}
                  onClick={() => { setFormError(''); setGateEditor({ mode: 'add', locationId: loc.id, locationName: loc.name, form: { ...EMPTY_GATE } }); }}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={13} /> Add gate
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Location: add / edit (same overlay) */}
      <SleekOverlay
        open={!!locEditor}
        onClose={() => !saving && setLocEditor(null)}
        title={locEditor?.mode === 'edit' ? 'Edit location' : 'New location'}
        subtitle={agencyName || undefined}
        icon={<Building2 size={20} />}
      >
        {locEditor && (
          <form onSubmit={saveLocation} className="space-y-2.5" data-testid="location-form">
            <label className="block"><span className="label">Name</span><input value={locEditor.form.name} onChange={(e) => setLocEditor({ ...locEditor, form: { ...locEditor.form, name: e.target.value } })} className="input" required /></label>
            <label className="block"><span className="label">Code</span><input placeholder="e.g. HQ" value={locEditor.form.code} onChange={(e) => setLocEditor({ ...locEditor, form: { ...locEditor.form, code: e.target.value } })} className="input uppercase" required /></label>
            <label className="block"><span className="label">Address (optional)</span><input value={locEditor.form.address} onChange={(e) => setLocEditor({ ...locEditor, form: { ...locEditor.form, address: e.target.value } })} className="input" /></label>
            {formError && <Notice tone="error">{formError}</Notice>}
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-quiet flex-1" disabled={saving} onClick={() => setLocEditor(null)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : locEditor.mode === 'edit' ? 'Save changes' : 'Create location'}</button>
            </div>
          </form>
        )}
      </SleekOverlay>

      {/* Gate / checkpoint: add / edit (same overlay) */}
      <SleekOverlay
        open={!!gateEditor}
        onClose={() => !saving && setGateEditor(null)}
        title={gateEditor?.mode === 'edit' ? 'Edit gate / checkpoint' : 'New gate / checkpoint'}
        subtitle={gateEditor?.locationName}
        icon={<Settings2 size={20} />}
      >
        {gateEditor && (
          <form onSubmit={saveGate} className="space-y-2.5" data-testid="gate-form">
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="label">Gate name</span><input value={gateEditor.form.name} onChange={(e) => setGateEditor({ ...gateEditor, form: { ...gateEditor.form, name: e.target.value } })} className="input" required /></label>
              <label className="block"><span className="label">Gate code</span><input value={gateEditor.form.code} onChange={(e) => setGateEditor({ ...gateEditor, form: { ...gateEditor.form, code: e.target.value } })} className="input" required /></label>
            </div>
            {gateEditor.mode === 'add' && (
              <select className="input" value={gateEditor.form.officerId} onChange={(e) => setGateEditor({ ...gateEditor, form: { ...gateEditor.form, officerId: e.target.value } })}>
                <option value="">Assign officer now (optional)</option>
                {officers.map((o: any) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gateEditor.form.admissionsEnabled} onChange={(e) => setGateEditor({ ...gateEditor, form: { ...gateEditor.form, admissionsEnabled: e.target.checked } })} /> Admissions enabled</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gateEditor.form.particularsCheckEnabled} onChange={(e) => setGateEditor({ ...gateEditor, form: { ...gateEditor.form, particularsCheckEnabled: e.target.checked } })} /> Require particulars check</label>
            <label className="block"><span className="label">Daily admission limit</span><input type="number" min="1" placeholder="Blank = unlimited" className="input" value={gateEditor.form.dailyAdmissionLimit} onChange={(e) => setGateEditor({ ...gateEditor, form: { ...gateEditor.form, dailyAdmissionLimit: e.target.value } })} /></label>
            {formError && <Notice tone="error">{formError}</Notice>}
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-quiet flex-1" disabled={saving} onClick={() => setGateEditor(null)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : gateEditor.mode === 'edit' ? 'Save changes' : 'Save gate'}</button>
            </div>
          </form>
        )}
      </SleekOverlay>

      <SleekOverlay
        open={!!removeOfficer}
        onClose={() => !removing && setRemoveOfficer(null)}
        tone="rose"
        title="Remove gate officer"
        subtitle={removeOfficer ? `Remove ${removeOfficer.fullName} from ${removeOfficer.gateName}?` : ''}
        icon={<Minus size={20} />}
        footer={
          <>
            <button type="button" className="btn-quiet flex-1" disabled={removing} onClick={() => setRemoveOfficer(null)}>Cancel</button>
            <button
              type="button"
              className="btn-primary flex-1 !bg-rose-600 hover:!bg-rose-700"
              disabled={removing}
              data-testid="confirm-remove-officer"
              onClick={async () => {
                if (!removeOfficer) return;
                setRemoving(true);
                try {
                  await api.unassignGateOfficer(removeOfficer.gateId, removeOfficer.userId);
                  setRemoveOfficer(null);
                  await load(true);
                } catch (err: any) {
                  window.alert(err.message || 'Could not remove officer');
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">They will no longer be able to record decisions at this checkpoint until reassigned. Their past checkpoint records stay in the history.</p>
      </SleekOverlay>
    </div>
  );
}
