'use client';

import clsx from 'clsx';
import { Check, Package, X } from 'lucide-react';

type Particular = { kind?: string; resolvedAt?: string | null; returnedAt?: string | null };
type Visit = {
  gateId?: string;
  gate?: { id?: string; name?: string; sequence?: number };
  decision?: string;
  direction?: string;
  particulars?: Particular[];
};

export default function CheckpointTracker({
  gates,
  visits = [],
  direction = 'both',
  className,
  activeGateId,
}: {
  gates: Array<{ id: string; name: string; sequence?: number }>;
  visits?: Visit[];
  direction?: 'ENTRY' | 'EXIT' | 'both';
  className?: string;
  activeGateId?: string;
}) {
  if (!gates?.length) return null;
  const ordered = [...gates].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const exitOrder = [...ordered].reverse();

  function holding(gateId: string) {
    return visits.some((v) =>
      (v.gateId || v.gate?.id) === gateId
      && (v.particulars || []).some((p) => p.kind === 'WITHHELD' && !p.resolvedAt && !p.returnedAt),
    );
  }

  const heldNames = ordered.filter((g) => holding(g.id)).map((g) => g.name);

  function state(gateId: string, dir: 'ENTRY' | 'EXIT') {
    const ev = [...visits].reverse().find((v) => (v.gateId || v.gate?.id) === gateId && (v.direction || 'ENTRY') === dir);
    if (!ev) return 'pending';
    if (ev.decision === 'PASSED') return 'passed';
    if (ev.decision === 'DENIED') return 'denied';
    return 'pending';
  }

  function Row({ dir, label, items }: { dir: 'ENTRY' | 'EXIT'; label: string; items: typeof ordered }) {
    return (
      <div className="min-w-0">
        {direction === 'both' && <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>}
        <ol className="flex items-center gap-0 overflow-x-auto pb-1">
          {items.map((g, i) => {
            const st = state(g.id, dir);
            const held = holding(g.id);
            return (
              <li key={dir + g.id} className="flex min-w-0 flex-1 items-center">
                <div className="flex min-w-0 flex-col items-center text-center">
                  <span
                    className={clsx(
                      'relative flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm ring-2',
                      activeGateId === g.id ? 'ring-brand-400' : 'ring-white',
                      st === 'passed' && 'bg-emerald-500',
                      st === 'denied' && 'bg-rose-500',
                      st === 'pending' && 'bg-slate-200 text-slate-500',
                    )}
                    aria-label={`${g.name} ${st}${held ? ', items held' : ''}`}
                  >
                    {st === 'passed' ? <Check size={15} strokeWidth={3} /> : st === 'denied' ? <X size={15} strokeWidth={3} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                    {held && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-white" title={`Items held at ${g.name}`}>
                        <Package size={9} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className={clsx('mt-1 max-w-[4.5rem] truncate text-[10px] font-semibold', held ? 'text-amber-800' : 'text-slate-600')}>{g.name}</span>
                </div>
                {i < items.length - 1 && (
                  <span className={clsx('mx-1 h-0.5 min-w-[1.25rem] flex-1 rounded-full', st === 'passed' ? 'bg-emerald-400' : st === 'denied' ? 'bg-rose-300' : 'bg-slate-200')} />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className={clsx('rounded-2xl border border-slate-100 bg-white/80 p-3', className)}>
      {(direction === 'ENTRY' || direction === 'both') && <Row dir="ENTRY" label="Entry" items={ordered} />}
      {direction === 'both' && <div className="my-3 h-px bg-slate-100" />}
      {(direction === 'EXIT' || direction === 'both') && <Row dir="EXIT" label="Exit" items={exitOrder} />}
      {heldNames.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
          Items held at {heldNames.join(', ')}. Return or seize them at that gate before the final exit.
        </p>
      )}
    </div>
  );
}
