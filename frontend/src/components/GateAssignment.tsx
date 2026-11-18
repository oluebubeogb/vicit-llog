'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, DoorOpen, Globe2, ScanLine, X } from 'lucide-react';

/** One gate or checkpoint an officer can be assigned to. The first stop of a location is its gate; later stops are checkpoints. */
export type PickGate = { id: string; name: string; code?: string; sequence: number; locationId: string; locationName: string; kind: 'GATE' | 'CHECKPOINT'; shared?: boolean };
export type OfficerAssignment = { gateId: string; name: string; locationId: string; locationName: string; kind: 'GATE' | 'CHECKPOINT'; shared?: boolean; sequence?: number };

const byOrder = (a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.name).localeCompare(String(b.name));

/** From GET /locations (agency scope). */
export function gatesFromLocations(locations: any[]): PickGate[] {
  const out: PickGate[] = [];
  for (const loc of locations || []) {
    const gates = [...(loc.gates || [])].sort(byOrder);
    gates.forEach((g: any, i: number) => out.push({ id: g.id, name: g.name, code: g.code, sequence: g.sequence ?? i, locationId: loc.id, locationName: loc.name, kind: i === 0 ? 'GATE' : 'CHECKPOINT', shared: !!loc.isShared }));
  }
  return out;
}

/** From GET /platform/gates, limited to one agency (its own locations + shared locations). */
export function gatesFromPlatform(gates: any[], agencyId: string): PickGate[] {
  const scoped = (gates || []).filter((g) => g.location?.organisation?.id === agencyId || g.location?.organisationId === agencyId || g.location?.isShared);
  const byLoc = new Map<string, any>();
  for (const g of scoped) {
    const id = g.location?.id || g.locationId;
    if (!byLoc.has(id)) byLoc.set(id, { id, name: g.location?.name || 'Location', isShared: !!g.location?.isShared, gates: [] });
    byLoc.get(id).gates.push(g);
  }
  return gatesFromLocations(Array.from(byLoc.values()));
}

function groups(gates: PickGate[]) {
  const m = new Map<string, { id: string; name: string; shared: boolean; gates: PickGate[] }>();
  for (const g of gates) {
    if (!m.has(g.locationId)) m.set(g.locationId, { id: g.locationId, name: g.locationName, shared: !!g.shared, gates: [] });
    m.get(g.locationId)!.gates.push(g);
  }
  return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
}

const KindIcon = ({ kind, size = 13 }: { kind: 'GATE' | 'CHECKPOINT'; size?: number }) => (kind === 'GATE' ? <DoorOpen size={size} /> : <ScanLine size={size} />);

/** Compact chips under a person's name in user lists. */
export function GateChips({ role, assignments, mobileMax = 2, desktopMax = 5 }: { role?: string; assignments?: OfficerAssignment[]; mobileMax?: number; desktopMax?: number }) {
  if (role === 'GLOBAL_GATE') {
    return (
      <span className="mt-1 flex flex-wrap gap-1" data-testid="gate-chips">
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-violet-100"><Globe2 size={11} /> All gates &amp; checkpoints</span>
      </span>
    );
  }
  if (role !== 'GATE') return null;
  const list = assignments || [];
  if (!list.length) return <span className="mt-1 block text-[11px] italic text-slate-400" data-testid="gate-chips-empty">No gate assigned</span>;
  const multiLoc = new Set(list.map((a) => a.locationId)).size > 1;
  return (
    <span className="mt-1 flex flex-wrap gap-1" data-testid="gate-chips">
      {list.slice(0, desktopMax).map((a, i) => (
        <span
          key={a.gateId}
          title={`${a.kind === 'GATE' ? 'Gate' : 'Checkpoint'} · ${a.locationName}`}
          data-kind={a.kind}
          className={`${i >= mobileMax ? 'hidden sm:inline-flex' : 'inline-flex'} max-w-[180px] sm:max-w-[300px] items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${a.kind === 'GATE' ? 'bg-brand-50 text-brand-700 ring-brand-100' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}
        >
          <KindIcon kind={a.kind} size={11} />
          <span className="truncate">{multiLoc ? <span className="hidden font-normal opacity-70 sm:inline">{a.locationName} · </span> : null}{a.name}</span>
        </span>
      ))}
      {list.length > mobileMax && <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 sm:hidden">+{list.length - mobileMax} more</span>}
      {list.length > desktopMax && <span className="hidden items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 sm:inline-flex">+{list.length - desktopMax} more</span>}
    </span>
  );
}

/** Dropdown picker of gates and checkpoints, grouped by location. */
export function GateAssignmentPicker({ gates, value, onChange, loading, emptyHref = '/locations', defaultOpen = false }: { gates: PickGate[]; value: string[]; onChange: (ids: string[]) => void; loading?: boolean; emptyHref?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const grouped = useMemo(() => groups(gates), [gates]);
  const selected = useMemo(() => gates.filter((g) => value.includes(g.id)), [gates, value]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const setGroup = (ids: string[], on: boolean) => onChange(on ? Array.from(new Set([...value, ...ids])) : value.filter((x) => !ids.includes(x)));
  const multiLoc = new Set(selected.map((g) => g.locationId)).size > 1;

  return (
    <div className="space-y-2" data-testid="gate-picker">
      <div className="flex items-center justify-between">
        <span className="label !mb-0 flex items-center gap-1.5"><DoorOpen size={13} /> Gates &amp; checkpoints</span>
        <span className="text-[11px] text-slate-400">{value.length ? `${value.length} selected` : 'None yet'}</span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="gate-picker-selected">
          {selected.map((g) => (
            <span key={g.id} className={`inline-flex max-w-full items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-semibold ring-1 ${g.kind === 'GATE' ? 'bg-brand-50 text-brand-700 ring-brand-100' : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
              <KindIcon kind={g.kind} size={12} />
              <span className="truncate">{multiLoc ? <span className="font-normal opacity-70">{g.locationName} · </span> : null}{g.name}</span>
              <button type="button" onClick={() => toggle(g.id)} aria-label={`Remove ${g.name}`} className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/80"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="input flex items-center justify-between !py-2.5 text-left text-sm" data-testid="gate-picker-toggle">
        <span className={value.length ? 'text-slate-800' : 'text-slate-400'}>{loading ? 'Loading gates…' : value.length ? 'Change gates & checkpoints' : 'Choose gates & checkpoints'}</span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !loading && (
        <div className="animate-in max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-soft" role="listbox" aria-multiselectable="true" data-testid="gate-picker-panel">
          {!grouped.length && (
            <p className="p-3 text-xs text-slate-500">No gates set up yet. <Link href={emptyHref} className="font-semibold text-brand-700">Add them in Locations &amp; gates</Link>.</p>
          )}
          {grouped.map((grp) => {
            const ids = grp.gates.map((g) => g.id);
            const all = ids.every((id) => value.includes(id));
            return (
              <div key={grp.id} className="py-1" data-testid="gate-picker-group">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{grp.name}</span>
                  {grp.shared && <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">Shared</span>}
                  <button type="button" onClick={() => setGroup(ids, !all)} className="text-[11px] font-semibold text-brand-700 hover:underline">{all ? 'Clear' : 'All'}</button>
                </div>
                {grp.gates.map((g) => {
                  const on = value.includes(g.id);
                  return (
                    <button key={g.id} type="button" role="option" aria-selected={on} onClick={() => toggle(g.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${on ? 'bg-brand-50/80' : 'hover:bg-slate-50'}`} data-testid="gate-picker-option">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${g.kind === 'GATE' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}><KindIcon kind={g.kind} size={14} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{g.name}</span>
                        <span className="block text-[11px] text-slate-400">{g.kind === 'GATE' ? 'Gate' : 'Checkpoint'}{g.code ? ` · ${g.code}` : ''}</span>
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}>{on && <Check size={13} />}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "+ Main Gate, − Block B Desk" summary for pending-change lists. */
export function gateDiffText(before: string[], after: string[], gates: PickGate[]) {
  const name = (id: string) => gates.find((g) => g.id === id)?.name || 'a gate';
  const added = after.filter((x) => !before.includes(x)).map(name);
  const removed = before.filter((x) => !after.includes(x)).map(name);
  return [added.length ? `+ ${added.join(', ')}` : '', removed.length ? `− ${removed.join(', ')}` : ''].filter(Boolean).join(' · ') || 'No change';
}
