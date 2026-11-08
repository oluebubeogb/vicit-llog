import clsx from 'clsx';

type Tone = 'brand' | 'emerald' | 'amber' | 'rose' | 'slate' | 'violet' | 'sky';

const MAP: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'emerald' },
  USED: { label: 'Used', tone: 'brand' },
  EXPIRED: { label: 'Expired', tone: 'slate' },
  REVOKED: { label: 'Revoked', tone: 'rose' },
  PENDING: { label: 'Pending', tone: 'amber' },
  OFFLINE_PENDING: { label: 'Awaiting approval', tone: 'amber' },
  AWAITING_APPROVAL: { label: 'Awaiting approval', tone: 'amber' },
  INVITED: { label: 'Invited', tone: 'sky' },
  ARRIVED: { label: 'On site', tone: 'emerald' },
  EXITED: { label: 'Exited', tone: 'slate' },
  DENIED: { label: 'Declined', tone: 'rose' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
  ADMIN: { label: 'Admin', tone: 'violet' },
  STAFF: { label: 'Staff', tone: 'brand' },
  GATE: { label: 'Gate officer', tone: 'amber' },
  APPROVED: { label: 'Approved', tone: 'emerald' },
  DECLINED: { label: 'Declined', tone: 'rose' },
  OFFICIAL: { label: 'Official', tone: 'brand' },
  PERSONAL: { label: 'Personal', tone: 'violet' },
};

const TONE: Record<Tone, string> = {
  brand: 'border-brand-200/80 bg-gradient-to-r from-brand-50 to-brand-100/70 text-brand-700 [--dot:rgb(var(--brand-500))]',
  emerald: 'border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-emerald-100/70 text-emerald-700 [--dot:#10b981]',
  amber: 'border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-100/70 text-amber-800 [--dot:#f59e0b]',
  rose: 'border-rose-200/80 bg-gradient-to-r from-rose-50 to-rose-100/70 text-rose-700 [--dot:#f43f5e]',
  slate: 'border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 text-slate-600 [--dot:#94a3b8]',
  violet: 'border-violet-200/80 bg-gradient-to-r from-violet-50 to-violet-100/70 text-violet-700 [--dot:#8b5cf6]',
  sky: 'border-sky-200/80 bg-gradient-to-r from-sky-50 to-sky-100/70 text-sky-700 [--dot:#0ea5e9]',
};

export function statusMeta(status?: string | null) {
  const k = String(status || '').toUpperCase();
  return MAP[k] || { label: k ? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ') : '—', tone: 'slate' as Tone };
}

export default function StatusPill({
  status,
  label,
  tone,
  pulse,
  className,
}: {
  status?: string | null;
  label?: string;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  const m = statusMeta(status);
  const t = tone || m.tone;
  const live = pulse ?? String(status).toUpperCase() === 'ARRIVED';
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.7)]',
        TONE[t],
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--dot)] opacity-60" />}
        <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--dot)]" />
      </span>
      {label || m.label}
    </span>
  );
}
