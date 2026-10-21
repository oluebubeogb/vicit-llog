'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, getUser } from '@/lib/api';
import Link from 'next/link';
import { RotateCcw, Search, UserPlus, Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Sheet from '@/components/ui/Sheet';
import StatusPill from '@/components/ui/StatusPill';
import { Empty, Notice, SkeletonList } from '@/components/ui/Bits';
import { InviteDetail, InviteRow } from '@/components/InviteBits';
import { inviteStatus } from '@/lib/format';

const FILTERS = [
  { k: 'all', l: 'All' },
  { k: 'live', l: 'Active' },
  { k: 'onsite', l: 'On site' },
  { k: 'pending', l: 'Pending' },
  { k: 'expired', l: 'Expired' },
] as const;

export default function VisitorsPage() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['k']>('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (r = role) => (r === 'ADMIN' ? api.allInvites() : api.myInvites());

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
    load(u?.role)
      .then(setInvites)
      .catch(() => setInvites([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invites.filter((inv) => {
      const st = inviteStatus(inv);
      const expiredLike = st === 'EXPIRED' || (inv.expiresAt && new Date(inv.expiresAt) < new Date() && st !== 'USED');
      if (filter === 'live' && !['ACTIVE', 'USED'].includes(st)) return false;
      if (filter === 'onsite' && !(inv.visitors || []).some((v: any) => v.status === 'ARRIVED')) return false;
      if (filter === 'pending' && !['OFFLINE_PENDING', 'AWAITING_APPROVAL'].includes(st)) return false;
      if (filter === 'expired' && !expiredLike) return false;
      if (!term) return true;
      const hay = [inv.purpose, inv.host?.fullName, ...(inv.guestNames || []), ...(inv.visitors || []).map((v: any) => `${v.fullName} ${v.phone || ''}`)]
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [invites, filter, q]);

  const canRevive = (d: any) =>
    d && (d.status === 'EXPIRED' || (d.expiresAt && new Date(d.expiresAt) < new Date() && d.status !== 'USED'));

  return (
    <div className="page">
      <PageHeader
        back={role === 'GATE' ? '/gate' : '/dashboard'}
        icon={<Users size={20} />}
        title={role === 'ADMIN' ? 'All visitors' : 'My visitors'}
        subtitle={loading ? 'Loading…' : `${invites.length} invites`}
        info="Tap any invite to see its guests, gate timeline, passphrase and link."
        actions={
          <Link href="/invite/new" className="btn-primary !px-3" aria-label="New invite">
            <UserPlus size={17} /> <span className="hidden min-[380px]:inline">Invite</span>
          </Link>
        }
      />

      <div className="animate-in mb-3 space-y-2.5">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input !py-2.5 pl-10"
            placeholder="Search guest, phone or purpose"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div>
          <div className="segmented grid w-full grid-cols-5">
            {FILTERS.map((f) => (
              <button key={f.k} type="button" data-active={filter === f.k} onClick={() => setFilter(f.k)} className="!px-1 !text-[13px]">
                {f.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : list.length === 0 ? (
        <Empty
          icon={<Users size={24} />}
          title={invites.length ? 'No matches' : 'No visitors yet'}
          hint={invites.length ? 'Try a different filter or search.' : 'Invites you create will appear here with live status.'}
        />
      ) : (
        <ul className="rows stagger">
          {list.map((inv) => (
            <InviteRow key={inv.id} inv={inv} showHost={role === 'ADMIN'} onClick={() => { setErr(''); setDetail(inv); }} />
          ))}
        </ul>
      )}

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        icon={<Users size={20} />}
        title={detail?.purpose}
        subtitle={detail && <StatusPill status={inviteStatus(detail)} />}
        footer={
          canRevive(detail) ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr('');
                try {
                  await api.reviveInvite(detail.id);
                  setInvites(await load());
                  setDetail(null);
                } catch (e: any) {
                  setErr(e.message);
                } finally {
                  setBusy(false);
                }
              }}
              className="btn-primary w-full"
            >
              <RotateCcw size={16} /> {busy ? 'Reviving…' : 'Revive expired link'}
            </button>
          ) : undefined
        }
      >
        {err && <Notice tone="error">{err}</Notice>}
        {detail && <InviteDetail inv={detail} />}
      </Sheet>
    </div>
  );
}
