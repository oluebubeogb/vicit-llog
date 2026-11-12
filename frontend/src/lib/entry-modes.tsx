'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Bike, Car, Footprints } from 'lucide-react';
import { api } from '@/lib/api';

export const ALL_MODES: { v: string; l: string; icon: ReactNode }[] = [
  { v: 'PEDESTRIAN', l: 'On foot', icon: <Footprints size={16} /> },
  { v: 'MOTORCYCLE', l: 'Motorcycle', icon: <Bike size={16} /> },
  { v: 'VEHICLE', l: 'Vehicle', icon: <Car size={16} /> },
];

export const isVehicleMode = (m?: string | null) => m === 'VEHICLE' || m === 'MOTORCYCLE';

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

/** Modes of entry the Super Admin allows (Branding → Modes of entry). All three on by default. */
export function useEntryModes(seed?: string[] | null) {
  const [modes, setModes] = useState<string[]>(seed?.length ? seed : cache || ALL_MODES.map((m) => m.v));
  useEffect(() => {
    if (seed?.length) {
      cache = seed;
      setModes(seed);
      return;
    }
    if (cache) return;
    inflight =
      inflight ||
      api
        .branding()
        .then((b: any) => (Array.isArray(b?.allowedEntryModes) && b.allowedEntryModes.length ? b.allowedEntryModes : ALL_MODES.map((m) => m.v)))
        .catch(() => ALL_MODES.map((m) => m.v));
    inflight.then((m) => {
      cache = m;
      setModes(m);
    });
  }, [seed?.join(',')]);
  return ALL_MODES.filter((m) => modes.includes(m.v));
}

export function resetEntryModesCache() {
  cache = null;
  inflight = null;
}
