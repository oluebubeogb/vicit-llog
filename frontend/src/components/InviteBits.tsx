'use client';

import { ReactNode, useState } from 'react';
import clsx from 'clsx';
import {
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  Footprints,
  Car,
  Bike,
  KeyRound,
  LogIn,
  LogOut,
  Ban,
  Timer,
  Hourglass,
  Tag,
  UserRound,
  Users,
} from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Tooltip from '@/components/ui/Tooltip';
import { Field, Fields } from '@/components/ui/Bits';
import PersonLink from '@/components/PersonLink';
import { fmtDate, fmtDuration, inviteStatus, MODE_LABEL, photoUrl, plural, relTime, titleCase } from '@/lib/format';

export const MODE_ICON: Record<string, ReactNode> = {
  PEDESTRIAN: <Footprints size={14} />,
  MOTORCYCLE: <Bike size={14} />,
  VEHICLE: <Car size={14} />,
};

/** Names for an invite, without repeating status or counts. */
export function guestLabel(inv: any): string {
  const names: string[] = (inv.visitors?.length ? inv.visitors.map((v: any) => v.fullName) : inv.guestNames || []).filter(Boolean);
  const count = Math.max(inv.guestCount || 0, names.length);
  if (!names.length) return plural(count || 1, 'guest');
  if (names.length === 1 && count <= 1) return names[0];
  const extra = count - 1;
  return `${names[0]} +${extra} more`;
}

/** Rich, de-duplicated invite row: purpose once, status pill once, guests + time as context. */
export function InviteRow({ inv, onClick, showHost }: { inv: any; onClick?: () => void; showHost?: boolean }) {
  const st = inviteStatus(inv);
  const onSite = (inv.visitors || []).filter((v: any) => v.status === 'ARRIVED').length;
  const names: string[] = (inv.visitors?.length ? inv.visitors.map((v: any) => v.fullName) : inv.guestNames || []).filter(Boolean);
  return (
    <li>
      <button type="button" onClick={onClick} className="row-link group w-full text-left">
        <div className="flex items-center -space-x-2">
          {(names.length ? names.slice(0, 2) : [inv.purpose]).map((n, i) => (
            <Avatar key={i} name={n} size={36} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">{inv.purpose}</p>
            <StatusPill status={st} className="shrink-0" />
          </div>
          <p className="mt-0.5 flex min-w-0 items-center text-xs text-slate-500">
            {inv.category && (
              <span className={clsx('mr-1.5 inline-flex shrink-0 items-center gap-1 font-medium', inv.category === 'PERSONAL' ? 'text-violet-600' : 'text-brand-600')}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', inv.category === 'PERSONAL' ? 'bg-violet-400' : 'bg-brand-400')} />
                {titleCase(inv.category)}
                <span className="ml-0.5 text-slate-300">•</span>
              </span>
            )}
            <span className="truncate">
              {guestLabel(inv)}
              <span className="mx-1.5 text-slate-300">•</span>
              {showHost && inv.host?.fullName ? `${inv.host.fullName} · ` : ''}
              {relTime(inv.createdAt)}
              {onSite > 0 && <span className="ml-1.5 font-semibold text-emerald-600">· {onSite} on site</span>}
            </span>
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
      </button>
    </li>
  );
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Tooltip content={ok ? 'Copied!' : label}>
      <button
        type="button"
        className="icon-btn h-8 w-8"
        aria-label={label}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(value);
            setOk(true);
            setTimeout(() => setOk(false), 1400);
          } catch {}
        }}
      >
        {ok ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
      </button>
    </Tooltip>
  );
}

function minutesBetween(a?: string | null, b?: string | null) {
  if (!a) return null;
  const end = b ? new Date(b) : new Date();
  return Math.max(0, Math.round((end.getTime() - new Date(a).getTime()) / 60000));
}

/** Visitor timeline card for invite details. */
export function VisitorCard({ v }: { v: any }) {
  const steps = [
    { at: v.createdAt, label: 'Registered', icon: <UserRound size={12} />, tone: 'bg-brand-500' },
    v.enteredAt && { at: v.enteredAt, label: 'Checked in', icon: <LogIn size={12} />, tone: 'bg-emerald-500' },
    v.exitedAt && { at: v.exitedAt, label: 'Checked out', icon: <LogOut size={12} />, tone: 'bg-slate-500' },
    v.deniedAt && { at: v.deniedAt, label: v.deniedReason ? `Declined — ${v.deniedReason}` : 'Declined', icon: <Ban size={12} />, tone: 'bg-rose-500' },
  ].filter(Boolean) as { at: string; label: string; icon: ReactNode; tone: string }[];
  const dur = minutesBetween(v.enteredAt, v.exitedAt);
  return (
    <div className="tile group">
      <div className="flex items-center gap-3">
        <Avatar name={v.fullName} src={photoUrl(v.photoPath)} size={42} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800">{v.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            {[v.phone, v.entryMode && MODE_LABEL[v.entryMode]].filter(Boolean).join(' · ') || 'No contact on file'}
          </p>
        </div>
        <StatusPill status={v.status} />
      </div>
      {steps.length > 0 && (
        <ol className="relative ml-[18px] mt-3 space-y-2 border-l border-dashed border-slate-200 pl-4">
          {steps.map((s, i) => (
            <li key={i} className="relative text-xs">
              <span className={clsx('absolute -left-[25px] top-0.5 flex h-[17px] w-[17px] items-center justify-center rounded-full text-white ring-2 ring-white', s.tone)}>
                {s.icon}
              </span>
              <span className="font-medium text-slate-700">{s.label}</span>
              <span className="ml-1.5 text-slate-400">{fmtDate(s.at)}</span>
            </li>
          ))}
        </ol>
      )}
      {dur !== null && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <Timer size={11} /> {v.exitedAt ? 'Stayed' : 'On site for'} {fmtDuration(dur)}
        </p>
      )}
    </div>
  );
}

/** Body of the invite detail sheet. */
export function InviteDetail({ inv, children }: { inv: any; children?: ReactNode }) {
  const st = inviteStatus(inv);
  const link = typeof window !== 'undefined' && inv.token ? `${window.location.origin}/visitor/${inv.token}` : '';
  const visitors = inv.visitors || [];
  const arrived = visitors.filter((v: any) => v.enteredAt).length;
  const total = Math.max(inv.guestCount || 0, visitors.length, 1);
  const pct = Math.round((arrived / total) * 100);
  return (
    <div className="space-y-4">
      <div className="tile-muted grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-slate-900">{total}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Expected</p>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{visitors.length}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Registered</p>
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-600">{arrived}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Arrived</p>
        </div>
        <div className="col-span-3 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-brand-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Fields>
        <Field icon={<Tag size={14} />} label="Status">
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={st} />
            {inv.category && <StatusPill status={inv.category} />}
          </span>
        </Field>
        {inv.host?.fullName && (
          <Field icon={<UserRound size={14} />} label="Host">
            <PersonLink id={inv.host.id} name={inv.host.fullName} />
          </Field>
        )}
        {inv.expectedAt && (
          <Field icon={<CalendarClock size={14} />} label="Expected">
            {fmtDate(inv.expectedAt)} <span className="text-slate-400">· {relTime(inv.expectedAt)}</span>
          </Field>
        )}
        {inv.expectedMode && (
          <Field icon={MODE_ICON[inv.expectedMode] || <Car size={14} />} label="Arriving by">
            {MODE_LABEL[inv.expectedMode] || titleCase(inv.expectedMode)}
          </Field>
        )}
        <Field icon={<Hourglass size={14} />} label={st === 'EXPIRED' ? 'Expired' : 'Link expires'}>
          {fmtDate(inv.expiresAt)} <span className="text-slate-400">· {relTime(inv.expiresAt)}</span>
        </Field>
        {inv.passphrase && (
          <Field icon={<KeyRound size={14} />} label="Passphrase">
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono tracking-widest">{inv.passphrase}</span>
              <CopyBtn value={inv.passphrase} label="Copy passphrase" />
            </span>
          </Field>
        )}
        {link && (st === 'ACTIVE' || st === 'USED') && (
          <Field icon={<Copy size={14} />} label="Registration link">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-slate-500">{link.replace(/^https?:\/\//, '')}</span>
              <CopyBtn value={link} label="Copy link to share" />
            </span>
          </Field>
        )}
        <Field icon={<CalendarClock size={14} />} label="Created">
          {fmtDate(inv.createdAt)} <span className="text-slate-400">· {relTime(inv.createdAt)}</span>
        </Field>
      </Fields>

      <div>
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <Users size={12} /> Guests
        </p>
        {visitors.length ? (
          <div className="stagger space-y-2">
            {visitors.map((v: any) => (
              <VisitorCard key={v.id} v={v} />
            ))}
          </div>
        ) : (
          <div className="tile-muted text-sm text-slate-500">
            {(inv.guestNames || []).length ? (
              <>Expected: {(inv.guestNames || []).join(', ')}. Nobody has registered yet.</>
            ) : (
              'Nobody has registered with this link yet.'
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
