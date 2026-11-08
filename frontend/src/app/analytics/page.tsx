'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  BarChart3,
  CalendarRange,
  Clock,
  DoorOpen,
  Download,
  FileText,
  Flame,
  LogIn,
  LogOut,
  MapPin,
  Percent,
  Repeat,
  ShieldAlert,
  Timer,
  UserRound,
  Users,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Sheet from '@/components/ui/Sheet';
import Avatar from '@/components/ui/Avatar';
import Collapse from '@/components/ui/Collapse';
import StatusPill from '@/components/ui/StatusPill';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import { Empty, Field, Fields, SkeletonList } from '@/components/ui/Bits';
import PersonLink from '@/components/PersonLink';
import { VisitorCard } from '@/components/InviteBits';
import { useBrand } from '@/components/BrandProvider';
import { scale } from '@/lib/brand';
import { fmtDate, fmtDuration, MODE_LABEL, photoUrl, relTime, titleCase } from '@/lib/format';

type DrillParams = Record<string, string | number | undefined>;
/** A drill-down: the records behind one number. `alts` lets the panel switch metric (e.g. a day's entries vs exits). */
type DrillT = { title: string; params: DrillParams; alts?: { label: string; params: DrillParams }[] };
type DrillRes = { entity: 'visitors' | 'invites'; total: number; limit: number; exportCap: number; rows: any[] };

/** Make any count tappable: opens the records behind it. */
function Num({ n, onClick, className = '', title }: { n: ReactNode; onClick: () => void; className?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={title ? `Show ${title}` : undefined}
      className={`rounded-md underline decoration-dotted decoration-slate-300 underline-offset-[3px] transition hover:text-brand-700 hover:decoration-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${className}`}
    >
      {n}
    </button>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'export';

const EMERALD = '#10b981';
const AMBER = '#f59e0b';
const VIOLET = '#8b5cf6';
const ROSE = '#f43f5e';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function usePalette() {
  const { brand } = useBrand();
  return useMemo(() => {
    const b = scale(brand.primaryColor || '#2563eb');
    const a = scale(brand.secondaryColor || '#1e40af');
    const c = (x: number[]) => '#' + x.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
    return {
      brand: c(b[500]),
      brandDark: c(b[700]),
      brandLight: c(b[300]),
      brand100: c(b[100]),
      accent: c(a[500]),
      series: [c(b[500]), EMERALD, AMBER, VIOLET, c(a[400]), ROSE, c(b[300]), '#14b8a6'],
    };
  }, [brand.primaryColor, brand.secondaryColor]);
}

function shortDay(k: string) {
  const d = new Date(k + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Delta({ cur, prev, invert }: { cur: number; prev?: number; invert?: boolean }) {
  if (prev === undefined || prev === null) return null;
  if (prev === 0 && cur > 0)
    return (
      <Tooltip content="Nothing in the previous period to compare with">
        <span className="inline-flex items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">New</span>
      </Tooltip>
    );
  const d = prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 100);
  const good = invert ? d <= 0 : d >= 0;
  return (
    <Tooltip content={`Previous period: ${prev}`}>
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          d === 0 ? 'bg-slate-100 text-slate-500' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}
      >
        {d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
        {Math.abs(d)}%
      </span>
    </Tooltip>
  );
}

function Kpi({
  icon,
  label,
  value,
  cur,
  prev,
  tone,
  invert,
  tip,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  cur?: number;
  prev?: number;
  tone: string;
  invert?: boolean;
  tip: string;
  onClick?: () => void;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={`card card-art group p-3.5 text-left ${onClick ? 'card-hover' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tone} transition duration-300 group-hover:scale-110`}>{icon}</span>
        {cur !== undefined && <Delta cur={cur} prev={prev} invert={invert} />}
      </div>
      <p className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        <span onClick={(e) => e.stopPropagation()}>
          <InfoTip text={tip} size={12} />
        </span>
      </p>
    </Comp>
  );
}

function ChartCard({ title, icon, info, children, right }: { title: string; icon: ReactNode; info?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="surface animate-in">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 text-brand-600 shadow-sm ring-1 ring-brand-100">{icon}</span>
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {info && <InfoTip text={info} />}
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

function Ring({ value, label, color, tip, onClick }: { value: number; label: string; color: string; tip: string; onClick?: () => void }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <Tooltip content={tip}>
      <button type="button" onClick={onClick} className="tile flex w-full flex-col items-center !px-1 !py-3 transition hover:-translate-y-0.5 hover:shadow-soft">
        <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
          <circle cx="38" cy="38" r={r} stroke="rgb(226 232 240)" strokeWidth="8" fill="none" />
          <circle
            cx="38"
            cy="38"
            r={r}
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * Math.min(100, value)) / 100}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }}
          />
        </svg>
        <p className="-mt-[50px] mb-[26px] text-base font-bold text-slate-900">{value}%</p>
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
      </button>
    </Tooltip>
  );
}

function BarList({ rows, color, onPick }: { rows: { label: string; count: number; sub?: string; id?: string }[]; color: string; onPick?: (r: { label: string; id?: string }) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="tile-muted text-center text-xs text-slate-500">No data in this period</p>;
  return (
    <ul className="rows stagger">
      {rows.map((r) => (
        <li key={r.id || r.label}>
          <button type="button" disabled={!onPick} onClick={() => onPick?.(r)} className="row-link !py-2.5 disabled:cursor-default">
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-slate-700">{r.label}</span>
                <span className="ml-2 font-bold text-slate-900">{r.count}</span>
              </span>
              {r.sub && <span className="block truncate text-[11px] text-slate-400">{r.sub}</span>}
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200/60">
                <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${(r.count / max) * 100}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const tooltipStyle = {
  contentStyle: { borderRadius: 14, border: '1px solid rgb(226 232 240)', boxShadow: '0 12px 30px -12px rgb(15 23 42 / .25)', fontSize: 12 },
  labelStyle: { fontWeight: 600, color: '#0f172a' },
};

export default function AnalyticsPage() {
  const pal = usePalette();
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillT | null>(null);
  const [res, setRes] = useState<DrillRes | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const list = res?.rows || [];
  const [listLoading, setListLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  const range = custom && from && to ? { from, to } : null;

  useEffect(() => {
    setLoading(true);
    api
      .analytics(days, range?.from, range?.to)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, range?.from, range?.to]);

  const drillQuery = (d: DrillT) => ({ days: data?.periodDays || days, ...(range || {}), ...d.params });

  async function openDrill(d: DrillT) {
    setDrill(d);
    setListLoading(true);
    setDetail(null);
    setExportMsg(null);
    try {
      const r = await api.analyticsDrill(drillQuery(d));
      setRes(r && Array.isArray(r.rows) ? r : null);
    } catch {
      setRes(null);
    } finally {
      setListLoading(false);
    }
  }

  async function exportDrill() {
    if (!drill || exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const out = await api.analyticsExport({ ...drillQuery(drill), name: slug(drill.title) });
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = out.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setExportMsg(
        out.truncated
          ? `Downloaded the newest ${out.cap.toLocaleString()} of ${out.total.toLocaleString()} rows. Narrow the date range to export the rest.`
          : `Downloaded ${out.total.toLocaleString()} row${out.total === 1 ? '' : 's'}.`,
      );
    } catch (e: any) {
      setExportMsg(e?.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // series point click → that day's records (switchable between registered / entries / exits / declined)
  const dayDrill = (day: string, label: string, first: 'total' | 'arrived') => {
    const alts = [
      { label: 'Registered', params: { metric: 'total', day } },
      { label: 'Entries', params: { metric: 'arrived', day } },
      { label: 'Exits', params: { metric: 'exited', day } },
      { label: 'Declined', params: { metric: 'denied', day } },
    ];
    openDrill({ title: label, params: first === 'total' ? alts[0].params : alts[1].params, alts });
  };
  const catLabel = (c: string) => (c === 'PERSONAL' ? 'Personal' : 'Official');

  const k = data?.kpis || {};
  const p = data?.previous || {};
  const series = (data?.series || []).map((s: any) => ({ ...s, label: shortDay(s.day) }));
  const heatMax = data ? Math.max(1, ...data.heatmap.flat()) : 1;

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        icon={<BarChart3 size={20} />}
        title="Analytics"
        subtitle={
          data?.range
            ? `${new Date(data.range.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(data.range.to).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Loading…'
        }
        info="Every number compares against the previous period of the same length. Tap any number, bar, segment or cell to see the records behind it and download them as CSV."
      />

      <div className="animate-in mb-4 flex flex-wrap items-center gap-2">
        <div className="segmented">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" data-active={!custom && days === d} onClick={() => { setCustom(false); setDays(d); }}>
              {d}d
            </button>
          ))}
          <button type="button" data-active={custom} onClick={() => setCustom(true)} className="!flex items-center gap-1">
            <CalendarRange size={14} /> Custom
          </button>
        </div>
      </div>
      <Collapse open={custom}>
        <div className="surface mb-4 grid grid-cols-2 gap-3 !p-3">
          <label>
            <span className="label">From</span>
            <input type="date" className="input !py-2" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="label">To</span>
            <input type="date" className="input !py-2" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </Collapse>

      {loading && !data ? (
        <SkeletonList rows={6} h={120} />
      ) : !data ? (
        <Empty icon={<BarChart3 size={24} />} title="Analytics unavailable" hint="Please try again shortly." />
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="stagger grid grid-cols-2 gap-3">
            <Kpi icon={<Users size={18} />} label="Visitors" value={k.totalVisits} cur={k.totalVisits} prev={p.totalVisits} tone="from-brand-50 to-brand-100 text-brand-600" tip="Visitors who registered in this period" onClick={() => openDrill({ title: 'All visitors', params: { metric: 'total' } })} />
            <Kpi icon={<LogIn size={18} />} label="Entries" value={k.arrived} cur={k.arrived} prev={p.arrived} tone="from-emerald-50 to-emerald-100 text-emerald-600" tip="Check-ins recorded at the gate" onClick={() => openDrill({ title: 'Entries', params: { metric: 'arrived' } })} />
            <Kpi icon={<LogOut size={18} />} label="Exits" value={k.exited} cur={k.exited} prev={p.exited} tone="from-amber-50 to-amber-100 text-amber-600" tip="Check-outs recorded at the gate" onClick={() => openDrill({ title: 'Exits', params: { metric: 'exited' } })} />
            <Kpi icon={<DoorOpen size={18} />} label="On site now" value={k.activeNow} tone="from-violet-50 to-violet-100 text-violet-600" tip="Visitors checked in and not yet signed out" onClick={() => openDrill({ title: 'On site now', params: { metric: 'activeNow' } })} />
            <Kpi icon={<Ban size={18} />} label="Declined" value={k.denied} cur={k.denied} prev={p.denied} invert tone="from-rose-50 to-rose-100 text-rose-600" tip="Entries refused by gate officers" onClick={() => openDrill({ title: 'Declined entries', params: { metric: 'denied' } })} />
            <Kpi icon={<Timer size={18} />} label="Average stay" value={fmtDuration(k.avgDurationMinutes)} cur={k.avgDurationMinutes} prev={p.avgDurationMinutes} tone="from-sky-50 to-sky-100 text-sky-600" tip="Average time between check-in and check-out — tap for the visits it is based on" onClick={() => openDrill({ title: 'Completed visits', params: { metric: 'exited' } })} />
            <Kpi icon={<Repeat size={18} />} label="Returning visitors" value={k.returningVisitors} tone="from-brand-50 to-accent-100 text-accent-700" tip="People who visited more than once in this period" onClick={() => openDrill({ title: 'Returning visitors', params: { metric: 'returning' } })} />
            <Kpi icon={<ShieldAlert size={18} />} label="Blacklist matches" value={k.blacklistHits} tone="from-rose-50 to-amber-50 text-rose-600" tip="Registrations matching an active blacklist entry" onClick={() => openDrill({ title: 'Blacklist matches', params: { metric: 'blacklist' } })} />
          </div>

          <ChartCard title="Traffic over time" icon={<BarChart3 size={16} />} info="Daily registrations, check-ins and check-outs. Tap a day to see its records.">
            <div className="h-52 -ml-3 cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series}
                  margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
                  onClick={(st: any) => { const pt = st?.activePayload?.[0]?.payload; if (pt?.day) dayDrill(pt.day, shortDay(pt.day), 'total'); }}
                >
                  <defs>
                    <linearGradient id="gReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={pal.brand} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={pal.brand} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gEnt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EMERALD} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgb(226 232 240)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={32} />
                  <RTooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="registered" name="Registered" stroke={pal.brand} strokeWidth={2.2} fill="url(#gReg)" animationDuration={900} />
                  <Area type="monotone" dataKey="entries" name="Entries" stroke={EMERALD} strokeWidth={2.2} fill="url(#gEnt)" animationDuration={1100} />
                  <Area type="monotone" dataKey="exits" name="Exits" stroke={AMBER} strokeWidth={1.8} fill="transparent" strokeDasharray="4 3" animationDuration={1300} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium text-slate-500">
              {[['Registered', pal.brand, 'total', k.totalVisits], ['Entries', EMERALD, 'arrived', k.arrived], ['Exits', AMBER, 'exited', k.exited]].map(([l, c, m, n]) => (
                <button key={l} type="button" onClick={() => openDrill({ title: String(l), params: { metric: String(m) } })} className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition hover:bg-white hover:text-slate-800">
                  <span className="h-2 w-2 rounded-full" style={{ background: String(c) }} />
                  {l} <b className="text-slate-700">{n}</b>
                </button>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Entries vs exits" icon={<LogIn size={16} />} info="Bars show check-ins and check-outs; the line shows declined entries. Tap a day for its records.">
            <div className="h-44 -ml-3 cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={series}
                  barGap={1}
                  barCategoryGap="12%"
                  margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
                  onClick={(st: any) => { const pt = st?.activePayload?.[0]?.payload; if (pt?.day) dayDrill(pt.day, shortDay(pt.day), 'arrived'); }}
                >
                  <CartesianGrid strokeDasharray="3 6" stroke="rgb(226 232 240)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={32} />
                  <RTooltip {...tooltipStyle} cursor={{ fill: pal.brand100, opacity: 0.5 }} />
                  <Bar dataKey="entries" name="Entries" fill={EMERALD} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="exits" name="Exits" fill={pal.brandLight} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Line type="monotone" dataKey="denied" name="Declined" stroke={ROSE} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="grid grid-cols-3 gap-2">
            <Ring value={k.admitRate} label="Admit rate" color={EMERALD} tip="Share of gate decisions that admitted the visitor — tap for the admitted visitors" onClick={() => openDrill({ title: 'Admitted', params: { metric: 'arrived' } })} />
            <Ring value={k.denialRate} label="Denial rate" color={ROSE} tip="Share of gate decisions that refused entry — tap for the declined visitors" onClick={() => openDrill({ title: 'Declined entries', params: { metric: 'denied' } })} />
            <Ring value={k.showRate} label="Show-up rate" color={pal.brand} tip="Registered visitors who actually arrived — tap for those who showed up" onClick={() => openDrill({ title: 'Showed up', params: { metric: 'showed' } })} />
          </div>

          <ChartCard
            title="Peak hours"
            icon={<Flame size={16} />}
            info="When visitors check in, by hour of day. Tap a bar or a cell for its check-ins."
            right={data.peakHours?.[0] && <StatusPill tone="amber" label={`Busiest ${String(data.peakHours[0].hour).padStart(2, '0')}:00`} />}
          >
            <div className="h-36 -ml-3 cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.hourly}
                  margin={{ top: 4, right: 6, bottom: 0, left: 0 }}
                  onClick={(st: any) => {
                    const h = st?.activePayload?.[0]?.payload?.hour;
                    if (h !== undefined) openDrill({ title: `Check-ins ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`, params: { metric: 'arrived', hour: h } });
                  }}
                >
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={2} tickFormatter={(h) => `${h}h`} />
                  <YAxis allowDecimals={false} hide />
                  <RTooltip {...tooltipStyle} labelFormatter={(h) => `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`} cursor={{ fill: pal.brand100, opacity: 0.5 }} />
                  <Bar dataKey="count" name="Check-ins" radius={[5, 5, 0, 0]}>
                    {data.hourly.map((h: any, i: number) => (
                      <Cell key={i} fill={data.peakHours?.some((p: any) => p.hour === h.hour) ? AMBER : pal.brandLight} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="eyebrow mb-2 mt-3">Weekday × hour</p>
            <div className="overflow-x-auto">
              <div className="min-w-[340px]">
                {data.heatmap.map((row: number[], d: number) => (
                  <div key={d} className="mb-[3px] flex items-center gap-[3px]">
                    <span className="w-8 shrink-0 text-[10px] font-medium text-slate-400">{DOW[d]}</span>
                    {row.map((v, h) => (
                      <Tooltip key={h} content={`${DOW[d]} ${String(h).padStart(2, '0')}:00 · ${v} check-in${v === 1 ? '' : 's'}`}>
                        <button
                          type="button"
                          aria-label={`${DOW[d]} ${h}:00, ${v} check-ins`}
                          onClick={() => openDrill({ title: `${DOW[d]} ${String(h).padStart(2, '0')}:00 check-ins`, params: { metric: 'arrived', weekday: d, hour: h } })}
                          className="h-3.5 flex-1 rounded-[3px] transition hover:scale-125 hover:ring-2 hover:ring-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                          style={{ background: v ? pal.brand : 'rgb(226 232 240 / .7)', opacity: v ? 0.25 + (v / heatMax) * 0.75 : 1 }}
                        />
                      </Tooltip>
                    ))}
                  </div>
                ))}
                <div className="ml-8 flex justify-between pl-[3px] text-[9px] text-slate-400">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>23</span>
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard
            title="Official vs personal"
            icon={<BarChart3 size={16} />}
            info="Invite descriptions are free text, so visits are grouped by purpose: official or personal. Tap any number for its records."
          >
            {(() => {
              const rows = data.categoryDetail || [];
              const totalReg = rows.reduce((a: number, r: any) => a + r.registered, 0);
              return (
                <div className="space-y-2.5">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200/70">
                    {rows.map((r: any) => (
                      <button
                        key={r.category}
                        type="button"
                        aria-label={`${catLabel(r.category)} share`}
                        onClick={() => openDrill({ title: `${catLabel(r.category)} visitors`, params: { metric: 'total', category: r.category } })}
                        className={`h-full transition-all duration-700 hover:brightness-110 ${r.category === 'OFFICIAL' ? 'bg-gradient-to-r from-brand-400 to-brand-600' : 'bg-gradient-to-r from-violet-400 to-violet-600'}`}
                        style={{ width: totalReg ? `${(r.registered / totalReg) * 100}%` : '0%' }}
                      />
                    ))}
                  </div>
                  {rows.map((r: any) => {
                    const pct = totalReg ? Math.round((r.registered / totalReg) * 100) : 0;
                    const c = r.category;
                    return (
                      <div key={c} className="tile flex items-center gap-3 !py-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold ${c === 'OFFICIAL' ? 'from-brand-50 to-brand-100 text-brand-700' : 'from-violet-50 to-violet-100 text-violet-700'}`}>
                          {pct}%
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            {catLabel(c)}
                            <Delta cur={r.registered} prev={r.previous} />
                          </p>
                          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                            <span>
                              <Num n={<b className="text-slate-700">{r.entries}</b>} title={`${catLabel(c)} entries`} onClick={() => openDrill({ title: `${catLabel(c)} entries`, params: { metric: 'arrived', category: c } })} /> entries
                            </span>
                            <span>
                              <Num n={<b className="text-slate-700">{r.denied}</b>} title={`${catLabel(c)} declined`} onClick={() => openDrill({ title: `${catLabel(c)} declined`, params: { metric: 'denied', category: c } })} /> declined
                            </span>
                          </p>
                        </div>
                        <Num
                          n={<span className="text-xl font-bold text-slate-900">{r.registered}</span>}
                          title={`${catLabel(c)} visitors`}
                          onClick={() => openDrill({ title: `${catLabel(c)} visitors`, params: { metric: 'total', category: c } })}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </ChartCard>

          <div className="grid grid-cols-2 gap-3">
            {[
              {
                t: 'Arrived by',
                rows: data.byMode.map((x: any) => ({ name: MODE_LABEL[x.mode] || titleCase(x.mode), value: x.count, key: x.mode })),
                colors: [EMERALD, AMBER, pal.accent],
                pick: (r: any) => openDrill({ title: `Arrived by ${r.name}`, params: { metric: 'arrived', entryMode: r.key } }),
              },
              {
                t: 'Invite status',
                rows: (data.inviteStatus || []).map((x: any) => ({ name: titleCase(x.status), value: x.count, key: x.status })),
                colors: [pal.brand, EMERALD, AMBER, ROSE, VIOLET, '#94a3b8'],
                pick: (r: any) => openDrill({ title: `${r.name} invites`, params: { metric: 'invites', inviteStatus: r.key } }),
              },
            ].map((g) => {
              const total = g.rows.reduce((a: number, r: any) => a + r.value, 0);
              return (
                <section key={g.t} className="surface !p-3">
                  <p className="mb-1 text-sm font-semibold text-slate-800">{g.t}</p>
                  {total === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">No data</p>
                  ) : (
                    <>
                      <div className="relative h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={g.rows}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={30}
                              outerRadius={48}
                              paddingAngle={3}
                              stroke="none"
                              onClick={(e: any) => g.pick({ name: e.name, key: e.payload?.key ?? e.key })}
                              className="cursor-pointer"
                            >
                              {g.rows.map((_: any, i: number) => (
                                <Cell key={i} fill={g.colors[i % g.colors.length]} />
                              ))}
                            </Pie>
                            <RTooltip {...tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">{total}</span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {g.rows.map((r: any, i: number) => (
                          <li key={r.name}>
                            <button type="button" onClick={() => g.pick(r)} className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-slate-600 transition hover:bg-white hover:text-slate-900">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.colors[i % g.colors.length] }} />
                              <span className="truncate">{r.name}</span>
                              <span className="ml-auto font-semibold">{r.value} · {Math.round((r.value / total) * 100)}%</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              );
            })}
          </div>

          <ChartCard title="Locations & gates" icon={<MapPin size={16} />} info="Where visitors were invited to and which gates admitted them. Tap a row for its records.">
            <p className="eyebrow mb-2">Locations</p>
            <BarList rows={data.byLocation.map((x: any) => ({ label: x.location, count: x.count, id: x.id || 'none' }))} color={EMERALD} onPick={(r) => openDrill({ title: `Invited to ${r.label}`, params: { metric: 'total', locationId: r.id } })} />
            <p className="eyebrow mb-2 mt-4">Gates</p>
            <BarList rows={data.byGate.map((x: any) => ({ label: x.gate, count: x.count, id: x.id || 'none' }))} color={VIOLET} onPick={(r) => openDrill({ title: `Admitted at ${r.label}`, params: { metric: 'arrived', gateId: r.id } })} />
          </ChartCard>

          <ChartCard title="Top hosts" icon={<UserRound size={16} />} info="Staff who received the most visitors">
            {data.byHost.length ? (
              <ul className="rows stagger">
                {data.byHost.map((h: any, i: number) => (
                  <li key={h.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="w-4 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                    <Avatar name={h.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold"><PersonLink id={h.id} name={h.name} /></p>
                      <p className="truncate text-[11px] text-slate-400">
                        {h.portfolio || 'Host'}
                        {h.onSite ? (
                          <>
                            {' · '}
                            <Num n={`${h.onSite} on site`} title={`on site for ${h.name}`} onClick={() => openDrill({ title: `On site for ${h.name}`, params: { metric: 'activeNow', hostId: h.id } })} />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Tooltip content={`Visitors hosted by ${h.name}`}>
                      <button type="button" onClick={() => openDrill({ title: `Hosted by ${h.name}`, params: { metric: 'total', hostId: h.id } })} className="rounded-full bg-gradient-to-r from-brand-50 to-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700 transition hover:from-brand-100 hover:to-brand-200 hover:shadow-sm">
                        {h.count}
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tile-muted text-center text-xs text-slate-500">No hosted visits in this period</p>
            )}
          </ChartCard>

          <ChartCard title="Length of stay" icon={<Clock size={16} />} info="How long visitors stayed between check-in and check-out. Tap a bar for those visits.">
            <div className="h-36 -ml-3 cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.durationBuckets}
                  margin={{ top: 4, right: 6, bottom: 0, left: 0 }}
                  onClick={(st: any) => {
                    const i = st?.activeTooltipIndex;
                    if (typeof i === 'number' && i >= 0) openDrill({ title: `Stayed ${data.durationBuckets[i]?.label}`, params: { metric: 'exited', duration: i } });
                  }}
                >
                  <defs>
                    <linearGradient id="gDur" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={VIOLET} />
                      <stop offset="100%" stopColor={pal.brand} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} hide />
                  <RTooltip {...tooltipStyle} cursor={{ fill: pal.brand100, opacity: 0.5 }} />
                  <Bar dataKey="count" name="Visits" fill="url(#gDur)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Frequent visitors" icon={<Repeat size={16} />} info="Grouped by phone number, or by name when no phone was given">
            {data.topVisitors.length ? (
              <ul className="rows stagger">
                {data.topVisitors.map((v: any) => (
                  <li key={v.key || v.name + v.phone}>
                   <button type="button" onClick={() => openDrill({ title: `Visits by ${v.name}`, params: { metric: 'total', visitorKey: v.key } })} className="row-link !py-2.5">
                    <Avatar name={v.name} src={photoUrl(v.photoPath)} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{v.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{v.phone || 'No phone'} · last {relTime(v.lastVisit)}</p>
                    </div>
                    <span className="rounded-full bg-gradient-to-r from-emerald-50 to-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{v.visits}×</span>
                   </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tile-muted text-center text-xs text-slate-500">No visitors in this period</p>
            )}
          </ChartCard>

          <ChartCard title="Blacklist matches" icon={<ShieldAlert size={16} />} info="Registrations whose phone, ID or name matched an active blacklist entry" right={
              data.blacklistHits.length ? (
                <button type="button" onClick={() => openDrill({ title: 'Blacklist matches', params: { metric: 'blacklist' } })}>
                  <StatusPill tone="rose" label={`${k.blacklistHits ?? data.blacklistHits.length} flagged`} />
                </button>
              ) : (
                <StatusPill tone="emerald" label="All clear" />
              )
            }>
            {data.blacklistHits.length ? (
              <ul className="rows">
                {data.blacklistHits.map((h: any, i: number) => (
                  <li key={i}>
                   <button type="button" onClick={() => openDrill({ title: 'Blacklist matches', params: { metric: 'blacklist' } })} className="row-link !py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600"><Ban size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{h.visitor}</p>
                      <p className="truncate text-[11px] text-rose-600/80">{h.reason}</p>
                    </div>
                    <div className="text-right">
                      <StatusPill status={h.status} />
                      <p className="mt-0.5 text-[10px] text-slate-400">{relTime(h.at)}</p>
                    </div>
                   </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tile-muted text-center text-xs text-slate-500">No blacklisted person tried to register in this period.</p>
            )}
          </ChartCard>

          <div className="grid grid-cols-2 gap-3">
            <Kpi icon={<Percent size={18} />} label="Invites created" value={k.invitesCreated} cur={k.invitesCreated} prev={p.invitesCreated} tone="from-brand-50 to-brand-100 text-brand-600" tip="Invites created by hosts in this period" onClick={() => openDrill({ title: 'Invites created', params: { metric: 'invites' } })} />
            <Kpi icon={<ShieldAlert size={18} />} label="Approvals" value={k.approvals} tone="from-amber-50 to-amber-100 text-amber-600" tip="Walk-ins and invites approved by an administrator" onClick={() => openDrill({ title: 'Approvals', params: { metric: 'approvals' } })} />
          </div>
        </div>
      )}

      {/* Drill-down: newest 100 records behind a number + capped CSV export */}
      <Sheet
        open={!!drill}
        onClose={() => { setDrill(null); setDetail(null); }}
        icon={detail ? <UserRound size={20} /> : res?.entity === 'invites' ? <FileText size={20} /> : <Users size={20} />}
        title={detail ? detail.fullName : drill?.title}
        subtitle={
          detail ? (
            <button type="button" className="text-brand-600 hover:underline" onClick={() => setDetail(null)}>
              ← Back to {drill?.title}
            </button>
          ) : listLoading ? 'Loading…' : res ? (
            `${res.total.toLocaleString()} ${res.entity === 'invites' ? (res.total === 1 ? 'invite' : 'invites') : res.total === 1 ? 'visitor' : 'visitors'}${res.total > res.limit ? ` · showing newest ${res.limit}` : ''}`
          ) : 'Could not load records'
        }
      >
        {detail ? (
          <div className="space-y-3">
            <VisitorCard v={detail} />
            <Fields>
              <Field label="Description">{detail.invite?.purpose}</Field>
              <Field label="Purpose">{detail.invite?.category && <StatusPill status={detail.invite.category} />}</Field>
              <Field label="Host">{detail.invite?.host && <PersonLink id={detail.invite.host.id} name={detail.invite.host.fullName} />}</Field>
              <Field label="Arriving by">{detail.invite?.expectedMode && MODE_LABEL[detail.invite.expectedMode]}</Field>
              <Field label="Arrived by">{detail.enteredAt ? MODE_LABEL[detail.entryMode || 'PEDESTRIAN'] : null}</Field>
              <Field label="Location">{detail.locationName}</Field>
              <Field label="Gate">{detail.gateName}</Field>
              <Field label="Checked in">{detail.enteredAt && `${fmtDate(detail.enteredAt)}${detail.entryByName ? ` · ${detail.entryByName}` : ''}`}</Field>
              <Field label="Checked out">{detail.exitedAt && `${fmtDate(detail.exitedAt)}${detail.exitByName ? ` · ${detail.exitByName}` : ''}`}</Field>
              <Field label="Email">{detail.email}</Field>
              <Field label="Phone">{detail.phone}</Field>
            </Fields>
          </div>
        ) : (
          <div className="space-y-3">
            {drill?.alts && (
              <div className="segmented w-full">
                {drill.alts.map((alt) => (
                  <button
                    key={alt.label}
                    type="button"
                    className="flex-1"
                    data-active={alt.params.metric === drill.params.metric}
                    onClick={() => openDrill({ ...drill, params: alt.params })}
                  >
                    {alt.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-50/80 to-white px-3 py-2 ring-1 ring-brand-100/70">
              <p className="min-w-0 flex-1 text-xs text-slate-600">
                {listLoading || !res ? (
                  'Fetching records…'
                ) : (
                  <>
                    Showing <b className="text-slate-900">{Math.min(res.total, res.limit)}</b> of <b className="text-slate-900">{res.total.toLocaleString()}</b>, newest first
                  </>
                )}
              </p>
              <Tooltip
                content={`Download as CSV — newest first, up to ${(res?.exportCap || 5000).toLocaleString()} rows. For more, narrow the date range.`}
              >
                <button
                  type="button"
                  onClick={exportDrill}
                  disabled={exporting || listLoading || !res || res.total === 0}
                  aria-label="Download CSV"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-700 text-white shadow-glow transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-40"
                >
                  {exporting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Download size={16} />}
                </button>
              </Tooltip>
            </div>
            {res && res.total > res.exportCap && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                {res.total.toLocaleString()} records match. The CSV holds the newest {res.exportCap.toLocaleString()} — narrow the date range to export the rest.
              </p>
            )}
            {exportMsg && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">{exportMsg}</p>}
            {listLoading ? (
              <SkeletonList rows={5} />
            ) : list.length === 0 ? (
              <Empty icon={<Users size={22} />} title="No records" hint="Nothing matches this number in the selected period." />
            ) : res?.entity === 'invites' ? (
              <ul className="rows stagger">
                {list.map((inv: any) => (
                  <li key={inv.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${inv.category === 'PERSONAL' ? 'from-violet-50 to-violet-100 text-violet-600' : 'from-brand-50 to-brand-100 text-brand-600'}`}>
                      <FileText size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">{inv.purpose || catLabel(inv.category)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {[catLabel(inv.category), inv.host?.fullName, `${inv.visitors?.length || 0}/${inv.guestCount || 1} guests`, relTime(inv.createdAt)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <StatusPill status={inv.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="rows stagger">
                {list.map((v: any) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => setDetail(v)} className="row-link group">
                      <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-800">{v.fullName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[v.invite?.category && catLabel(v.invite.category), v.invite?.purpose, v.invite?.host?.fullName, relTime(v.enteredAt || v.createdAt)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <StatusPill status={v.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
