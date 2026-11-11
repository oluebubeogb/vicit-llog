'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  Search,
  X,
  CalendarClock,
  Loader2,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Tooltip from '@/components/ui/Tooltip';
import { Empty, SkeletonList } from '@/components/ui/Bits';
import { fmtDate, fmtDuration, fmtTime, photoUrl, relTime } from '@/lib/format';

type Period = 'current' | 'scheduled';

export default function GateVisitsPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<any[]>([]);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [period, setPeriod] = useState<Period>('current');
  const [sortDesc, setSortDesc] = useState(true);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setTerm(q.trim()), 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q]);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const statusFilter = period === 'scheduled' ? 'scheduled' : (filter || undefined);
      const [data, upcoming] = await Promise.all([
        api.gateVisits(statusFilter, term || undefined),
        period === 'scheduled' ? Promise.resolve(null) : api.gateVisits('scheduled', term || undefined).catch(() => []),
      ]);
      setVisits(Array.isArray(data) ? data : []);
      if (period === 'scheduled') setScheduledCount(Array.isArray(data) ? data.length : 0);
      else setScheduledCount(Array.isArray(upcoming) ? upcoming.length : 0);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [filter, period, term]);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    loadVisits();
  }, [router, loadVisits]);

  const sortedVisits = [...visits].sort((a, b) => {
    if (period === 'scheduled') {
      const da = new Date(a.expectedAt || a.createdAt || 0).getTime();
      const db = new Date(b.expectedAt || b.createdAt || 0).getTime();
      return sortDesc ? db - da : da - db;
    }
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
        info="Today and past visits stay here. Future-dated visits live under Scheduled. Tap a visitor to open them in the scanner."
        actions={
          <Tooltip content="Refresh">
            <button type="button" onClick={loadVisits} className="icon-btn" aria-label="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
        }
      />

      <label className="relative mb-3 block">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input !py-2.5 pl-10 pr-10"
          placeholder="Search name, phone, host, agency, code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          aria-label="Search visits"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
          </button>
        )}
      </label>

      <div className="mb-3">
        <div className="segmented grid w-full grid-cols-2">
          <button type="button" data-active={period === 'current'} onClick={() => { setPeriod('current'); setFilter(''); }} className="!px-2">
            Today &amp; past
          </button>
          <button type="button" data-active={period === 'scheduled'} onClick={() => { setPeriod('scheduled'); setFilter(''); }} className="!px-2">
            Scheduled{scheduledCount ? <span className="ml-1 rounded-full bg-brand-50 px-1.5 text-[11px] font-bold text-brand-700">{scheduledCount}</span> : null}
          </button>
        </div>
      </div>

      {period === 'current' && (
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
      )}

      <div className="mb-4 flex items-center gap-2">
        {period === 'current' ? (
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
        ) : (
          <p className="min-w-0 flex-1 px-1 text-xs text-slate-500">
            <CalendarClock size={13} className="mr-1 inline -mt-0.5" />
            Visits expected after today. They no longer sit on top of today&apos;s list.
          </p>
        )}
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
        <Empty
          icon={period === 'scheduled' ? <CalendarClock size={24} /> : <Users size={24} />}
          title={term ? 'No matches' : period === 'scheduled' ? 'No scheduled visits' : 'No visits found'}
          hint={term ? 'Try another name, phone, host, agency or code.' : period === 'scheduled' ? 'Invites dated after today will appear here.' : 'Registered visitors will appear here as they come in.'}
        />
      ) : (
        <ul className="rows">
          {sortedVisits.map((v) => (
            <li key={v.visitorId}>
              <button type="button" onClick={() => open(v)} className="row-link group">
                <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-800">{v.fullName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {v.purpose}
                    {v.hostName ? <> · <span className="text-slate-600">{v.hostName}</span></> : null}
                    {v.agencyName ? <> · {v.agencyName}</> : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {period === 'scheduled' && v.expectedAt
                      ? `Expected ${fmtDate(v.expectedAt)}`
                      : v.enteredAt
                        ? `In ${fmtTime(v.enteredAt)}`
                        : v.deniedAt
                          ? `Declined ${relTime(v.deniedAt)}`
                          : v.expectedAt
                            ? `Expected ${fmtDate(v.expectedAt)}`
                            : `Invited ${relTime(v.createdAt)}`}
                    {v.exitedAt && ` · Out ${fmtTime(v.exitedAt)}`}
                    {v.enteredAt && v.exitedAt && ` · ${fmtDuration(Math.round((+new Date(v.exitedAt) - +new Date(v.enteredAt)) / 60000))}`}
                    {v.phone ? ` · ${v.phone}` : ''}
                    {v.passphrase ? ` · ${v.passphrase}` : ''}
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
