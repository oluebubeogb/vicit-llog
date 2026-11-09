'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Avatar from '@/components/ui/Avatar';
import StatusPill from '@/components/ui/StatusPill';
import { Empty } from '@/components/ui/Bits';
import { fmtDate, photoUrl, relTime } from '@/lib/format';

type FacetRow = { id: string | number; label: string; count: number };

export function DrillFacets({
  facets,
  onPick,
}: {
  facets?: {
    locations?: FacetRow[];
    gates?: FacetRow[];
    officers?: FacetRow[];
    hosts?: FacetRow[];
    statuses?: FacetRow[];
    durations?: FacetRow[];
    hours?: FacetRow[];
    withheld?: FacetRow[];
  } | null;
  onPick: (patch: Record<string, string | number>) => void;
}) {
  if (!facets) return null;
  const sections: Array<[string, FacetRow[] | undefined, string]> = [
    ['Location', facets.locations, 'locationId'],
    ['Gate', facets.gates, 'gateId'],
    ['Officer', facets.officers, 'officerId'],
    ['Host', facets.hosts, 'hostId'],
    ['Status', facets.statuses, 'status'],
    ['Withheld items', facets.withheld, 'item'],
    ['Stay', facets.durations, 'duration'],
    ['Peak time', facets.hours, 'hour'],
  ];
  const visible = sections.filter(([, rows]) => rows && rows.length);
  if (!visible.length) return null;
  return (
    <div className="space-y-3">
      {visible.map(([title, rows, key]) => (
        <section key={title}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
            {(rows || []).map((row) => (
              <button
                key={String(row.id)}
                type="button"
                onClick={() => onPick({ [key]: row.id })}
                className="flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left first:border-t-0 hover:bg-brand-50/70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{row.label}</span>
                </span>
                <b className="text-sm text-slate-900">{Number(row.count).toLocaleString()}</b>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const METRIC: Record<string, string> = {
  totalVisits: 'total',
  arrived: 'arrived',
  exited: 'exited',
  denied: 'denied',
  invitesCreated: 'invites',
  total: 'total',
};

/** Self-loading deep drill used by Super Admin tools. */
export function PlatformDrill({
  organisationId,
  metric = 'total',
  days = 30,
  from,
  to,
}: {
  organisationId: string;
  metric?: string;
  days?: number;
  from?: string;
  to?: string;
}) {
  const [params, setParams] = useState<Record<string, string | number | undefined>>({ metric: METRIC[metric] || metric || 'total' });
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setParams({ metric: METRIC[metric] || metric || 'total' });
    setDetail(null);
  }, [organisationId, metric, days, from, to]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api
      .analyticsDrill({ days, from, to, organisationId, ...params })
      .then((r) => { if (live) setRes(r); })
      .catch((e: any) => { if (live) { setRes(null); setError(e.message || 'Could not load this breakdown'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [organisationId, days, from, to, params]);

  const chips = Object.entries(params).filter(([k, v]) => k !== 'metric' && v !== undefined && v !== '');

  if (detail) {
    const withheld = (detail.particulars || []).filter((p: any) => p.kind === 'WITHHELD');
    const allowed = (detail.particulars || []).filter((p: any) => p.kind === 'ALLOWED');
    return (
      <div className="space-y-3">
        <button type="button" className="text-xs font-semibold text-brand-700" onClick={() => setDetail(null)}>Back</button>
        <div className="flex items-center gap-3">
          <Avatar name={detail.fullName} src={photoUrl(detail.photoPath)} size={46} />
          <div className="min-w-0 flex-1">
            <b className="block truncate">{detail.fullName}</b>
            <span className="text-xs text-slate-500">{detail.invite?.purpose}</span>
          </div>
          <StatusPill status={detail.status} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Host', detail.invite?.host?.fullName],
            ['Location', detail.locationName],
            ['Gate', detail.gateName],
            ['Officer', detail.entryByName],
            ['In', detail.enteredAt && fmtDate(detail.enteredAt)],
            ['Out', detail.exitedAt && fmtDate(detail.exitedAt)],
            ['Phone', detail.phone],
            ['Email', detail.email],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-slate-50 p-2.5">
              <dt className="text-[10px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        {withheld.length > 0 && <ItemBox label="Withheld" items={withheld} tone="rose" />}
        {allowed.length > 0 && <ItemBox label="Allowed" items={allowed} tone="emerald" />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!!chips.length && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(([k, v]) => (
            <button key={k} type="button" className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600" onClick={() => setParams((p) => ({ ...p, [k]: undefined }))}>
              {k} · {String(v)} ×
            </button>
          ))}
        </div>
      )}
      {error && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {loading && !res ? <p className="text-sm text-slate-500">Loading breakdown…</p> : null}
      <DrillFacets facets={res?.facets} onPick={(patch) => setParams((p) => ({ ...p, ...patch }))} />
      <p className="text-xs text-slate-500">{res ? `${Number(res.total || 0).toLocaleString()} records` : ''}</p>
      {!loading && res && !res.rows?.length ? <Empty icon={<span />} title="No records" hint="Nothing matches these filters." /> : null}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
        {(res?.rows || []).map((row: any) => (
          <li key={row.id}>
            <button type="button" onClick={() => setDetail(row)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
              <Avatar name={row.fullName || row.purpose || 'Invite'} src={photoUrl(row.photoPath)} size={34} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{row.fullName || row.purpose || 'Invite'}</b>
                <span className="block truncate text-[11px] text-slate-500">{[row.invite?.host?.fullName || row.host?.fullName, row.locationName, relTime(row.enteredAt || row.createdAt)].filter(Boolean).join(' · ')}</span>
              </span>
              <StatusPill status={row.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemBox({ label, items, tone }: { label: string; items: any[]; tone: 'rose' | 'emerald' }) {
  const cls = tone === 'rose' ? 'border-rose-100 bg-rose-50 text-rose-900' : 'border-emerald-100 bg-emerald-50 text-emerald-900';
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <ul className={`space-y-1 rounded-xl border p-2 text-xs ${cls}`}>
        {items.map((item, i) => <li key={i}>{item.description}{item.quantity > 1 ? ` ×${item.quantity}` : ''}{item.gate ? ` · ${item.gate}` : ''}</li>)}
      </ul>
    </div>
  );
}
