'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getUser } from '@/lib/api';
import Link from 'next/link';
import { Loader2, RotateCcw, Search, Sparkles, UserPlus, Users, X } from 'lucide-react';
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
  // Server-side ranked search (multi-word OR, best matches first)
  const [hits, setHits] = useState<{ q: string; tokens: string[]; total: number; page: number; pageSize: number; results: any[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  const [nonce, setNonce] = useState(0);
  const term = q.trim();

  useEffect(() => {
    if (!term) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const my = ++seq.current;
    const t = setTimeout(() => {
      api
        .searchInvites(term, 1)
        .then((r) => my === seq.current && setHits({ q: term, ...r }))
        .catch(() => my === seq.current && setHits({ q: term, tokens: [], total: 0, page: 1, pageSize: 30, results: [] }))
        .finally(() => my === seq.current && setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [term, nonce]);

  async function loadMore() {
    if (!hits || more) return;
    setMore(true);
    const my = seq.current;
    try {
      const r = await api.searchInvites(hits.q, hits.page + 1, hits.pageSize);
      if (my === seq.current) setHits((h) => (h ? { ...h, page: r.page, total: r.total, results: [...h.results, ...r.results] } : h));
    } finally {
      setMore(false);
    }
  }

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
    const source = term && hits ? hits.results : invites;
    return source.filter((inv) => {
      const st = inviteStatus(inv);
      const expiredLike = st === 'EXPIRED' || (inv.expiresAt && new Date(inv.expiresAt) < new Date() && st !== 'USED');
      if (filter === 'live' && !['ACTIVE', 'USED'].includes(st)) return false;
      if (filter === 'onsite' && !(inv.visitors || []).some((v: any) => v.status === 'ARRIVED')) return false;
      if (filter === 'pending' && !['OFFLINE_PENDING', 'AWAITING_APPROVAL'].includes(st)) return false;
      if (filter === 'expired' && !expiredLike) return false;
      return true;
    });
  }, [invites, hits, filter, term]);
  const searchMode = !!term;
  const pending = searchMode && (searching || !hits || hits.q !== term);

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
            className="input !py-2.5 pl-10 pr-10"
            placeholder="Search names, phones, descriptions, personal…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            aria-label="Search visitors and invites"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              {searching ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
            </button>
          )}
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

      {searchMode && hits && !pending && (
        <p className="animate-in mb-2 flex flex-wrap items-center gap-1.5 px-1 text-xs text-slate-500">
          <Sparkles size={13} className="text-brand-500" />
          <b className="text-slate-800">{hits.total}</b> match{hits.total === 1 ? '' : 'es'}
          {hits.tokens.length > 1 && <> for any of {hits.tokens.map((t) => <span key={t} className="rounded-full bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700 ring-1 ring-brand-100">{t}</span>)} <span className="whitespace-nowrap">· best matches first</span></>}
          {filter !== 'all' && list.length !== hits.results.length && <> · {list.length} shown with this filter</>}
        </p>
      )}

      {loading || pending ? (
        <SkeletonList rows={6} />
      ) : list.length === 0 ? (
        <Empty
          icon={<Users size={24} />}
          title={invites.length || searchMode ? 'No matches' : 'No visitors yet'}
          hint={invites.length || searchMode ? 'Try other words or a different filter.' : 'Invites you create will appear here with live status.'}
        />
      ) : (
        <ul className="rows stagger">
          {list.map((inv) => (
            <InviteRow key={inv.id} inv={inv} showHost={role === 'ADMIN'} onClick={() => { setErr(''); setDetail(inv); }} />
          ))}
        </ul>
      )}
      {searchMode && hits && !pending && hits.results.length < hits.total && (
        <button type="button" onClick={loadMore} disabled={more} className="btn-ghost mt-3 w-full">
          {more ? <Loader2 size={16} className="animate-spin" /> : null} {more ? 'Loading…' : `Load more (${hits.total - hits.results.length} left)`}
        </button>
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
                  if (term) setNonce((n) => n + 1); // refresh ranked results too
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
