'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  ClipboardCheck,
  Download,
  Search,
  AlertTriangle,
  Sparkles,
  UserRound,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, getUser } from '@/lib/api';
import { platformHome } from '@/lib/navLinks';
import { avatarUrl } from '@/lib/format';
import { roleLabel } from '@/lib/roleLabels';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import Sheet from '@/components/ui/Sheet';
import StatusPill from '@/components/ui/StatusPill';
import { Notice } from '@/components/ui/Bits';

type Row = {
  id: string;
  day: string;
  arrivedAt?: string | null;
  exitedAt?: string | null;
  durationMinutes?: number | null;
  late?: boolean;
  missingExit?: boolean;
  absent?: boolean;
  status: string;
  anomaly?: boolean;
  staff: { id: string; fullName: string; email?: string; role: string; roleLabel?: string; avatarPath?: string | null };
  organisation?: { id: string; name: string; code?: string };
  arrivalGate?: { id: string; name: string; location?: { name: string } } | null;
};

const PRESETS = [
  { k: 'today', l: 'Today', days: 1 },
  { k: 'week', l: 'This week', days: 7 },
  { k: 'month', l: 'This month', days: 30 },
];

function isoDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

function startOfWeek(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const wd = d.getDay(); // 0 Sun
  const back = wd === 0 ? 6 : wd - 1;
  d.setDate(d.getDate() - back);
  return isoDay(d);
}

function startOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function clock(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dur(mins?: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function statusLabel(row: Row) {
  if (row.absent) return 'Absent';
  if (row.missingExit) return 'No exit';
  if (row.late) return 'Late';
  return 'Present';
}

export default function AttendanceRegisterPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [platform, setPlatform] = useState(false);
  const today = isoDay();
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(shiftIso(today, -29));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [orgId, setOrgId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [gateId, setGateId] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    const isPlatform = u.role === 'SUPER_ADMIN' || u.role === 'GLOBAL_ADMIN';
    if (!isPlatform && u.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    setMe(u);
    setPlatform(isPlatform);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  function applyPreset(k: string) {
    setPreset(k);
    setPage(1);
    if (k === 'today') {
      setFrom(today);
      setTo(today);
    } else if (k === 'week') {
      setFrom(startOfWeek(today));
      setTo(today);
    } else {
      setFrom(startOfMonth(today));
      setTo(today);
    }
  }

  const params = useMemo(
    () => ({
      q: debounced || undefined,
      from,
      to,
      organisationId: platform ? orgId || undefined : undefined,
      locationId: locationId || undefined,
      gateId: gateId || undefined,
      role: role || undefined,
      status: status !== 'all' ? status : undefined,
      page,
      pageSize: 25,
    }),
    [debounced, from, to, orgId, locationId, gateId, role, status, page, platform],
  );

  const load = useCallback(() => {
    if (!me) return;
    setLoading(true);
    setErr('');
    api
      .attendanceRegister(params)
      .then(setData)
      .catch((e: any) => {
        setErr(e.message || 'Unable to load the attendance register');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [me, params]);

  useEffect(() => {
    load();
  }, [load]);

  const locations: any[] = data?.facets?.locations || [];
  const gates = locations.flatMap((l: any) => (l.gates || []).map((g: any) => ({ ...g, locationName: l.name, locationId: l.id })));
  const visibleGates = locationId ? gates.filter((g: any) => g.locationId === locationId) : gates;
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 25)));

  async function openStaff(staffId: string) {
    setDetailLoading(true);
    try {
      const row = await api.attendanceRegisterStaff(staffId, { from, to, organisationId: platform ? orgId || undefined : undefined });
      setDetail(row);
    } catch (e: any) {
      setErr(e.message || 'Unable to load staff history');
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const file = await api.attendanceRegisterExport({ ...params, page: undefined, pageSize: undefined });
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const k = data?.kpis || {};
  const chips = [
    { l: 'Present now', v: k.presentNow ?? '—', tip: 'Checked in today and not yet exited' },
    { l: 'Late today', v: k.lateToday ?? '—', tip: 'Arrived at or after 09:00 local time today' },
    { l: 'Absent today', v: k.absentToday ?? '—', tip: 'Active staff with no scan on this weekday' },
    { l: 'Avg arrival', v: k.avgArrival || '—', tip: 'Mean arrival time in this range' },
    { l: 'Avg hours', v: k.avgHours != null ? `${k.avgHours}h` : '—', tip: 'Mean completed stay in this range' },
  ];

  if (!me) return null;

  return (
    <div className="page">
      <PageHeader
        back={platformHome(me.role)}
        icon={<ClipboardCheck size={20} />}
        title="Attendance register"
        subtitle={data?.range ? `${data.range.from} – ${data.range.to} · ${data.timezone || ''}` : 'Staff arrival and exit'}
        info="Search and filter daily attendance. First staff QR scan of the day is arrival; later scans update exit. Late is arrival at or after 09:00 local time."
        actions={
          <button type="button" className="btn-quiet !p-2.5" onClick={exportCsv} disabled={exporting} aria-label="Export CSV" title="Export CSV">
            <Download size={16} />
          </button>
        }
      />

      {err && (
        <div className="mb-3">
          <Notice tone="error">{err}</Notice>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {chips.map((c) => (
          <div key={c.l} className="card card-art bg-gradient-to-br from-slate-50 via-white to-brand-50/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{c.l}</p>
            <b className="block text-xl tracking-tight text-slate-900">{c.v}</b>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="segmented">
          {PRESETS.map((p) => (
            <button key={p.k} type="button" data-active={preset === p.k} onClick={() => applyPreset(p.k)}>
              {p.l}
            </button>
          ))}
        </div>
        <label className="text-xs font-semibold text-slate-500">
          From
          <input
            type="date"
            className="input mt-1 !py-1.5"
            value={from}
            max={to}
            onChange={(e) => {
              setPreset('custom');
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          To
          <input
            type="date"
            className="input mt-1 !py-1.5"
            value={to}
            min={from}
            onChange={(e) => {
              setPreset('custom');
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input !pl-9"
            placeholder="Search name, email, agency or role"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {platform && (
          <select className="input !w-auto !py-2 text-sm" value={orgId} aria-label="Agency" onChange={(e) => { setOrgId(e.target.value); setPage(1); }}>
            <option value="">All agencies</option>
            {(data?.facets?.agencies || []).map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <select className="input !w-auto !py-2 text-sm" value={locationId} aria-label="Location" onChange={(e) => { setLocationId(e.target.value); setGateId(''); setPage(1); }}>
          <option value="">All locations</option>
          {locations.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto !py-2 text-sm" value={gateId} aria-label="Gate" onChange={(e) => { setGateId(e.target.value); setPage(1); }}>
          <option value="">All gates</option>
          {visibleGates.map((g: any) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto !py-2 text-sm" value={role} aria-label="Role" onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Agency Admin</option>
          <option value="GATE">Gate Officer</option>
        </select>
        <select className="input !w-auto !py-2 text-sm" value={status} aria-label="Status" onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="no_exit">No exit</option>
        </select>
      </div>

      {data?.flags && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <FlagCard title="Frequently late" icon={<AlertTriangle size={14} className="text-amber-600" />} empty="No late patterns in this range.">
            {(data.flags.frequentlyLate || []).map((s: any) => (
              <button key={s.id} type="button" className="row-link !py-2" onClick={() => openStaff(s.id)}>
                <Avatar name={s.fullName} src={avatarUrl(s.avatarPath)} size={32} />
                <span className="min-w-0 flex-1 text-left">
                  <b className="block truncate text-sm">{s.fullName}</b>
                  <span className="text-[11px] text-slate-400">{s.late} late of {s.days} days</span>
                </span>
              </button>
            ))}
          </FlagCard>
          <FlagCard title="Perfect attendance" icon={<Sparkles size={14} className="text-emerald-600" />} empty="No perfect records in this range yet.">
            {(data.flags.perfectAttendance || []).map((s: any) => (
              <button key={s.id} type="button" className="row-link !py-2" onClick={() => openStaff(s.id)}>
                <Avatar name={s.fullName} src={avatarUrl(s.avatarPath)} size={32} />
                <span className="min-w-0 flex-1 text-left">
                  <b className="block truncate text-sm">{s.fullName}</b>
                  <span className="text-[11px] text-slate-400">{s.days} weekdays present, on time</span>
                </span>
              </button>
            ))}
          </FlagCard>
        </div>
      )}

      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Register</h2>
          <span className="text-xs text-slate-400">{loading ? 'Loading…' : `${data?.total || 0} rows`}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {(data?.rows || []).map((row: Row) => (
            <li key={row.id}>
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-50/50" onClick={() => openStaff(row.staff.id)}>
                <Avatar name={row.staff.fullName} src={avatarUrl(row.staff.avatarPath)} size={40} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-slate-800">{row.staff.fullName}</b>
                  <span className="block truncate text-[11px] text-slate-400">
                    {[row.organisation?.name, row.staff.roleLabel || roleLabel(row.staff.role), row.day].filter(Boolean).join(' · ')}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {row.absent ? 'No scan' : `${clock(row.arrivedAt)} → ${clock(row.exitedAt)} · ${dur(row.durationMinutes)}`}
                    {row.arrivalGate ? ` · ${row.arrivalGate.name}` : ''}
                  </span>
                </span>
                <StatusPill status={statusLabel(row)} />
              </button>
            </li>
          ))}
          {!loading && !(data?.rows || []).length && <li className="p-6 text-center text-sm text-slate-500">No attendance rows match these filters.</li>}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs">
            <button type="button" className="btn-quiet !py-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-slate-500">
              Page {page} of {pages}
            </span>
            <button type="button" className="btn-quiet !py-1.5" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <Sheet
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        leading={detail?.staff ? <Avatar name={detail.staff.fullName} src={avatarUrl(detail.staff.avatarPath)} size={48} /> : <UserRound size={20} />}
        title={detail?.staff?.fullName || (detailLoading ? 'Loading…' : 'Staff')}
        subtitle={detail?.staff ? [detail.staff.roleLabel, detail.staff.email, detail.staff.organisation?.name].filter(Boolean).join(' · ') : 'Attendance history'}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Days present', detail.rows?.filter((r: Row) => !r.absent).length],
                ['Late', detail.rows?.filter((r: Row) => r.late).length],
                ['No exit', detail.rows?.filter((r: Row) => r.missingExit).length],
                ['Absences', detail.rows?.filter((r: Row) => r.absent).length],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{l}</p>
                  <b className="text-lg">{v ?? 0}</b>
                </div>
              ))}
            </div>
            <CalendarStrip rows={detail.rows || []} from={detail.range?.from} to={detail.range?.to} />
            <ol className="space-y-2">
              {(detail.rows || []).map((r: Row) => (
                <li key={r.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{r.day}</b>
                    <StatusPill status={statusLabel(r)} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {r.absent ? 'No arrival recorded' : `${clock(r.arrivedAt)} → ${clock(r.exitedAt)} · ${dur(r.durationMinutes)}`}
                    {r.arrivalGate ? ` · ${r.arrivalGate.name}` : ''}
                  </p>
                </li>
              ))}
              {!(detail.rows || []).length && <li className="text-sm text-slate-500">No history in this range.</li>}
            </ol>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function FlagCard({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children : [children];
  const has = list.filter(Boolean).length > 0 && !(Array.isArray(children) && children.length === 0);
  return (
    <section className="surface overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">
        {icon} {title}
      </div>
      <div className="divide-y divide-slate-100 px-2 py-1">
        {has ? children : <p className="px-2 py-3 text-xs text-slate-400">{empty}</p>}
      </div>
    </section>
  );
}

function CalendarStrip({ rows, from, to }: { rows: Row[]; from?: string; to?: string }) {
  if (!from || !to) return null;
  const map = new Map(rows.map((r) => [r.day, r]));
  const days: string[] = [];
  let cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cur <= end) {
    days.push(isoDay(cur));
    cur = new Date(cur.getTime() + 86400000);
  }
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <CalendarClock size={12} /> Range
      </p>
      <div className="flex flex-wrap gap-1">
        {days.map((d) => {
          const r = map.get(d);
          const tone = !r ? 'bg-slate-100 text-slate-400' : r.absent ? 'bg-rose-100 text-rose-700' : r.late || r.missingExit ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
          return (
            <span key={d} title={r ? `${d} · ${statusLabel(r)}` : d} className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold ${tone}`}>
              {Number(d.slice(-2))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

