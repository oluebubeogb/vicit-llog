'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import {
  Users,
  Clock,
  CheckCircle2,
  ArrowUpDown,
  LayoutDashboard,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Tooltip from '@/components/ui/Tooltip';
import { Empty, SkeletonList } from '@/components/ui/Bits';
import { fmtDuration, fmtTime, photoUrl, relTime } from '@/lib/format';

export default function GateVisitsPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.gateVisits(filter || undefined);
      setVisits(Array.isArray(data) ? data : []);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    loadVisits();
  }, [router, loadVisits]);

  const sortedVisits = [...visits].sort((a, b) => {
    const da = new Date(a.enteredAt || a.createdAt || 0).getTime();
    const db = new Date(b.enteredAt || b.createdAt || 0).getTime();
    return sortDesc ? db - da : da - db;
  });

  const onSite = visits.filter((v) => v.status === 'ARRIVED').length;
  const exited = visits.filter((v) => v.status === 'EXITED').length;
  const pending = visits.filter((v) => v.status === 'INVITED').length;

  const open = (v: any) => {
    if (v.passphrase) router.push(`/gate?code=${encodeURIComponent(v.passphrase)}`);
    else router.push('/gate');
  };

  const stats = [
    { l: 'Registered', v: pending, icon: <Users size={17} />, tone: 'from-brand-50 to-brand-100 text-brand-600', f: 'pending', tip: 'Registered and expected, not yet at the gate' },
    { l: 'On site', v: onSite, icon: <Clock size={17} />, tone: 'from-emerald-50 to-emerald-100 text-emerald-600', f: 'on_site', tip: 'Checked in and still on the premises' },
    { l: 'Exited', v: exited, icon: <CheckCircle2 size={17} />, tone: 'from-slate-50 to-slate-100 text-slate-600', f: 'exited', tip: 'Signed out at the gate' },
  ];

  return (
    <div className="page">
      <PageHeader
        icon={<LayoutDashboard size={20} />}
        title="Visits"
        subtitle="Invite and entry overview"
        info="Tap any visitor to open them in the scanner, ready to check in or out."
        actions={
          <Tooltip content="Refresh">
            <button type="button" onClick={loadVisits} className="icon-btn" aria-label="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
        }
      />

      <div className="stagger mb-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <Tooltip key={s.l} content={s.tip}>
            <button
              type="button"
              onClick={() => setFilter(filter === s.f ? '' : s.f)}
              className={`card card-art group p-3 text-center transition ${filter === s.f ? '!border-brand-300 ring-2 ring-brand-200' : ''}`}
            >
              <span className={`mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.tone} transition group-hover:scale-110`}>{s.icon}</span>
              <p className="text-xl font-bold text-slate-900">{s.v}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{s.l}</p>
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="segmented grid w-full grid-cols-4">
            {[
              { id: '', label: 'All' },
              { id: 'pending', label: 'Registered' },
              { id: 'on_site', label: 'On site' },
              { id: 'exited', label: 'Exited' },
            ].map((f) => (
              <button key={f.id} type="button" data-active={filter === f.id} onClick={() => setFilter(f.id)} className="whitespace-nowrap !px-1 !text-[13px]">
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <Tooltip content={sortDesc ? 'Showing newest first' : 'Showing oldest first'}>
          <button onClick={() => setSortDesc((s) => !s)} className="btn-ghost !px-3 !py-2 !text-xs">
            <ArrowUpDown size={14} />
            <span className="sr-only">{sortDesc ? 'Newest' : 'Oldest'}</span>
          </button>
        </Tooltip>
      </div>

      {loading && !visits.length ? (
        <SkeletonList rows={6} />
      ) : sortedVisits.length === 0 ? (
        <Empty icon={<Users size={24} />} title="No visits found" hint="Registered visitors will appear here as they come in." />
      ) : (
        <ul className="rows stagger">
          {sortedVisits.map((v) => (
            <li key={v.visitorId}>
              <button type="button" onClick={() => open(v)} className="row-link group">
                <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-800">{v.fullName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {v.purpose}
                    {v.hostName ? <> · <span className="text-slate-600">{v.hostName}</span></> : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {v.enteredAt ? `In ${fmtTime(v.enteredAt)}` : v.deniedAt ? `Declined ${relTime(v.deniedAt)}` : `Invited ${relTime(v.createdAt)}`}
                    {v.exitedAt && ` · Out ${fmtTime(v.exitedAt)}`}
                    {v.enteredAt && v.exitedAt && ` · ${fmtDuration(Math.round((+new Date(v.exitedAt) - +new Date(v.enteredAt)) / 60000))}`}
                  </span>
                </span>
                <StatusPill status={v.status} />
                <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
