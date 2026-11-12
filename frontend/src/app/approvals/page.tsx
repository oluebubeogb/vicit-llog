'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ClipboardCheck, History, Loader2, Mail, X } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import { Notice } from '@/components/ui/Bits';
import { api, getUser } from '@/lib/api';
import { avatarUrl, fmtDate, relTime } from '@/lib/format';
import { ApprovalTimeline, ChangeList } from '@/components/ApprovalBits';
import { guestLabel } from '@/components/InviteBits';

/**
 * One place for approvals: pending profile changes (and, for agency admins, invites awaiting
 * approval) with Approve / Reject, and the approve / reject history on the same page.
 * Opened from the orange "Pending approvals" card on the dashboard.
 */
export default function ApprovalsPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [edits, setEdits] = useState<any[] | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'APPROVED' | 'DECLINED'>('ALL');

  const load = useCallback(async (u = me) => {
    if (!u) return;
    const [e, inv] = await Promise.all([
      api.listProfileEdits().catch(() => []),
      u.role === 'ADMIN' ? api.allInvites().catch(() => []) : Promise.resolve([]),
    ]);
    setEdits(e || []);
    setInvites((inv || []).filter((i: any) => i.status === 'AWAITING_APPROVAL' || i.status === 'OFFLINE_PENDING'));
  }, [me]);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace('/login'); return; }
    if (!['ADMIN', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(u.role)) { router.replace('/dashboard'); return; }
    setMe(u);
    load(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function review(id: string, approve: boolean) {
    setBusy(id + approve);
    setMsg(null);
    try {
      await api.reviewProfileEdit(id, approve, notes[id]?.trim() || undefined);
      setMsg({ tone: 'success', text: approve ? 'Approved — the changes are live.' : 'Rejected — the user has been notified.' });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'error', text: e.message || 'Could not save' });
    } finally {
      setBusy('');
    }
  }

  async function inviteDecision(inv: any, approve: boolean) {
    setBusy(inv.id + approve);
    setMsg(null);
    try {
      if (approve) await api.approveOffline(inv.id);
      else await api.cancelInvite(inv.id, notes[inv.id]?.trim() || 'Rejected by administrator');
      setMsg({ tone: 'success', text: approve ? 'Invite approved — guests are being emailed.' : 'Invite rejected and the host notified.' });
      await load();
    } catch (e: any) {
      setMsg({ tone: 'error', text: e.message || 'Could not save' });
    } finally {
      setBusy('');
    }
  }

  const pending = (edits || []).filter((r) => r.status === 'PENDING');
  const history = (edits || []).filter((r) => r.status !== 'PENDING' && (filter === 'ALL' || r.status === filter));
  const pendingCount = pending.length + invites.length;

  return (
    <div className="page">
      <PageHeader
        back={me?.role === 'ADMIN' ? '/dashboard' : '/platform'}
        icon={<ClipboardCheck size={20} />}
        title="Approvals"
        subtitle={pendingCount ? `${pendingCount} waiting for you` : 'All caught up'}
        info="Staff profile changes wait here for an administrator. Edits made by admins and Super Admins apply straight away and are listed in the history. Every decision is also written to the audit log."
      />

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="surface animate-in mb-4 space-y-3" data-testid="approvals-pending">
        <p className="section-title !mb-0 flex items-center gap-2">
          Pending
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{pendingCount}</span>
        </p>
        {edits === null && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>}
        {edits !== null && !pendingCount && <p className="text-sm text-slate-500">Nothing waiting for approval.</p>}
        {pending.map((r) => (
          <div key={r.id} className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-3">
            <div className="flex items-start gap-3">
              <Avatar name={r.user?.fullName || 'User'} src={avatarUrl(r.user?.avatarPath)} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{r.user?.fullName || 'User'}</p>
                <p className="text-[11px] text-slate-500">Profile change · {relTime(r.createdAt)}{r.user?.organisation?.code ? ` · ${r.user.organisation.code}` : ''}</p>
                <div className="mt-2"><ChangeList r={r} /></div>
              </div>
            </div>
            <input className="input mt-3 !py-2 text-sm" placeholder="Note (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="btn-success !py-2.5" disabled={!!busy} onClick={() => review(r.id, true)}>
                {busy === r.id + 'true' ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />} Approve
              </button>
              <button type="button" className="btn-danger !py-2.5" disabled={!!busy} onClick={() => review(r.id, false)}>
                {busy === r.id + 'false' ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />} Reject
              </button>
            </div>
          </div>
        ))}
        {invites.map((inv) => (
          <div key={inv.id} className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-3">
            <div className="flex items-start gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Mail size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{inv.purpose}</p>
                <p className="text-[11px] text-slate-500">Invite by {inv.host?.fullName || 'staff'} · {guestLabel(inv)} · {relTime(inv.createdAt)}</p>
                {inv.expectedAt && <p className="text-[11px] text-slate-500">Expected {fmtDate(inv.expectedAt)}</p>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn-success !py-2.5" disabled={!!busy} onClick={() => inviteDecision(inv, true)}><Check size={16} /> Approve</button>
              <button type="button" className="btn-danger !py-2.5" disabled={!!busy} onClick={() => inviteDecision(inv, false)}><X size={16} /> Reject</button>
            </div>
          </div>
        ))}
      </section>

      <section className="surface animate-in space-y-3" data-testid="approvals-history">
        <div className="flex items-center justify-between gap-2">
          <p className="section-title !mb-0 flex items-center gap-2"><History size={15} /> History</p>
          <div className="segmented !p-0.5 text-xs">
            {(['ALL', 'APPROVED', 'DECLINED'] as const).map((f) => (
              <button key={f} type="button" data-active={filter === f} onClick={() => setFilter(f)} className="!px-2.5 !py-1">
                {f === 'ALL' ? 'All' : f === 'APPROVED' ? 'Approved' : 'Rejected'}
              </button>
            ))}
          </div>
        </div>
        <ApprovalTimeline rows={history} />
      </section>
    </div>
  );
}
