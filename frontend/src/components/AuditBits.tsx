'use client';

import { ReactNode } from 'react';
import {
  Ban,
  Camera,
  CheckCircle2,
  FilePlus2,
  History,
  LogIn,
  LogOut,
  RotateCcw,
  ShieldOff,
  UserCog,
} from 'lucide-react';
import { titleCase } from '@/lib/format';

export type AuditTone = 'brand' | 'emerald' | 'amber' | 'rose' | 'violet';
export type AuditGroup = 'gate' | 'invites' | 'people' | 'security';

const name = (a: any) => a.user?.fullName || 'System';
const relName = (a: any) => a.related?.fullName || a.details?.fullName || 'a visitor';
const purpose = (a: any) => a.related?.purpose || a.details?.purpose;

export const FIELD_LABEL: Record<string, string> = {
  fullName: 'Name',
  email: 'Email',
  phone: 'Phone',
  portfolio: 'Portfolio',
  role: 'Role',
  isActive: 'Account active',
  mode: 'Arrived by',
  notes: 'Notes',
  reason: 'Reason',
  guestCount: 'Guests',
  purpose: 'Purpose',
  idNumber: 'ID number',
  inviteId: 'Invite',
};

export function fieldLabel(k: string) {
  return FIELD_LABEL[k] || titleCase(k.replace(/([A-Z])/g, ' $1'));
}

export function fmtValue(v: any): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (v === null || v === undefined || v === '') return '—';
  // Enum-like values (STAFF, OFFLINE_PENDING) read better title-cased; keep short acronyms (HR, IT) as typed
  if (typeof v === 'string' && /^[A-Z]+(_[A-Z]+)*$/.test(v) && v.length > 3) return v === 'GATE' ? 'Gate officer' : titleCase(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

type Desc = { label: string; icon: ReactNode; tone: AuditTone; group: AuditGroup; text: (a: any) => string };

const MAP: Record<string, Desc> = {
  ENTRY_RECORDED: {
    label: 'Checked in',
    icon: <LogIn size={16} />,
    tone: 'emerald',
    group: 'gate',
    text: (a) => `${name(a)} checked in ${relName(a)}${a.details?.mode ? ` (${fmtValue(a.details.mode).toLowerCase()})` : ''}`,
  },
  EXIT_RECORDED: {
    label: 'Checked out',
    icon: <LogOut size={16} />,
    tone: 'brand',
    group: 'gate',
    text: (a) => `${name(a)} signed out ${relName(a)}`,
  },
  ENTRY_DENIED: {
    label: 'Entry declined',
    icon: <Ban size={16} />,
    tone: 'rose',
    group: 'gate',
    text: (a) => `${name(a)} declined entry for ${relName(a)}${a.details?.reason ? ` — “${a.details.reason}”` : ''}`,
  },
  PHOTO_CAPTURED: {
    label: 'Registered',
    icon: <Camera size={16} />,
    tone: 'violet',
    group: 'gate',
    text: (a) => `${relName(a)} completed registration with a photo`,
  },
  INVITE_CREATED: {
    label: 'Invite created',
    icon: <FilePlus2 size={16} />,
    tone: 'brand',
    group: 'invites',
    text: (a) =>
      `${name(a)} invited ${a.details?.guestCount ? `${a.details.guestCount} guest${a.details.guestCount === 1 ? '' : 's'}` : 'guests'}${purpose(a) ? ` for “${purpose(a)}”` : ''}`,
  },
  INVITE_REVIVED: {
    label: 'Invite revived',
    icon: <RotateCcw size={16} />,
    tone: 'amber',
    group: 'invites',
    text: (a) => `${name(a)} revived the invite${purpose(a) ? ` for “${purpose(a)}”` : ''}`,
  },
  INVITE_APPROVED: {
    label: 'Invite approved',
    icon: <CheckCircle2 size={16} />,
    tone: 'emerald',
    group: 'invites',
    text: (a) => `${name(a)} approved${purpose(a) ? ` “${purpose(a)}”` : ' an invite'}`,
  },
  OFFLINE_INVITE_APPROVED: {
    label: 'Walk-in approved',
    icon: <CheckCircle2 size={16} />,
    tone: 'emerald',
    group: 'invites',
    text: (a) => `${name(a)} approved the walk-in${purpose(a) ? ` “${purpose(a)}”` : ''}`,
  },
  USER_UPDATED: {
    label: 'User updated',
    icon: <UserCog size={16} />,
    tone: 'violet',
    group: 'people',
    text: (a) => {
      const f = Object.keys(a.details?.changes || {}).map((k) => fieldLabel(k).toLowerCase());
      return `${name(a)} updated ${a.related?.fullName ? `${a.related.fullName}’s` : 'a user’s'} ${f.length ? f.join(', ') : 'profile'}`;
    },
  },
  BLACKLIST_ADD: {
    label: 'Blacklisted',
    icon: <Ban size={16} />,
    tone: 'rose',
    group: 'security',
    text: (a) => `${name(a)} blacklisted ${a.details?.fullName || a.details?.phone || a.related?.fullName || 'a person'}${a.details?.reason ? ` — “${a.details.reason}”` : ''}`,
  },
  BLACKLIST_DEACTIVATE: {
    label: 'Blacklist lifted',
    icon: <ShieldOff size={16} />,
    tone: 'amber',
    group: 'security',
    text: (a) => `${name(a)} lifted the blacklist on ${a.related?.fullName || a.related?.phone || 'an entry'}`,
  },
};

export function auditMeta(a: any): Desc {
  return (
    MAP[a?.action] || {
      label: titleCase(String(a?.action || 'Event').replace(/_/g, ' ')),
      icon: <History size={16} />,
      tone: 'brand',
      group: 'people',
      text: (x: any) => `${name(x)} · ${titleCase(String(x.action || '').replace(/_/g, ' '))}${x.entity ? ` on ${x.entity}` : ''}`,
    }
  );
}

export const AUDIT_TILE: Record<AuditTone, string> = {
  brand: 'from-brand-100 to-brand-50 text-brand-600 ring-brand-200/60',
  emerald: 'from-emerald-100 to-emerald-50 text-emerald-600 ring-emerald-200/60',
  amber: 'from-amber-100 to-amber-50 text-amber-600 ring-amber-200/60',
  rose: 'from-rose-100 to-rose-50 text-rose-600 ring-rose-200/60',
  violet: 'from-violet-100 to-violet-50 text-violet-600 ring-violet-200/60',
};
