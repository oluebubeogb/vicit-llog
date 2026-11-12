'use client';

import { Hash, Palette } from 'lucide-react';

/** Two compact fields for vehicles and motorcycles: plate number + colour/brand. */
export default function VehicleFields({
  mode,
  plate,
  details,
  onPlate,
  onDetails,
  compact,
}: {
  mode: string;
  plate: string;
  details: string;
  onPlate: (v: string) => void;
  onDetails: (v: string) => void;
  compact?: boolean;
}) {
  const noun = mode === 'MOTORCYCLE' ? 'Motorcycle' : 'Vehicle';
  return (
    <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${compact ? '' : 'rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50/50 to-white p-3'}`} data-testid="vehicle-fields">
      <label className="block">
        <span className="label !mb-1 text-xs">{noun} plate number</span>
        <span className="relative block">
          <Hash size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={plate}
            onChange={(e) => onPlate(e.target.value.toUpperCase())}
            placeholder="e.g. ABJ 123 XY"
            maxLength={20}
            autoCapitalize="characters"
            className="input !py-2.5 pl-9 font-mono text-sm tracking-wider"
          />
        </span>
      </label>
      <label className="block">
        <span className="label !mb-1 text-xs">Additional details</span>
        <span className="relative block">
          <Palette size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={details}
            onChange={(e) => onDetails(e.target.value)}
            placeholder="Colour, brand — e.g. Black Toyota Camry"
            maxLength={120}
            className="input !py-2.5 pl-9 text-sm"
          />
        </span>
      </label>
    </div>
  );
}

/** Read-only plate + details line. */
export function VehicleLine({ plate, details }: { plate?: string | null; details?: string | null }) {
  if (!plate && !details) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {plate && <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-white">{plate}</span>}
      {details && <span className="text-slate-600">{details}</span>}
    </span>
  );
}
