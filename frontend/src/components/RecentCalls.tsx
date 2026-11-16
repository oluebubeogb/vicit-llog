'use client';

import { useEffect, useState } from 'react';
import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react';
import { api } from '@/lib/api';
import { InAppCallButton, PhoneCallLink } from '@/components/CallButtons';
import { callDurationMs, fmtCallClock, fmtTime, relTime } from '@/lib/format';

const STATUS: Record<string, string> = {
  RINGING: 'Ringing',
  ACCEPTED: 'On the line',
  ENDED: 'Ended',
  DECLINED: 'Declined',
  BUSY: 'Busy',
  MISSED: 'No answer',
  CANCELLED: 'Cancelled',
};

/** Talk time: the server-stored duration wins; older rows fall back to endedAt - answeredAt. */
export function callTalkMs(c: any): number | null {
  if (typeof c?.durationSec === 'number' && c.durationSec > 0) return c.durationSec * 1000;
  const ms = callDurationMs(c?.answeredAt, c?.endedAt);
  return ms && ms > 0 ? ms : null;
}

export function callKind(c: any): 'incoming' | 'outgoing' | 'missed' {
  const connected = !!c?.connected || !!c?.answeredAt;
  const incoming = c?.youAre === 'callee';
  if (incoming && !connected && !['RINGING', 'ACCEPTED'].includes(c?.status)) return 'missed';
  return incoming ? 'incoming' : 'outgoing';
}

const KIND = {
  incoming: { label: 'Incoming', icon: PhoneIncoming, tile: 'from-emerald-100 to-emerald-50 text-emerald-600' },
  outgoing: { label: 'Outgoing', icon: PhoneOutgoing, tile: 'from-brand-100 to-brand-50 text-brand-600' },
  missed: { label: 'Missed', icon: PhoneMissed, tile: 'from-rose-100 to-rose-50 text-rose-600' },
} as const;

export function useRecentCalls() {
  const [rows, setRows] = useState<any[] | null>(null);
  async function load() {
    try {
      const list = await api.recentRings();
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    }
  }
  useEffect(() => {
    load();
    const onRing = () => { load(); };
    window.addEventListener('vicit:ring', onRing);
    return () => window.removeEventListener('vicit:ring', onRing);
  }, []);
  return rows;
}

export default function RecentCalls({
  rows: given,
  limit,
  title = true,
  emptyHint,
}: {
  rows?: any[] | null;
  limit?: number;
  title?: boolean;
  emptyHint?: string;
}) {
  const own = useRecentCalls();
  const rows = given !== undefined ? given : own;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function callback(id: string) {
    setBusy(id);
    setError('');
    try {
      const call = await api.ringCallback(id);
      window.dispatchEvent(new CustomEvent('vicit:ring-local', { detail: call }));
    } catch (e: any) {
      setError(e.message || 'Could not call back');
    } finally {
      setBusy('');
    }
  }

  if (rows && !rows.length) {
    return emptyHint ? <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">{emptyHint}</p> : null;
  }

  return (
    <section data-testid="recent-calls">
      {title && <p className="section-title flex items-center gap-1.5"><PhoneCall size={13} /> Recent calls</p>}
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      {!rows ? (
        <p className="text-xs text-slate-500">Loading calls…</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, limit || 50).map((c) => {
            const other = c.other || (c.youAre === 'callee' ? c.caller || c.from : c.callee || c.to);
            const subject = c.visitor?.fullName || c.dispatch?.courierName || '';
            const kind = callKind(c);
            const K = KIND[kind];
            const Icon = K.icon;
            const talk = callTalkMs(c);
            const connected = !!c.connected || !!c.answeredAt;
            const label = kind === 'missed'
              ? (['DECLINED', 'BUSY'].includes(c.status) ? STATUS[c.status] : '')
              : !connected && ['MISSED', 'CANCELLED', 'ENDED'].includes(c.status)
                ? 'Not answered'
                : STATUS[c.status] || c.status;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5" data-kind={kind}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${K.tile}`} title={K.label}>
                  <Icon size={16} />
                </span>
                <div className="min-w-[10rem] flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{other?.fullName || 'Unknown'}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {K.label}{label ? ` · ${label}` : ''}
                    {connected && talk != null ? ` · ${fmtCallClock(talk)}` : ''}
                    {subject ? ` · ${subject}` : ''}
                  </p>
                  <p className="text-[10px] text-slate-400">{fmtTime(c.createdAt)} · {relTime(c.createdAt)}</p>
                </div>
                <div className="ml-auto flex shrink-0 flex-row items-center gap-1">
                  {c.canCallback && (
                    <InAppCallButton
                      compact
                      label={busy === c.id ? 'Calling…' : 'Call back'}
                      disabled={busy === c.id}
                      onClick={() => callback(c.id)}
                    />
                  )}
                  <PhoneCallLink phone={c.phone || other?.phone} compact />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
