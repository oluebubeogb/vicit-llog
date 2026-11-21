// Unit test for v31 per-guest gate routing. Run: node scripts/guest-route.test.mjs (Node >= 22.6)
import assert from 'node:assert/strict';
import { guestStep, isDueAt, groupProgress, guestProgressLabel, guestTrackerGates } from '../src/lib/guestRoute.ts';

const g1 = { id: 'g1', name: 'Main Gate', sequence: 1, locationId: 'L1' };
const g2 = { id: 'g2', name: 'Block B Desk', sequence: 2, locationId: 'L1' };
const h1 = { id: 'h1', name: 'Annex Gate', sequence: 1, locationId: 'L2' };
const route = [g1, g2];
const pass = (gateId, direction = 'ENTRY') => ({ gateId, decision: 'PASSED', direction });
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// The user's case: A and B passed Main Gate, C arrives late.
const A = { id: 'A', fullName: 'Ada', status: 'INVITED', gateVisits: [pass('g1')] };
const B = { id: 'B', fullName: 'Bola', status: 'INVITED', gateVisits: [pass('g1')] };
const C = { id: 'C', fullName: 'Chidi', status: 'INVITED', gateVisits: [] };
eq(guestStep(C, route).next?.id, 'g1', 'late guest is due at Main Gate');
eq(guestStep(A, route).next?.id, 'g2', 'early guest is due at Block B');
ok(isDueAt(C, route, 'g1') && !isDueAt(C, route, 'g2'), 'C only at g1');
ok(!isDueAt(A, route, 'g1') && isDueAt(A, route, 'g2'), 'A only at g2');
ok(!isDueAt(A, route, ''), 'no station → never due');
eq(groupProgress([A, B, C], route), '2 at Block B Desk · 1 not yet at Main Gate');
eq(guestProgressLabel(C, route), 'not yet at Main Gate');

// Arrival + exit in reverse.
const D = { id: 'D', status: 'ARRIVED', gateVisits: [pass('g1'), pass('g2')] };
eq(guestStep(D, route).direction, 'EXIT');
eq(guestStep(D, route).next?.id, 'g2', 'exit starts at the inner gate');
eq(guestProgressLabel(D, route), 'inside');
const D2 = { ...D, gateVisits: [...D.gateVisits, pass('g2', 'EXIT')] };
eq(guestStep(D2, route).next?.id, 'g1', 'then the outer gate');
eq(guestProgressLabel(D2, route), 'exiting at Main Gate');
eq(guestStep({ id: 'E', status: 'EXITED' }, route).next, null);
eq(guestProgressLabel({ id: 'E', status: 'EXITED' }, route), 'left');
eq(guestProgressLabel({ id: 'X', status: 'DENIED' }, route), 'denied');

// Denied then re-processed: latest event wins (events oldest first).
const F = { id: 'F', status: 'INVITED', gateVisits: [{ gateId: 'g1', decision: 'DENIED', direction: 'ENTRY' }] };
eq(guestStep(F, route).next?.id, 'g1');

// Multi-site route: before any pass, the first gate of each site is due; after, only own site.
const multi = [g1, g2, h1];
const G = { id: 'G', status: 'INVITED', gateVisits: [] };
eq(guestStep(G, multi).due.map((g) => g.id).sort(), ['g1', 'h1']);
const H = { id: 'H', status: 'INVITED', gateVisits: [pass('h1')] };
eq(guestStep(H, multi).next, null, 'single-gate site has nothing more for entry');
eq(guestTrackerGates(H, multi).map((g) => g.id), ['h1']);
eq(guestTrackerGates(G, multi).length, 3);

console.log(JSON.stringify({ ok: true, assertions: n }));
