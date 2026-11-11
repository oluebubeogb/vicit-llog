'use client';

import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { api } from '@/lib/api';
import { InAppCallButton, PhoneCallLink } from '@/components/CallButtons';
import { callDurationMs, fmtCallClock, relTime } from '@/lib/format';

const STATUS: Record<string, string> = {
  RINGING: 'Ringing',
  ACCEPTED: 'Answered',
  ENDED: 'Ended',
  DECLINED: 'Declined',
  BUSY: 'Busy',
  MISSED: 'No answer',
  CANCELLED: 'Cancelled',
};

export default function RecentCalls({ compact }: { compact?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const list = await api.recentRings();
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onRing = () => { load(); };
    window.addEventListener('vicit:ring', onRing);
    return () => window.removeEventListener('vicit:ring', onRing);
  }, []);

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

  if (rows && !rows.length) return null;

  return (
    <section className={compact ? '' : 'mb-5'}>
      <p className="section-title flex items-center gap-1.5"><PhoneCall size={13} /> Recent calls</p>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}
      {!rows ? (
        <p className="text-xs text-slate-500">Loading calls…</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, compact ? 6 : 20).map((c) => {
            const other = c.youAre === 'callee' ? c.from : c.to;
            const subject = c.visitor?.fullName || c.dispatch?.courierName || 'Call';
            const dur = callDurationMs(c.answeredAt, c.endedAt);
            const unanswered = ['MISSED', 'CANCELLED'].includes(c.status) || (c.status === 'ENDED' && !c.answeredAt);
            const label = unanswered ? 'Not answered' : (STATUS[c.status] || c.status);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{other?.fullName || 'Unknown'}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {subject} · {label}{dur != null ? ` · ${fmtCallClock(dur)}` : ''} · {relTime(c.endedAt || c.createdAt)}
                  </p>
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
