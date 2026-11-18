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
  Tag,
  IdCard,
  CheckSquare,
} from 'lucide-react';
import { OutstandingPassSheet, PassPdfButtons, PassPreviewSheet, useOutstandingPassItems } from '@/components/GatePass';
import PageHeader from '@/components/ui/PageHeader';
import StatusPill from '@/components/ui/StatusPill';
import { NoContactIcon } from '@/components/InviteBits';
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
  // v22 gate pass protocol
  const [operator, setOperator] = useState(false);
  useEffect(() => { setOperator(['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'ADMIN'].includes(String(getUser()?.role))); }, []);
  const [protocol, setProtocol] = useState<string>('NONE');
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [outOpen, setOutOpen] = useState(false);
  const [passError, setPassError] = useState('');
  const outstanding = useOutstandingPassItems(operator);
  useEffect(() => { if (operator) api.passProtocol().then((r: any) => setProtocol(r.protocol)).catch(() => {}); }, [operator]);

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

  const printable = (v: any) => !!v.photoPath && (v.status === 'INVITED' || v.status === 'ARRIVED') && !v.cancelled;
  const pickedIds = sortedVisits.filter((v) => picked[v.visitorId]).map((v) => v.visitorId);
  const canBulkPass = operator && protocol === 'PRINTED_PASS';
  const outCount = outstanding.data?.count || 0;

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

      {operator && (protocol !== 'NONE' || outCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOutOpen(true)} className="card flex min-w-0 flex-1 items-center gap-3 border-amber-200 bg-gradient-to-br from-amber-50 to-white !p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md" data-testid="visits-tags-out">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">{protocol === 'PRINTED_PASS' ? <IdCard size={17} /> : <Tag size={17} />}</span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-slate-900">Tags / passes out</b>
              <span className="block truncate text-[11px] text-slate-500">{protocol === 'PLAIN_TAGS' ? 'Plain tags' : protocol === 'PRINTED_PASS' ? 'Printed passes' : 'Issued earlier'} · return before exit</span>
            </span>
            <span className="text-xl font-bold text-amber-700">{outCount}</span>
          </button>
          {canBulkPass && (
            <button type="button" onClick={() => { setSelectMode((m) => !m); setPicked({}); }} className={`${selectMode ? 'btn-primary' : 'btn-ghost'} !px-3 !py-2.5 text-xs`} data-testid="visits-select-toggle">
              <CheckSquare size={15} /> {selectMode ? 'Done' : 'Select passes'}
            </button>
          )}
        </div>
      )}
      {passError && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{passError}</p>}

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
            <li key={v.visitorId} className={selectMode ? 'flex items-center gap-1' : ''}>
              {selectMode && (
                <label className={`flex h-11 w-6 shrink-0 items-center justify-center ${printable(v) ? '' : 'opacity-30'}`} aria-label={`Select ${v.fullName}`}>
                  <input type="checkbox" disabled={!printable(v)} checked={!!picked[v.visitorId]} onChange={(e) => setPicked((c) => ({ ...c, [v.visitorId]: e.target.checked }))} />
                </label>
              )}
              <button type="button" onClick={() => open(v)} className="row-link group min-w-0 flex-1">
                <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-800"><span className="truncate">{v.fullName}</span>{v.noContact && <NoContactIcon />}{v.openPassItems > 0 && (
                    <span title={`${v.openPassGates.map((g: any) => `${g.kind === 'PASS' ? 'Pass' : 'Tag'}${g.tagNumber ? ` ${g.tagNumber}` : ''} · ${g.gateName}`).join(', ')} — collect before exit`} className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" data-testid="visit-pass-badge">
                      {v.openPassKinds.includes('PASS') ? <IdCard size={11} /> : <Tag size={11} />}{v.openPassItems}
                    </span>
                  )}</span>
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
                <StatusPill status={v.cancelled && v.status !== 'ARRIVED' && v.status !== 'EXITED' ? 'CANCELLED' : v.status} />
                <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectMode && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lift backdrop-blur md:bottom-4" data-testid="visits-bulk-bar">
          <label className="flex items-center gap-2 pl-1 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={pickedIds.length > 0 && pickedIds.length === sortedVisits.filter(printable).length} onChange={(e) => setPicked(e.target.checked ? Object.fromEntries(sortedVisits.filter(printable).map((v) => [v.visitorId, true])) : {})} />
            {pickedIds.length ? `${pickedIds.length} selected` : 'Select all'}
          </label>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className="btn-ghost !px-3 !py-2 text-xs" disabled={!pickedIds.length} onClick={() => setPreviewIds(pickedIds)}><IdCard size={15} /> Preview</button>
            <PassPdfButtons visitorIds={pickedIds} compact disabled={!pickedIds.length} onDone={() => { setPassError(''); loadVisits(); outstanding.reload(); }} onError={setPassError} />
          </div>
        </div>
      )}
      <PassPreviewSheet open={previewIds.length > 0} visitorIds={previewIds} onClose={() => setPreviewIds([])} onPrinted={() => { loadVisits(); outstanding.reload(); }} />
      <OutstandingPassSheet open={outOpen} onClose={() => setOutOpen(false)} onOpen={(p) => p && router.push(`/gate?code=${encodeURIComponent(p)}`)} />
    </div>
  );
}
