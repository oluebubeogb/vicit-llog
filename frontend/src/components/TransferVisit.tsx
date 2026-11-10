'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { api } from '@/lib/api';
import SleekOverlay from '@/components/ui/SleekOverlay';
import { Notice } from '@/components/ui/Bits';

export default function TransferVisit({
  open,
  onClose,
  visitor,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  visitor: { id: string; fullName?: string; invite?: any } | null;
  onDone?: () => void;
}) {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([]);
  const [orgId, setOrgId] = useState('');
  const [hostId, setHostId] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setComment('');
    setHostId('');
    api.directoryAgencies().then(setAgencies).catch(() => setAgencies([]));
  }, [open]);

  useEffect(() => {
    if (!orgId) { setHosts([]); setHostId(''); return; }
    api.directoryHosts(orgId).then(setHosts).catch(() => setHosts([]));
  }, [orgId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!visitor) return;
    setBusy(true);
    setError('');
    try {
      await api.transferVisit(visitor.id, { toOrganisationId: orgId, toHostId: hostId || undefined, comment });
      onDone?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SleekOverlay open={open} onClose={onClose} title="Transfer visit" subtitle={visitor?.fullName ? `Move ${visitor.fullName} to another agency` : 'Move this visit'} icon={<ArrowRightLeft size={20} />}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Destination agency</span>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="input" required>
            <option value="">Choose an agency</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Host (optional)</span>
          <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="input" disabled={!orgId}>
            <option value="">Assign later</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>{h.fullName}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Comment</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="input min-h-[96px]" required minLength={3} placeholder="Why is this visit moving?" />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" disabled={busy || !orgId || comment.trim().length < 3} className="btn-primary w-full">
          {busy ? 'Transferring…' : 'Transfer visit'}
        </button>
      </form>
    </SleekOverlay>
  );
}
