export const ALL_ENTRY_MODES = ['PEDESTRIAN', 'MOTORCYCLE', 'VEHICLE'] as const;

export function normaliseModes(input: any): string[] {
  const arr = Array.isArray(input) ? input : [];
  const out = ALL_ENTRY_MODES.filter((m) => arr.map((x: any) => String(x).toUpperCase()).includes(m));
  return out.length ? [...out] : [...ALL_ENTRY_MODES];
}

/** Modes of entry the Super Admin allows (Branding → Platform → Modes of entry). All on by default. */
export async function allowedEntryModes(prisma: any): Promise<string[]> {
  try {
    const s = await prisma.platformSettings.findUnique({ where: { id: 'platform' }, select: { allowedEntryModes: true } });
    return normaliseModes(s?.allowedEntryModes);
  } catch {
    return [...ALL_ENTRY_MODES];
  }
}

export function vehicleMode(mode?: string | null) {
  return mode === 'VEHICLE' || mode === 'MOTORCYCLE';
}

export function cleanPlate(v: any) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 20);
  return s || null;
}

export function cleanVehicleDetails(v: any) {
  const s = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return s || null;
}
