'use client';

import { Check, Clock, X } from 'lucide-react';
import clsx from 'clsx';
import Avatar from '@/components/ui/Avatar';
import { avatarUrl, fmtDate, relTime } from '@/lib/format';

const FIELD_LABEL: Record<string, string> = {
  fullName: 'Name',
  phone: 'Phone',
  portfolio: 'Portfolio',
  email: 'Email',
  avatarPath: 'Photo',
  customFields: 'Extra fields',
};

/** Which fields a profile edit request changes. */
export function changedFields(r: any): string[] {
  const before = r?.before || {};
  const after = r?.after || {};
  return Object.keys(after).filter((k) => JSON.stringify(after[k] ?? null) !== JSON.stringify(before[k] ?? null));
}

export function fieldLabel(k: string) {
  return FIELD_LABEL[k] || k;
}

function show(v: any) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(', ') : x}`).join(' · ') || '—';
  return String(v);
}

export function ChangeList({ r }: { r: any }) {
  const keys = changedFields(r).filter((k) => k !== 'avatarPath');
  if (!keys.length) return <p className="text-xs text-slate-500">Profile photo updated</p>;
  return (
    <ul className="space-y-1 text-xs">
      {keys.map((k) => (
        <li key={k} className="flex flex-wrap items-baseline gap-1">
          <span className="font-semibold text-slate-600">{fieldLabel(k)}:</span>
          <span className="text-slate-400 line-through">{show(r.before?.[k])}</span>
          <span className="text-slate-400">→</span>
          <span className="font-medium text-slate-800">{show(r.after?.[k])}</span>
        </li>
      ))}
    </ul>
  );
}

const TONE: Record<string, { label: string; icon: any; dot: string; text: string }> = {
  PENDING: { label: 'Pending', icon: Clock, dot: 'bg-amber-500', text: 'text-amber-700' },
  APPROVED: { label: 'Approved', icon: Check, dot: 'bg-emerald-500', text: 'text-emerald-700' },
  DECLINED: { label: 'Rejected', icon: X, dot: 'bg-rose-500', text: 'text-rose-700' },
};

/** Approve / reject history, newest first. */
export function ApprovalTimeline({ rows, limit, dense }: { rows: any[]; limit?: number; dense?: boolean }) {
  const list = (limit ? rows.slice(0, limit) : rows).filter(Boolean);
  if (!list.length) return <p className="text-sm text-slate-500">No approvals yet.</p>;
  return (
    <ol className="relative ml-3 space-y-3 border-l-2 border-dashed border-slate-200 pl-5" data-testid="approval-timeline">
      {list.map((r) => {
        const t = TONE[r.status] || TONE.PENDING;
        const Icon = t.icon;
        const auto = r.reviewNote?.startsWith('Applied immediately');
        return (
          <li key={r.id} className="relative">
            <span className={clsx('absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white ring-4 ring-white', t.dot)}>
              <Icon size={11} strokeWidth={3} />
            </span>
            <div className="flex items-start gap-2">
              {!dense && <Avatar name={r.user?.fullName || 'User'} src={avatarUrl(r.user?.avatarPath)} size={28} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">
                  <b>{r.user?.fullName || 'A user'}</b>
                  <span className={clsx('ml-1.5 text-xs font-semibold', t.text)}>{auto ? 'Applied (approver)' : t.label}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {changedFields(r).map(fieldLabel).join(', ') || 'Profile'}
                  {r.reviewedBy?.fullName && !auto ? ` · by ${r.reviewedBy.fullName}` : ''}
                  {r.user?.organisation?.code ? ` · ${r.user.organisation.code}` : ''}
                </p>
                <p className="text-[11px] text-slate-400" title={fmtDate(r.reviewedAt || r.createdAt)}>{relTime(r.reviewedAt || r.createdAt)}</p>
                {r.reviewNote && !auto && <p className="mt-0.5 text-[11px] italic text-slate-500">“{r.reviewNote}”</p>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
