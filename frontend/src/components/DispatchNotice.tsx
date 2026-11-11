'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { api, getToken, getUser } from '@/lib/api';
import SleekOverlay from '@/components/ui/SleekOverlay';

export default function DispatchNotice() {
  const [item, setItem] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const user = getUser();
    if (!getToken() || !user) return;
    // Super Admin / gate officers should not be blocked by a receipt overlay while working elsewhere.
    // Hosts and agency admins see it when they have an outstanding receipt.
    if (!['STAFF', 'ADMIN', 'GLOBAL_ADMIN'].includes(String(user.role))) return;
    try {
      const rows = await api.dispatchInbox();
      const next = Array.isArray(rows) ? rows.find((r: any) => !r.acknowledgedAt) : null;
      setItem(next || null);
    } catch {
      /* staff without access just skip */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    window.addEventListener('vicit:notification', load);
    window.addEventListener('vicit-auth-updated', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('vicit:notification', load);
      window.removeEventListener('vicit-auth-updated', load);
    };
  }, [load]);

  async function ack() {
    if (!item?.dispatchId) return;
    setBusy(true); setError('');
    try {
      await api.acknowledgeDispatch(item.dispatchId, { comment: comment.trim() || undefined, organisationId: item.organisation?.id });
      setComment('');
      setItem(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not acknowledge');
    } finally {
      setBusy(false);
    }
  }

  if (!item) return null;
  const d = item.dispatch || {};
  const items = (d.items || []).map((i: any) => i.description).filter(Boolean).join(', ');

  return (
    <SleekOverlay
      open
      onClose={() => setItem(null)}
      title="Dispatch arriving"
      subtitle={item.organisation?.name || 'Acknowledge receipt'}
      size="md"
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Package size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900">{d.courierName || 'Courier'}</p>
            <p className="text-xs text-slate-500">{[d.courierCompany, d.courierPhone].filter(Boolean).join(' · ')}</p>
            {items && <p className="mt-1 text-sm text-slate-700">{items}</p>}
          </div>
        </div>
        <label className="block">
          <span className="label">Comment (optional)</span>
          <textarea className="input min-h-[72px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Received in good order…" maxLength={1000} />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="button" disabled={busy} onClick={ack} className="btn-primary w-full !py-3">
          {busy ? 'Saving…' : 'Acknowledge receipt'}
        </button>
      </div>
    </SleekOverlay>
  );
}
