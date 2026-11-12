'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import { photoUrl, avatarUrl, inviteStatus } from '@/lib/format';
import { statusMeta } from '@/components/ui/StatusPill';

const human = (s: string = '') => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function InviteReview({ summary }: { summary: any }) {
  const [detail, setDetail] = useState<any>(summary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.platformInvite(summary.id)
      .then((row) => { if (live) setDetail(row); })
      .catch(() => { if (live) setDetail(summary); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [summary]);

  const invite = detail || summary;
  const visitors = invite.visitors || [];
  const items = visitors.flatMap((v: any) => (v.gateVisits || []).flatMap((event: any) => (event.particulars || []).map((item: any) => ({ ...item, guest: v.fullName, gate: event.gate?.name }))));
  const withheld = items.filter((item: any) => item.kind === 'WITHHELD');
  const allowed = items.filter((item: any) => item.kind === 'ALLOWED');
  const history = visitors.flatMap((v: any) => (v.gateVisits || []).map((event: any) => ({ ...event, guest: v.fullName })));

  return (
    <div className="space-y-4">
      {loading && <p className="text-xs text-slate-400">Loading invitation…</p>}
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Cell label="Host" value={[invite.host?.fullName, invite.host?.phone, invite.host?.email].filter(Boolean).join(' · ') || '—'} />
        <Cell label="Agency" value={invite.organisation?.name || '—'} />
        <Cell label="Location" value={[invite.location?.name, invite.location?.address].filter(Boolean).join(' · ') || '—'} />
        <Cell label="Category" value={human(invite.category || 'OFFICIAL')} />
        <Cell label="Expected" value={invite.expectedAt ? new Date(invite.expectedAt).toLocaleString() : '—'} />
        <Cell label="Created" value={invite.createdAt ? new Date(invite.createdAt).toLocaleString() : '—'} />
        <Cell label="Expires" value={invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : '—'} />
        <Cell label="Status" value={statusMeta(inviteStatus(invite) || invite.status || 'Pending').label} />
      </dl>
      {visitors.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Visitors</p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {visitors.map((v: any) => (
              <li key={v.id} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate">{v.fullName}</b>
                      <StatusPill status={v.status} />
                    </div>
                    <p className="text-xs text-slate-500">{[v.phone, v.email, v.enteredAt && `In ${new Date(v.enteredAt).toLocaleString()}`, v.exitedAt && `Out ${new Date(v.exitedAt).toLocaleString()}`, v.deniedReason].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {withheld.length > 0 && <ItemList label="Withheld" rows={withheld} tone="border-rose-100 bg-rose-50 text-rose-900" />}
      {allowed.length > 0 && <ItemList label="Allowed" rows={allowed} tone="border-emerald-100 bg-emerald-50 text-emerald-900" />}
      {history.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Checkpoint history</p>
          <ol className="space-y-2">
            {history.map((event: any) => (
              <li key={event.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                <b className="text-slate-800">{event.gate?.name || 'Checkpoint'}</b>
                <span className="text-slate-500"> · {event.guest} · {event.decision} · {event.officer?.fullName || 'Officer'}</span>
                <p className="text-slate-400">{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : ''}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function ItemList({ label, rows, tone }: { label: string; rows: any[]; tone: string }) {
  return (
    <section>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <ul className={`space-y-1 rounded-xl border px-3 py-2 text-sm ${tone}`}>
        {rows.map((item) => <li key={item.id}>{item.description}{item.quantity > 1 ? ` ×${item.quantity}` : ''}{item.guest ? ` · ${item.guest}` : ''}{item.returnedAt ? ' · Returned' : ''}</li>)}
      </ul>
    </section>
  );
}

export function AuditReview({ item }: { item: any }) {
  const ctx = item.context || {};
  const actor = ctx.actor || {};
  const changes = Array.isArray(ctx.changes) ? ctx.changes : [];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{human(item.action)}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">{ctx.target?.label || item.entity}</h3>
        <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Cell label="Who" value={[actor.name || item.user?.fullName || 'System', actor.email].filter(Boolean).join(' · ')} />
        <Cell label="Role" value={human(actor.role || item.user?.role || 'System')} />
        <Cell label="Agency" value={ctx.agency?.name || actor.agency || '—'} />
        <Cell label="Location" value={ctx.location?.name || '—'} />
        <Cell label="Gate" value={ctx.gate?.name || '—'} />
        <Cell label="Target" value={`${human(item.entity || '')}${ctx.target?.label ? ` · ${ctx.target.label}` : ''}`} />
        <Cell label="When" value={new Date(item.createdAt).toLocaleString()} />
        <Cell label="IP" value={ctx.ip || item.ip || '—'} />
        <Cell label="Device" value={ctx.device || ctx.userAgent || item.userAgent || '—'} />
        <Cell label="Visitor" value={ctx.visitor?.fullName || '—'} />
        <Cell label="Invitation" value={ctx.invite?.purpose || '—'} />
        <Cell label="Host" value={ctx.invite?.host?.fullName || ctx.visitor?.invite?.host?.fullName || '—'} />
      </dl>
      {changes.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Changes</p>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            {changes.map((change: any) => (
              <div key={change.field} className="grid gap-1 border-t border-slate-100 px-3 py-2.5 text-xs first:border-t-0 sm:grid-cols-[8rem_1fr_1fr]">
                <b className="text-slate-700">{human(change.field)}</b>
                <span className="text-rose-700 line-through">{formatVal(change.from)}</span>
                <span className="font-medium text-emerald-800">{formatVal(change.to)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatVal(value: any) {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
