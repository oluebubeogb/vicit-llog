'use client';

import LineArt from '@/components/ui/LineArt';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  Inbox,
  Shield,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Sparkline from '@/components/ui/Sparkline';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import StatusPill from '@/components/ui/StatusPill';
import { Empty, SkeletonList } from '@/components/ui/Bits';
import { InviteDetail, InviteRow } from '@/components/InviteBits';
import { inviteStatus, plural, titleCase } from '@/lib/format';

const DAY = 86400000;
const WINDOW = 14;
const isActive = (i: any) => ['ACTIVE', 'USED'].includes(inviteStatus(i));
const isPending = (i: any) => ['OFFLINE_PENDING', 'AWAITING_APPROVAL'].includes(i.status);

function series(list: any[], days: number, offset = 0) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const endMs = end.getTime() - offset * DAY;
  const out = Array(days).fill(0);
  for (const i of list) {
    const t = new Date(i.createdAt).getTime();
    const idx = days - 1 - Math.floor((endMs - t) / DAY);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function greeting(now: Date | null) {
  if (!now) return 'Welcome back';
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

type View = { kind: 'active' | 'pending' } | { kind: 'invite'; invite: any; from?: 'active' | 'pending' } | null;

function StatCard({
  title,
  value,
  data,
  prev,
  tone,
  icon,
  info,
  breakdown,
  onClick,
}: {
  title: string;
  value: number;
  data: number[];
  prev: number;
  tone: 'brand' | 'amber';
  icon: React.ReactNode;
  info: string;
  breakdown: { label: string; value: number }[];
  onClick: () => void;
}) {
  const cur = sum(data);
  const delta = prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
  const up = delta >= 0;
  const styles =
    tone === 'brand'
      ? {
          bg: 'from-brand-500 via-brand-600 to-accent-800',
          stroke: 'rgba(255,255,255,0.95)',
          fill: 'rgba(255,255,255,0.6)',
          glow: 'shadow-glow',
        }
      : {
          bg: 'from-amber-400 via-amber-500 to-orange-600',
          stroke: 'rgba(255,255,255,0.95)',
          fill: 'rgba(255,255,255,0.6)',
          glow: 'shadow-[0_14px_34px_-12px_rgb(217_119_6/0.6)]',
        };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative isolate overflow-hidden rounded-3xl bg-gradient-to-br ${styles.bg} p-4 text-left text-white ${styles.glow} transition duration-300 hover:-translate-y-1 hover:shadow-lift active:scale-[0.98]`}
    >
      <LineArt className="-z-10 text-white transition duration-700 group-hover:scale-110" opacity={0.09} />
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur transition group-hover:scale-110">
          {icon}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <InfoTip text={info} className="!text-white/80 hover:!text-white" />
        </span>
      </div>
      <p className="mt-3 text-[32px] font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-medium text-white/85">{title}</p>
      <Sparkline data={data} width={140} height={30} stroke={styles.stroke} fill={styles.fill} className="mt-2 w-full" />
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <Tooltip content={`${cur} new in the last ${WINDOW} days vs ${prev} in the ${WINDOW} days before`}>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 font-semibold">
            {prev === 0 && cur > 0 ? (
              'New'
            ) : (
              <>
                {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(delta)}%
              </>
            )}
          </span>
        </Tooltip>
        <span className="flex items-center gap-0.5 text-white/80 transition group-hover:translate-x-0.5">
          Details <ChevronRight size={12} />
        </span>
      </div>
      <div className="mt-3 flex gap-1.5 border-t border-white/20 pt-2.5">
        {breakdown.map((b) => (
          <span key={b.label} className="flex-1 rounded-lg bg-white/10 px-1.5 py-1 text-center">
            <span className="block text-sm font-bold">{b.value}</span>
            <span className="block truncate text-[10px] text-white/75">{b.label}</span>
          </span>
        ))}
      </div>
    </button>
  );
}

function Drill({ list, onPick, kind }: { list: any[]; onPick: (i: any) => void; kind: 'active' | 'pending' }) {
  const guests = list.reduce((a, i) => a + Math.max(i.guestCount || 0, i.visitors?.length || 0), 0);
  const registered = list.reduce((a, i) => a + (i.visitors?.length || 0), 0);
  const arrived = list.reduce((a, i) => a + (i.visitors || []).filter((v: any) => v.enteredAt).length, 0);
  const onSite = list.reduce((a, i) => a + (i.visitors || []).filter((v: any) => v.status === 'ARRIVED').length, 0);
  // Descriptions are free text (mostly unique), so the breakdown is Official vs Personal.
  const [cat, setCat] = useState<'OFFICIAL' | 'PERSONAL' | null>(null);
  const cats = (['OFFICIAL', 'PERSONAL'] as const).map((c) => ({
    c,
    n: list.filter((i) => (i.category || 'OFFICIAL') === c).length,
  }));
  const shown = cat ? list.filter((i) => (i.category || 'OFFICIAL') === cat) : list;
  const tiles =
    kind === 'active'
      ? [
          { l: 'Invites', v: list.length },
          { l: 'Guests', v: guests },
          { l: 'Arrived', v: arrived },
          { l: 'On site', v: onSite },
        ]
      : [
          { l: 'Requests', v: list.length },
          { l: 'Guests', v: guests },
          { l: 'Registered', v: registered },
          { l: 'Oldest', v: list.length ? Math.max(...list.map((i) => Math.floor((Date.now() - +new Date(i.createdAt)) / DAY))) : 0 },
        ];
  return (
    <div className="space-y-4">
      <div className="stagger grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.l} className="tile text-center">
            <p className="text-lg font-bold text-slate-900">
              {t.v}
              {t.l === 'Oldest' && <span className="text-xs font-medium text-slate-400">d</span>}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{t.l}</p>
          </div>
        ))}
      </div>
      {list.length > 0 && (
        <div className="tile-muted space-y-2.5">
          <p className="eyebrow flex items-center justify-between">
            Official vs personal
            {cat && (
              <button type="button" onClick={() => setCat(null)} className="text-[10px] font-semibold normal-case tracking-normal text-brand-600 hover:underline">
                Show all
              </button>
            )}
          </p>
          {cats.map(({ c, n }) => {
            const pct = list.length ? Math.round((n / list.length) * 100) : 0;
            const on = cat === c;
            return (
                <button
                  key={c}
                  type="button"
                  title={`Show only ${c === 'OFFICIAL' ? 'official' : 'personal'} invites`}
                  onClick={() => setCat(on ? null : c)}
                  aria-pressed={on}
                  className={`block w-full rounded-xl px-2 py-1.5 text-left text-xs transition hover:bg-white ${on ? 'bg-white shadow-soft ring-1 ring-brand-200' : ''}`}
                >
                  <span className="mb-1 flex items-center justify-between font-medium text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${c === 'OFFICIAL' ? 'bg-brand-500' : 'bg-violet-500'}`} />
                      {c === 'OFFICIAL' ? 'Official' : 'Personal'}
                    </span>
                    <span>
                      <b className="text-slate-900">{n}</b> <span className="text-slate-400">· {pct}%</span>
                    </span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                    <span
                      className={`block h-full rounded-full bg-gradient-to-r ${c === 'OFFICIAL' ? 'from-brand-400 to-brand-600' : 'from-violet-400 to-violet-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </button>
            );
          })}
        </div>
      )}
      {shown.length ? (
        <ul className="rows stagger">
          {shown.map((inv) => (
            <InviteRow key={inv.id} inv={inv} onClick={() => onPick(inv)} />
          ))}
        </ul>
      ) : (
        <Empty
          icon={<Inbox size={24} />}
          title={kind === 'active' ? 'No active invites' : 'Nothing awaiting approval'}
          hint={kind === 'active' ? 'Create an invite to start welcoming guests.' : 'Requests needing an administrator appear here.'}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUserState] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Time-dependent text is rendered after mount so the prerendered HTML hydrates cleanly
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [view, setView] = useState<View>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (u.mustChangePassword) {
      router.replace('/change-password');
      return;
    }
    setUserState(u);
    api
      .myInvites()
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const s = useMemo(() => {
    const act = invites.filter(isActive);
    const pend = invites.filter(isPending);
    const onSite = invites.reduce((a, i) => a + (i.visitors || []).filter((v: any) => v.status === 'ARRIVED').length, 0);
    const today = new Date().toDateString();
    const expectedToday = invites.filter((i) => i.expectedAt && new Date(i.expectedAt).toDateString() === today).length;
    return {
      act,
      pend,
      onSite,
      expectedToday,
      actSeries: series(act, WINDOW),
      actPrev: sum(series(act, WINDOW, WINDOW)),
      pendSeries: series(pend, WINDOW),
      pendPrev: sum(series(pend, WINDOW, WINDOW)),
      activeOnly: act.filter((i) => inviteStatus(i) === 'ACTIVE').length,
      usedOnly: act.filter((i) => inviteStatus(i) === 'USED').length,
      awaiting: pend.filter((i) => i.status === 'AWAITING_APPROVAL').length,
      offline: pend.filter((i) => i.status === 'OFFLINE_PENDING').length,
    };
  }, [invites]);

  const quick = [
    { href: '/invite/new', label: 'New invite', tip: 'Create a registration link or a walk-in request', icon: UserPlus, tone: 'from-brand-50 to-brand-100 text-brand-600' },
    { href: '/visitors', label: 'My visitors', tip: 'Everyone you have invited, with live status', icon: Users, tone: 'from-emerald-50 to-emerald-100 text-emerald-600' },
    { href: '/notifications', label: 'Alerts', tip: 'Arrivals, exits and approvals for your guests', icon: Bell, tone: 'from-violet-50 to-violet-100 text-violet-600' },
    ...(user?.role === 'ADMIN'
      ? [{ href: '/admin', label: 'Admin', tip: 'Users, invites, audit trail and settings', icon: Shield, tone: 'from-amber-50 to-amber-100 text-amber-600' }]
      : []),
  ];

  const sheetOpen = view !== null;
  const drillKind = view?.kind === 'invite' ? view.from : view?.kind;
  const invite = view?.kind === 'invite' ? view.invite : null;

  return (
    <div className="page">
      <header className="hero animate-in mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-white/75">
              <Sparkles size={13} /> {greeting(now)}
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{user?.fullName || '…'}</h1>
            <p className="mt-0.5 truncate text-sm text-white/75">
              {[user?.organisation?.name, user?.role && titleCase(user.role === 'GATE' ? 'Gate officer' : user.role)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="rounded-2xl bg-white/15 px-3 py-2 text-center ring-1 ring-white/25 backdrop-blur">
            <span className="block text-[10px] uppercase tracking-wider text-white/70">
              {now ? now.toLocaleDateString(undefined, { weekday: 'short' }) : '\u00a0'}
            </span>
            <span className="block text-xl font-bold leading-none">{now ? now.getDate() : '\u00a0'}</span>
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Tooltip content="Your guests currently checked in at the gate">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-medium ring-1 ring-white/20 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> {plural(s.onSite, 'guest')} on site
            </span>
          </Tooltip>
          <Tooltip content="Invites with an expected arrival today">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-medium ring-1 ring-white/20 backdrop-blur">
              <CalendarDays size={12} /> {s.expectedToday} expected today
            </span>
          </Tooltip>
        </div>
      </header>

      <div className="stagger mb-5 grid grid-cols-2 gap-3">
        <StatCard
          title="Active / Used"
          value={s.act.length}
          data={s.actSeries}
          prev={s.actPrev}
          tone="brand"
          icon={<Users size={18} />}
          info="Invites that are live or already used by your guests. The trend shows new ones over the last 14 days."
          breakdown={[
            { label: 'Active', value: s.activeOnly },
            { label: 'Used', value: s.usedOnly },
          ]}
          onClick={() => setView({ kind: 'active' })}
        />
        <StatCard
          title="Pending approval"
          value={s.pend.length}
          data={s.pendSeries}
          prev={s.pendPrev}
          tone="amber"
          icon={<Clock size={18} />}
          info="Walk-in requests and invites waiting for an administrator to approve them."
          breakdown={[
            { label: 'Walk-in', value: s.offline },
            { label: 'Approval', value: s.awaiting },
          ]}
          onClick={() => setView({ kind: 'pending' })}
        />
      </div>

      <div className="stagger mb-6 grid grid-cols-2 gap-3">
        {quick.map(({ href, label, tip, icon: Icon, tone }) => (
          <Tooltip key={href} content={tip}>
            <Link href={href} className="card card-art group flex items-center gap-3 p-3.5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone} transition duration-300 group-hover:scale-110 group-hover:-rotate-6`}>
                <Icon size={21} />
              </span>
              <span className="text-sm font-semibold text-slate-800">{label}</span>
              <ChevronRight size={15} className="ml-auto text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </Link>
          </Tooltip>
        ))}
      </div>

      <section className="animate-in">
        <div className="section-title">
          Recent invites
          {invites.length > 5 && (
            <Link href="/visitors" className="order-last ml-2 normal-case tracking-normal text-brand-600 hover:underline">
              See all
            </Link>
          )}
        </div>
        {loading ? (
          <SkeletonList rows={4} />
        ) : invites.length === 0 ? (
          <Empty
            icon={<UserPlus size={24} />}
            title="No invites yet"
            hint="Create your first invite and your guests will get a secure registration link."
            action={
              <Link href="/invite/new" className="btn-primary">
                Create invite
              </Link>
            }
          />
        ) : (
          <ul className="rows stagger">
            {invites.slice(0, 5).map((inv) => (
              <InviteRow key={inv.id} inv={inv} onClick={() => setView({ kind: 'invite', invite: inv })} />
            ))}
          </ul>
        )}
      </section>

      <Sheet
        open={sheetOpen}
        onClose={() => setView(null)}
        tone={invite ? (isPending(invite) ? 'amber' : 'brand') : drillKind === 'pending' ? 'amber' : 'brand'}
        icon={invite ? <Users size={20} /> : drillKind === 'pending' ? <Clock size={20} /> : <Users size={20} />}
        title={invite ? invite.purpose : drillKind === 'pending' ? 'Pending approval' : 'Active & used invites'}
        subtitle={
          invite ? (
            <span className="flex items-center gap-2">
              {view?.kind === 'invite' && view.from && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  onClick={() => setView({ kind: view.from! })}
                >
                  <ArrowLeft size={12} /> Back
                </button>
              )}
              <StatusPill status={inviteStatus(invite)} />
            </span>
          ) : drillKind === 'pending' ? (
            'Requests waiting on an administrator'
          ) : (
            'The invites behind this number'
          )
        }
      >
        {invite ? (
          <InviteDetail inv={invite} />
        ) : (
          <Drill
            key={drillKind === 'pending' ? 'pending' : 'active'}
            kind={drillKind === 'pending' ? 'pending' : 'active'}
            list={drillKind === 'pending' ? s.pend : s.act}
            onPick={(i) => setView({ kind: 'invite', invite: i, from: drillKind as any })}
          />
        )}
      </Sheet>
    </div>
  );
}
