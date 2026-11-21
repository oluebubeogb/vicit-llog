/**
 * v31 per-guest checkpoint routing. Pure (no imports) so it can be unit-tested with plain Node.
 *
 * Every guest moves through the gates on their own: the next gate is worked out from THAT guest's
 * checkpoint history only, never from their companions'. Mirrors the server rules in
 * GateService.recordCheckpoint:
 *  - entry: every lower-sequence gate at the site must be passed first (ENTRY / PASSED);
 *  - exit (after arrival): gates are walked in reverse, highest sequence first (EXIT / PASSED).
 */

export type RouteGate = { id: string; name: string; sequence: number; locationId?: string | null; location?: { id?: string; name?: string } | null };
export type GuestEvent = { gateId?: string; gate?: { id?: string; name?: string; sequence?: number; locationId?: string | null } | null; decision?: string; direction?: string | null; occurredAt?: string };
export type Guest = { id: string; fullName?: string; status?: string; gateVisits?: GuestEvent[] };

export type GuestStep = {
  /** ENTRY before arrival, EXIT after arrival, null when nothing is left to do here. */
  direction: 'ENTRY' | 'EXIT' | null;
  /** The gate the guest must pass next (first of `due` when the site is not known yet). */
  next: RouteGate | null;
  /** Every gate the guest may be passed at right now (one per site before the first gate). */
  due: RouteGate[];
  /** The guest's site once they have passed any gate. */
  siteId: string | null;
};

const gid = (e: GuestEvent) => e.gateId || e.gate?.id || '';
const loc = (g: RouteGate) => g.locationId || g.location?.id || '';

function latest(events: GuestEvent[], gateId: string, dir: 'ENTRY' | 'EXIT') {
  let found: GuestEvent | undefined;
  for (const e of events) if (gid(e) === gateId && (e.direction || 'ENTRY') === dir) found = e; // events arrive oldest first
  return found;
}

export function guestSiteId(guest: Guest, route: RouteGate[]): string | null {
  for (const e of guest.gateVisits || []) {
    if (e.decision !== 'PASSED') continue;
    const g = route.find((r) => r.id === gid(e));
    const l = (g && loc(g)) || e.gate?.locationId || '';
    if (l) return l;
  }
  return null;
}

export function guestStep(guest: Guest, route: RouteGate[]): GuestStep {
  const events = guest.gateVisits || [];
  const siteId = guestSiteId(guest, route);
  const status = guest.status || 'INVITED';
  const none: GuestStep = { direction: null, next: null, due: [], siteId };
  if (!route.length) return none;
  const bySite = new Map<string, RouteGate[]>();
  for (const g of route) {
    const k = loc(g);
    bySite.set(k, [...(bySite.get(k) || []), g]);
  }
  bySite.forEach((list) => list.sort((a, b) => a.sequence - b.sequence));
  if (status === 'INVITED') {
    const passed = (g: RouteGate) => latest(events, g.id, 'ENTRY')?.decision === 'PASSED';
    const sites = siteId && bySite.has(siteId) ? [siteId] : Array.from(bySite.keys());
    const due: RouteGate[] = [];
    for (const s of sites) {
      const next = (bySite.get(s) || []).find((g) => !passed(g));
      if (next) due.push(next);
    }
    return { direction: 'ENTRY', next: due[0] || null, due, siteId };
  }
  if (status === 'ARRIVED') {
    const site = siteId && bySite.has(siteId) ? siteId : Array.from(bySite.keys())[0];
    const list = [...(bySite.get(site) || [])].reverse();
    const next = list.find((g) => latest(events, g.id, 'EXIT')?.decision !== 'PASSED') || null;
    return { direction: 'EXIT', next, due: next ? [next] : [], siteId: site || null };
  }
  return none;
}

/** True when the guest can be processed at `gateId` right now. */
export function isDueAt(guest: Guest, route: RouteGate[], gateId?: string | null) {
  if (!gateId) return false;
  return guestStep(guest, route).due.some((g) => g.id === gateId);
}

/** Gates to draw in the guest's own tracker: their site once known, else the whole route. */
export function guestTrackerGates(guest: Guest, route: RouteGate[]) {
  const site = guestSiteId(guest, route);
  return site ? route.filter((g) => loc(g) === site) : route;
}

/** One short phrase per guest, used for the group header, e.g. "at Block B Desk". */
export function guestProgressLabel(guest: Guest, route: RouteGate[]): string {
  const status = guest.status || 'INVITED';
  if (status === 'DENIED') return 'denied';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'EXITED') return 'left';
  const step = guestStep(guest, route);
  if (status === 'ARRIVED') {
    const started = (guest.gateVisits || []).some((e) => (e.direction || 'ENTRY') === 'EXIT' && e.decision === 'PASSED');
    return started && step.next ? `exiting at ${step.next.name}` : 'inside';
  }
  if (!step.next) return 'not yet at a gate';
  const any = (guest.gateVisits || []).some((e) => e.decision === 'PASSED');
  return any ? `at ${step.next.name}` : `not yet at ${step.next.name}`;
}

/** "2 at Block B Desk · 1 not yet at Main Gate" */
export function groupProgress(guests: Guest[], route: RouteGate[]): string {
  const counts = new Map<string, number>();
  for (const g of guests) {
    const l = guestProgressLabel(g, route);
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  // Largest group first; ties keep guest order.
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${n} ${l}`).join(' · ');
}
