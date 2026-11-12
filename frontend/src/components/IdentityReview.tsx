'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, PhoneOff, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { photoUrl, relTime } from '@/lib/format';
import { Empty } from '@/components/ui/Bits';

/**
 * Host side of the no-contact flow: the gate's photos, one card per guest, with a green tick
 * (that's my guest) or red X (not my guest). Each guest is decided on their own.
 */
export default function IdentityReview({ visitorIds, compact }: { visitorIds?: string[]; compact?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [done, setDone] = useState<Record<string, 'CONFIRMED' | 'DECLINED'>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api.pendingIdentity();
      setRows(visitorIds?.length ? list.filter((r: any) => visitorIds.includes(r.id)) : list);
    } catch (e: any) {
      setErr(e.message || 'Could not load');
      setRows([]);
    }
  }, [visitorIds?.join(',')]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, confirm: boolean) {
    setBusy(id + confirm);
    setErr('');
    try {
      await api.reviewIdentity(id, confirm);
      setDone((d) => ({ ...d, [id]: confirm ? 'CONFIRMED' : 'DECLINED' }));
    } catch (e: any) {
      setErr(e.message || 'Could not save');
    } finally {
      setBusy('');
    }
  }

  if (!rows) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading photos…</p>;
  const shown = rows.length ? rows : [];
  if (!shown.length && !Object.keys(done).length) {
    return compact ? <p className="text-sm text-slate-500">Nothing waiting — already answered.</p> : <Empty icon={<PhoneOff size={22} />} title="No guests waiting" hint="When the gate photographs a guest without email or phone, they appear here for you to confirm." />;
  }
  return (
    <div className="space-y-2" data-testid="identity-review">
      <div className={clsx('grid gap-2.5', shown.length === 1 ? 'grid-cols-1 sm:max-w-[260px]' : 'grid-cols-2 sm:grid-cols-3')}>
        {shown.map((r) => {
          const d = done[r.id];
          return (
            <div key={r.id} className={clsx('overflow-hidden rounded-2xl border bg-white shadow-sm', d === 'CONFIRMED' ? 'border-emerald-300' : d === 'DECLINED' ? 'border-rose-300' : 'border-slate-200')}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.gatePhotoPath ? <img src={photoUrl(r.gatePhotoPath) || ''} alt={r.fullName} className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-slate-100" />}
                {d && (
                  <span className={clsx('absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-white shadow ring-2 ring-white', d === 'CONFIRMED' ? 'bg-emerald-500' : 'bg-rose-500')}>
                    {d === 'CONFIRMED' ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
                  </span>
                )}
              </div>
              <div className="px-2.5 pb-2.5 pt-2">
                <p className="truncate text-center text-sm font-semibold text-slate-800">{r.fullName}</p>
                <p className="truncate text-center text-[11px] text-slate-400">{r.invite?.purpose}{r.identityRequestedAt ? ` · ${relTime(r.identityRequestedAt)}` : ''}</p>
                {!d ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => decide(r.id, true)} disabled={!!busy} aria-label={`Confirm ${r.fullName}`} className="flex h-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60">
                      {busy === r.id + 'true' ? <Loader2 size={18} className="animate-spin" /> : <Check size={20} strokeWidth={3} />}
                    </button>
                    <button type="button" onClick={() => decide(r.id, false)} disabled={!!busy} aria-label={`Decline ${r.fullName}`} className="flex h-10 items-center justify-center rounded-xl bg-rose-500 text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-60">
                      {busy === r.id + 'false' ? <Loader2 size={18} className="animate-spin" /> : <X size={20} strokeWidth={3} />}
                    </button>
                  </div>
                ) : (
                  <p className={clsx('mt-2 text-center text-xs font-semibold', d === 'CONFIRMED' ? 'text-emerald-700' : 'text-rose-700')}>{d === 'CONFIRMED' ? 'Confirmed — gate can continue' : 'Declined at the gate'}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}
