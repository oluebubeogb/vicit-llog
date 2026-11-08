'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { api, getUser } from '@/lib/api';
import {
  Ban,
  Bell,
  BellRing,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  FileText,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Timer,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Sheet from '@/components/ui/Sheet';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Tooltip from '@/components/ui/Tooltip';
import { Empty, Field, Fields, SkeletonList } from '@/components/ui/Bits';
import PersonLink from '@/components/PersonLink';
import { fmtDate, fmtDuration, fmtTime, MODE_LABEL, photoUrl, relTime, titleCase } from '@/lib/format';
import { MODE_ICON } from '@/components/InviteBits';

type Tone = 'brand' | 'emerald' | 'amber' | 'rose' | 'violet';
const TYPE: Record<string, { label: string; icon: ReactNode; tone: Tone }> = {
  ARRIVAL: { label: 'Visitor arrival', icon: <LogIn size={18} />, tone: 'emerald' },
  EXIT: { label: 'Visitor exit', icon: <LogOut size={18} />, tone: 'brand' },
  ENTRY_DENIED: { label: 'Entry declined', icon: <Ban size={18} />, tone: 'rose' },
  PHOTO_CAPTURED: { label: 'Visitor registered', icon: <Camera size={18} />, tone: 'violet' },
  profile_edit: { label: 'Profile update', icon: <UserCog size={18} />, tone: 'amber' },
  INVITE_APPROVAL: { label: 'Approval needed', icon: <ClipboardCheck size={18} />, tone: 'amber' },
  INVITE_APPROVED: { label: 'Invite approved', icon: <CheckCircle2 size={18} />, tone: 'emerald' },
};
const TONE_TILE: Record<Tone, string> = {
  brand: 'from-brand-100 to-brand-50 text-brand-600',
  emerald: 'from-emerald-100 to-emerald-50 text-emerald-600',
  amber: 'from-amber-100 to-amber-50 text-amber-600',
  rose: 'from-rose-100 to-rose-50 text-rose-600',
  violet: 'from-violet-100 to-violet-50 text-violet-600',
};
const CHANNEL: Record<string, string> = { in_app: 'In-app', sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' };

function meta(n: any) {
  return TYPE[n?.meta?.type] || { label: 'Update', icon: <Bell size={18} />, tone: 'brand' as Tone };
}

function dayLabel(d: Date) {
  const t = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

/** One-line human summary that replaces raw ids. */
function summary(n: any): string | null {
  const v = n.context?.visitor;
  const inv = n.context?.invite;
  const parts: string[] = [];
  if (inv?.purpose) parts.push(inv.purpose);
  if (v?.gate?.name) parts.push(v.gate.name);
  if (v?.durationMinutes != null && n.meta?.type === 'EXIT') parts.push(`stayed ${fmtDuration(v.durationMinutes)}`);
  if (v?.onSite && n.meta?.type === 'ARRIVAL') parts.push('still on site');
  return parts.length ? parts.join(' · ') : null;
}

function Timeline({ v }: { v: any }) {
  const steps = [
    { at: v.createdAt, label: 'Registered', icon: <UserRound size={12} />, c: 'bg-brand-500' },
    v.enteredAt && { at: v.enteredAt, label: `Checked in${v.entryBy ? ` by ${v.entryBy.fullName}` : ''}`, icon: <LogIn size={12} />, c: 'bg-emerald-500' },
    v.exitedAt && { at: v.exitedAt, label: `Checked out${v.exitBy ? ` by ${v.exitBy.fullName}` : ''}`, icon: <LogOut size={12} />, c: 'bg-slate-500' },
    v.deniedAt && { at: v.deniedAt, label: 'Entry declined', icon: <Ban size={12} />, c: 'bg-rose-500' },
  ].filter(Boolean) as any[];
  return (
    <ol className="relative ml-3 space-y-3 border-l-2 border-dashed border-brand-100 pl-5">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full text-white ring-4 ring-white ${s.c}`}>{s.icon}</span>
          <p className="text-sm font-medium text-slate-800">{s.label}</p>
          <p className="text-xs text-slate-400">
            {fmtDate(s.at)} · {relTime(s.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Detail({ n, isStaffViewer }: { n: any; isStaffViewer: boolean }) {
  const m = n.meta || {};
  const v = n.context?.visitor;
  const inv = n.context?.invite;
  const req = n.context?.request;
  const channels: string[] = Array.isArray(m.channels) ? m.channels : [];
  const delivery = m.delivery && typeof m.delivery === 'object' ? Object.entries(m.delivery) : [];
  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-slate-700">{n.body}</p>

      {v && (
        <div className="card card-art p-4">
          <div className="flex items-center gap-3">
            <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={54} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-slate-900">{v.fullName}</p>
              <p className="truncate text-xs text-slate-500">
                {[v.entryMode && MODE_LABEL[v.entryMode], v.gate?.name, v.gate?.location].filter(Boolean).join(' · ') || 'Visitor'}
              </p>
            </div>
            <StatusPill status={v.status} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="tile !p-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">In</p>
              <p className="text-sm font-bold text-slate-800">{v.enteredAt ? fmtTime(v.enteredAt) : '—'}</p>
            </div>
            <div className="tile !p-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Out</p>
              <p className="text-sm font-bold text-slate-800">{v.exitedAt ? fmtTime(v.exitedAt) : v.onSite ? 'On site' : '—'}</p>
            </div>
            <div className="tile !p-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{v.onSite ? 'So far' : 'Stayed'}</p>
              <p className="text-sm font-bold text-slate-800">{v.durationMinutes != null ? fmtDuration(v.durationMinutes) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {v && (
        <div>
          <p className="section-title">Journey</p>
          <div className="tile-muted">
            <Timeline v={v} />
          </div>
        </div>
      )}

      <Fields>
        {inv && (
          <Field icon={<FileText size={14} />} label="Visit">
            <span className="flex flex-wrap items-center gap-1.5">
              {inv.purpose}
              {inv.category && <StatusPill status={inv.category} />}
            </span>
          </Field>
        )}
        {inv?.host && (
          <Field icon={<UserRound size={14} />} label="Host">
            <PersonLink id={inv.host.id} name={inv.host.fullName} />
            {inv.host.portfolio && <span className="text-slate-400"> · {inv.host.portfolio}</span>}
          </Field>
        )}
        {v?.gate && (
          <Field icon={<DoorOpen size={14} />} label="Gate">
            {v.gate.name}
            {v.gate.location && <span className="text-slate-400"> · {v.gate.location}</span>}
          </Field>
        )}
        {inv?.location && (
          <Field icon={<MapPin size={14} />} label="Location">
            {inv.location}
          </Field>
        )}
        {v?.entryBy && (
          <Field icon={<ShieldCheck size={14} />} label="Admitted by">
            {isStaffViewer ? v.entryBy.fullName : <PersonLink id={v.entryBy.id} name={v.entryBy.fullName} />}
          </Field>
        )}
        {v?.exitBy && (
          <Field icon={<ShieldCheck size={14} />} label="Signed out by">
            {isStaffViewer ? v.exitBy.fullName : <PersonLink id={v.exitBy.id} name={v.exitBy.fullName} />}
          </Field>
        )}
        {(v?.phone || m.phone) && (
          <Field icon={<Phone size={14} />} label="Phone">
            <a href={`tel:${v?.phone || m.phone}`} className="text-brand-700 hover:underline">
              {v?.phone || m.phone}
            </a>
          </Field>
        )}
        {v?.entryMode && (
          <Field icon={MODE_ICON[v.entryMode]} label="Arrived by">
            {MODE_LABEL[v.entryMode]}
          </Field>
        )}
        {v?.deniedReason && (
          <Field icon={<Ban size={14} />} label="Reason declined">
            <span className="text-rose-700">{v.deniedReason}</span>
          </Field>
        )}
        {v?.gateNotes && (
          <Field icon={<MessageSquare size={14} />} label="Gate notes">
            {v.gateNotes}
          </Field>
        )}
        {inv?.expectedAt && !v && (
          <Field icon={<Clock3 size={14} />} label="Expected">
            {fmtDate(inv.expectedAt)}
          </Field>
        )}
        {req && (
          <Field icon={<UserCog size={14} />} label="Request">
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={req.status} />
              {req.reviewedBy && <span className="text-slate-500">by {req.reviewedBy.fullName}</span>}
              {req.reviewedAt && <span className="text-slate-400">· {relTime(req.reviewedAt)}</span>}
            </span>
          </Field>
        )}
        {req?.reviewNote && (
          <Field icon={<MessageSquare size={14} />} label="Reviewer note">
            {req.reviewNote}
          </Field>
        )}
        {!inv && !v && !req && m.status && (
          <Field icon={<FileText size={14} />} label="Status">
            {titleCase(String(m.status))}
          </Field>
        )}
      </Fields>

      {req?.after && typeof req.after === 'object' && (
        <div>
          <p className="section-title">Requested changes</p>
          <div className="rows">
            {Object.keys(req.after).map((k) => (
              <div key={k} className="px-3.5 py-2.5 text-sm">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{titleCase(k.replace(/([A-Z])/g, ' $1'))}</p>
                <p className="mt-0.5">
                  <span className="text-slate-400 line-through decoration-rose-300">{String(req.before?.[k] ?? '—')}</span>
                  <span className="mx-1.5 text-slate-300">→</span>
                  <span className="font-semibold text-emerald-700">{String(req.after[k] ?? '—')}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {inv?.visitors?.length > 1 && (
        <div>
          <p className="section-title">
            <Users size={12} /> Party of {inv.visitors.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {inv.visitors.map((g: any) => (
              <span key={g.id} className="chip !py-1 !pl-1">
                <Avatar name={g.fullName} src={photoUrl(g.photoPath)} size={20} ring={false} />
                {g.fullName}
                <StatusPill status={g.status} className="!py-0 !text-[10px]" />
              </span>
            ))}
          </div>
        </div>
      )}

      {(channels.length > 0 || delivery.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <BellRing size={13} className="text-slate-400" /> Delivered via
          {channels.map((c) => (
            <span key={c} className="chip">{CHANNEL[c] || titleCase(c)}</span>
          ))}
          {delivery.map(([ch, r]: any) => (
            <Tooltip key={ch} content={r?.ok ? 'Delivered' : `Failed${r?.error ? `: ${r.error}` : ''}`}>
              <span className={`chip ${r?.ok ? '!border-emerald-200 !text-emerald-700' : '!border-rose-200 !text-rose-700'}`}>
                {CHANNEL[ch] || ch} {r?.ok ? '✓' : '✕'}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Timer size={12} /> {fmtDate(n.createdAt)} · {relTime(n.createdAt)}
      </p>
    </div>
  );
}

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'gate' | 'other'>('all');

  useEffect(() => {
    setRole(getUser()?.role ?? null);
    (async () => {
      try {
        const list = await api.notifications();
        setItems(list);
        const unread = (list || []).filter((n: any) => !n.isRead);
        setFresh(new Set(unread.map((n: any) => n.id)));
        if (unread.length) {
          await api.markAllRead().catch(() => {});
          setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = useMemo(() => {
    const out: { label: string; items: any[] }[] = [];
    for (const n of items) {
      const t = n.meta?.type;
      const isGate = ['ARRIVAL', 'EXIT', 'ENTRY_DENIED'].includes(t);
      if (filter === 'gate' && !isGate) continue;
      if (filter === 'other' && isGate) continue;
      const l = dayLabel(new Date(n.createdAt));
      const g = out[out.length - 1];
      if (g && g.label === l) g.items.push(n);
      else out.push({ label: l, items: [n] });
    }
    return out;
  }, [items, filter]);

  const sel = selected ? meta(selected) : null;

  return (
    <div className="page">
      <PageHeader
        back={role === 'GATE' ? '/gate' : '/dashboard'}
        icon={<Bell size={20} />}
        title="Alerts"
        subtitle={loading ? 'Loading…' : fresh.size ? `${fresh.size} new since your last visit` : 'You are all caught up'}
        info="Arrivals, exits and approvals for your guests. Tap an alert for the full visit story."
      />
      <div className="animate-in mb-4 segmented">
        {(
          [
            ['all', 'All'],
            ['gate', 'Gate activity'],
            ['other', 'Requests'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" data-active={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={6} h={72} />
      ) : groups.length === 0 ? (
        <Empty icon={<Bell size={24} />} title="No alerts yet" hint="You'll be notified here the moment a guest arrives or leaves." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} className="animate-in">
              <p className="section-title">{g.label}</p>
              <ul className="rows stagger">
                {g.items.map((n) => {
                  const t = meta(n);
                  const v = n.context?.visitor;
                  const s = summary(n);
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => setSelected(n)} className="row-link group items-start">
                        <span className="relative">
                          {v ? (
                            <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={42} />
                          ) : (
                            <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-full bg-gradient-to-br ${TONE_TILE[t.tone]}`}>{t.icon}</span>
                          )}
                          {v && (
                            <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ring-2 ring-white [&>svg]:h-3 [&>svg]:w-3 ${TONE_TILE[t.tone]}`}>
                              {t.icon}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold text-slate-800">{n.title}</span>
                            {fresh.has(n.id) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgb(var(--brand-100))]" />}
                            <span className="ml-auto shrink-0 text-[11px] text-slate-400">{relTime(n.createdAt)}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">{n.body}</span>
                          {s && <span className="mt-1 block truncate text-xs font-medium text-brand-700/80">{s}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        tone={sel?.tone}
        icon={sel?.icon}
        title={selected?.title}
        subtitle={sel?.label}
      >
        {selected && <Detail n={selected} isStaffViewer={role === 'STAFF'} />}
      </Sheet>
    </div>
  );
}
