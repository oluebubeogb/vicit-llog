'use client';

import { ReactNode, useState } from 'react';
import TransferVisit from '@/components/TransferVisit';
import CheckpointTracker from '@/components/CheckpointTracker';
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
  ArrowRightLeft,
  Users,
  PhoneOff,
  XCircle,
  CalendarPlus,
  Loader2,
} from 'lucide-react';
import SleekOverlay from '@/components/ui/SleekOverlay';
import { Notice } from '@/components/ui/Bits';
import { VehicleLine } from '@/components/VehicleFields';
import { api, getUser } from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Tooltip from '@/components/ui/Tooltip';
import { Field, Fields } from '@/components/ui/Bits';
import PersonLink from '@/components/PersonLink';
import { avatarUrl, fmtDate, fmtDuration, inviteStatus, MODE_LABEL, photoUrl, plural, relTime, titleCase } from '@/lib/format';

export const MODE_ICON: Record<string, ReactNode> = {
  PEDESTRIAN: <Footprints size={14} />,
  MOTORCYCLE: <Bike size={14} />,
  VEHICLE: <Car size={14} />,
};

/** Tiny gray marker for guests with neither email nor phone (no link — photographed at the gate). */
export function NoContactIcon({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <Tooltip content="No email or phone — gate takes the photo">
      <span role="img" aria-label="No email or phone" className={`inline-flex shrink-0 items-center text-slate-400 ${className}`}>
        <PhoneOff size={size} />
      </span>
    </Tooltip>
  );
}

export const isNoContact = (v: any) => !!v && (v.noContact ?? (!v.email && !v.phone));

/** Transfer visit — icon on a light chip, label right beside it. Same everywhere it appears. */
export function TransferButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`chip-action ${className}`} onClick={onClick} data-testid="transfer-visit">
      <span className="chip-action-icon"><ArrowRightLeft size={13} /></span>
      <span>Transfer visit</span>
    </button>
  );
}

/** Names for an invite, without repeating status or counts. */
export function guestLabel(inv: any): string {
  const names: string[] = (inv.visitors?.length ? inv.visitors.map((v: any) => v.fullName) : inv.guestNames || []).filter(Boolean);
  const count = Math.max(inv.guestCount || 0, names.length);
  if (!names.length) return plural(count || 1, 'guest');
  if (names.length === 1 && count <= 1) return names[0];
  const extra = count - 1;
  return `${names[0]} +${extra} more`;
}

export function inviteGuestName(inv: any): string {
  const names: string[] = (inv?.visitors?.length ? inv.visitors.map((v: any) => v.fullName) : inv?.guestNames || []).filter(Boolean);
  return names.join(', ') || guestLabel(inv) || 'Guest';
}

/** Visitor check-in photo if present, otherwise the host/staff avatar. */
export function invitePortraitSrc(inv: any): string | null {
  const withPhoto = (inv?.visitors || []).find((v: any) => v.photoPath);
  if (withPhoto?.photoPath) return photoUrl(withPhoto.photoPath);
  if (inv?.host?.avatarPath) return avatarUrl(inv.host.avatarPath);
  return null;
}

/** Single Sheet header: avatar, name, purpose, status chips. Do not also render a hero body. */
export function inviteSheetProps(inv: any | null | undefined) {
  if (!inv) return {};
  const name = inviteGuestName(inv);
  return {
    leading: <Avatar name={name} src={invitePortraitSrc(inv)} size={48} />,
    title: name,
    subtitle: inv.purpose || 'Visit',
    chips: (
      <>
        <StatusPill status={inviteStatus(inv)} />
        {inv.category ? <StatusPill status={inv.category} /> : null}
      </>
    ),
    icon: undefined as undefined,
  };
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
  const [transfer, setTransfer] = useState(false);
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
          <p className="flex items-center gap-1.5 truncate font-semibold text-slate-800">
            <span className="truncate">{v.fullName}</span>
            {isNoContact(v) && <NoContactIcon />}
          </p>
          <p className="truncate text-xs text-slate-500">
            {[v.phone, v.email, v.entryMode && MODE_LABEL[v.entryMode]].filter(Boolean).join(' · ') || 'No email or phone'}
          </p>
          {(v.vehiclePlate || v.vehicleDetails) && <p className="mt-0.5 text-xs"><VehicleLine plate={v.vehiclePlate} details={v.vehicleDetails} /></p>}
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
      {(v.gateVisits || []).length > 0 && (
        <div className="mt-3">
          <CheckpointTracker
            gates={Array.from(new Map((v.gateVisits || []).map((e: any) => [e.gate?.id || e.gateId, e.gate || { id: e.gateId, name: e.gate?.name || 'Gate', sequence: e.gate?.sequence || 0 }])).values()) as any}
            visits={v.gateVisits || []}
            direction={v.status === 'ARRIVED' || v.status === 'EXITED' ? 'both' : 'ENTRY'}
          />
        </div>
      )}
      {(v.transfers || []).length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-indigo-800">
          {v.transfers.map((t: any) => (
            <li key={t.id} className="rounded-lg bg-indigo-50 px-2 py-1">{new Date(t.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — {t.comment}</li>
          ))}
        </ul>
      )}
      {v.status !== 'EXITED' && v.status !== 'CANCELLED' && (
        <div className="mt-3 flex">
          <TransferButton onClick={() => setTransfer(true)} />
        </div>
      )}
      <TransferVisit open={transfer} onClose={() => setTransfer(false)} visitor={v} onDone={() => window.location.reload()} />
    </div>
  );
}

function ItemsSummary({ visitors }: { visitors: any[] }) {
  const items = visitors.flatMap((v) =>
    (v.gateVisits || []).flatMap((event: any) =>
      (event.particulars || []).map((item: any) => ({
        ...item,
        guest: v.fullName,
        gate: event.gate?.name,
      })),
    ),
  );
  const withheld = items.filter((item) => item.kind === 'WITHHELD');
  const allowed = items.filter((item) => item.kind === 'ALLOWED');
  if (!withheld.length && !allowed.length) return null;
  const box = (label: string, rows: any[], tone: string) => (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <ul className={`space-y-1 rounded-xl border px-3 py-2 text-sm ${tone}`}>
        {rows.map((item) => (
          <li key={item.id}>
            {item.description}
            {item.quantity > 1 ? ` ×${item.quantity}` : ''}
            <span className="text-xs opacity-70">{[item.guest, item.gate].filter(Boolean).length ? ` · ${[item.guest, item.gate].filter(Boolean).join(' · ')}` : ''}</span>
            {item.returnedAt ? <span className="ml-1 text-xs font-semibold text-emerald-700">Returned</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="space-y-2">
      {withheld.length > 0 && box('Withheld', withheld, 'border-rose-100 bg-rose-50 text-rose-900')}
      {allowed.length > 0 && box('Allowed', allowed, 'border-emerald-100 bg-emerald-50 text-emerald-900')}
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
            <span className="flex flex-wrap items-center gap-2">
              {MODE_LABEL[inv.expectedMode] || titleCase(inv.expectedMode)}
              <VehicleLine plate={inv.vehiclePlate} details={inv.vehicleDetails} />
            </span>
          </Field>
        )}
        {inv.cancelledAt && (
          <Field icon={<XCircle size={14} />} label="Cancelled">
            {fmtDate(inv.cancelledAt)}{inv.cancelReason ? <span className="text-slate-500"> · {inv.cancelReason}</span> : null}
          </Field>
        )}
        {inv.postponeCount > 0 && !inv.cancelledAt && (
          <Field icon={<CalendarPlus size={14} />} label="Postponed">
            {inv.postponeCount}× · last {relTime(inv.postponedAt)}
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

      <InviteActions inv={inv} />

      <ItemsSummary visitors={visitors} />
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

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Host / admin actions: cancel (any stage) and postpone (active or expired). */
export function InviteActions({ inv, onChanged }: { inv: any; onChanged?: () => void }) {
  const me = typeof window !== 'undefined' ? getUser() : null;
  const [mode, setMode] = useState<null | 'cancel' | 'postpone'>(null);
  const [reason, setReason] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const st = inviteStatus(inv);
  const canManage = !!me && (inv.host?.id === me.id || inv.hostId === me.id || ['ADMIN', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(me.role));
  const openGuests = (inv.visitors || []).some((v: any) => v.status === 'INVITED' || v.status === 'ARRIVED');
  if (!canManage || st === 'CANCELLED' || st === 'REVOKED') return null;
  const canPostpone = ['ACTIVE', 'EXPIRED', 'USED'].includes(st) && (inv.visitors || []).some((v: any) => v.status === 'INVITED');
  const done = () => {
    setMode(null);
    if (onChanged) onChanged();
    else window.location.reload();
  };
  const min = toLocalInput(new Date(Date.now() + 5 * 60000));
  async function submit() {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'cancel') await api.cancelInvite(inv.id, reason.trim() || undefined);
      else {
        if (!when) throw new Error('Choose the new date and time');
        const d = new Date(when);
        if (d.getTime() < Date.now()) throw new Error('The new date and time cannot be in the past');
        await api.postponeInvite(inv.id, d.toISOString(), reason.trim() || undefined);
      }
      done();
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }
  if (!openGuests && !canPostpone) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2" data-testid="invite-actions">
        {canPostpone && (
          <button type="button" className="chip-action" onClick={() => { setMode('postpone'); setWhen(inv.expectedAt && new Date(inv.expectedAt) > new Date() ? toLocalInput(new Date(inv.expectedAt)) : ''); setReason(''); setErr(''); }}>
            <span className="chip-action-icon"><CalendarPlus size={13} /></span> Postpone
          </button>
        )}
        <button type="button" className="chip-action !text-rose-700 hover:!border-rose-200 hover:!bg-rose-50" onClick={() => { setMode('cancel'); setReason(''); setErr(''); }}>
          <span className="chip-action-icon !bg-rose-50 !text-rose-600"><XCircle size={13} /></span> Cancel invite
        </button>
      </div>
      <SleekOverlay
        open={!!mode}
        onClose={() => !busy && setMode(null)}
        tone={mode === 'cancel' ? 'rose' : 'brand'}
        icon={mode === 'cancel' ? <XCircle size={20} /> : <CalendarPlus size={20} />}
        title={mode === 'cancel' ? 'Cancel this invite?' : 'Postpone visit'}
        subtitle={mode === 'cancel' ? 'Guests are notified and the gate will show it as Cancelled.' : 'Guests and you get the new date and time.'}
        footer={
          <div className="flex w-full gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setMode(null)} disabled={busy}>Back</button>
            <button type="button" className={`${mode === 'cancel' ? 'btn-danger' : 'btn-primary'} flex-1`} onClick={submit} disabled={busy || (mode === 'postpone' && !when)}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'cancel' ? 'Cancel invite' : 'Postpone'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {mode === 'postpone' && (
            <label className="block">
              <span className="label">New date & time</span>
              <input type="datetime-local" className="input" min={min} value={when} onChange={(e) => setWhen(e.target.value)} data-testid="postpone-when" />
            </label>
          )}
          <label className="block">
            <span className="label">{mode === 'cancel' ? 'Reason (optional)' : 'Note to guests (optional)'}</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={mode === 'cancel' ? 'e.g. Meeting called off' : 'e.g. Moved to the afternoon'} />
          </label>
          {err && <Notice tone="error">{err}</Notice>}
        </div>
      </SleekOverlay>
    </>
  );
}
