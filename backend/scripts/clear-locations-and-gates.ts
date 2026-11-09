/**
 * ONE-TIME / DESTRUCTIVE: delete ALL locations and their gates.
 *
 * Keeps officers/users (and organisations) intact.
 * Also clears:
 *   - GateOfficerAssignment rows
 *   - GateVisit rows (GateParticular cascades from GateVisit; GateVisit.gateId is ON DELETE RESTRICT)
 *   - Invite.locationId and Visitor.gateId soft references (no FK, nulled for coherence)
 *   - RingCall.gateId soft references (no FK to Gate; nulled for coherence)
 *
 * SAFETY: refuses to run unless CLEAR_LOCATIONS=YES is set in the environment.
 *
 * Run from the backend folder (with DATABASE_URL set, same as the API):
 *
 *   CLEAR_LOCATIONS=YES npx ts-node --transpile-only scripts/clear-locations-and-gates.ts
 *
 * Or via npm:
 *
 *   CLEAR_LOCATIONS=YES npm run clear:locations
 *
 * Do NOT run this against a production database unless you intentionally want a blank locations tree.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.CLEAR_LOCATIONS !== 'YES') {
    console.error(
      'Refusing to run. Re-run with CLEAR_LOCATIONS=YES if you really want to delete ALL locations and gates.',
    );
    process.exit(1);
  }

  const [locationCount, gateCount, assignmentCount, visitCount] = await Promise.all([
    prisma.location.count(),
    prisma.gate.count(),
    prisma.gateOfficerAssignment.count(),
    prisma.gateVisit.count(),
  ]);

  console.log(
    `About to clear: ${locationCount} location(s), ${gateCount} gate(s), ` +
      `${assignmentCount} assignment(s), ${visitCount} gate-visit(s). Officers/users will NOT be deleted.`,
  );

  const result = await prisma.$transaction(async (tx) => {
    // Must delete GateVisits before Gates (ON DELETE RESTRICT). Particulars cascade from visits.
    const visits = await tx.gateVisit.deleteMany({});
    const assignments = await tx.gateOfficerAssignment.deleteMany({});
    const gates = await tx.gate.deleteMany({});
    const locations = await tx.location.deleteMany({});

    const invites = await tx.invite.updateMany({
      where: { locationId: { not: null } },
      data: { locationId: null },
    });
    const visitors = await tx.visitor.updateMany({
      where: { gateId: { not: null } },
      data: { gateId: null },
    });
    const rings = await tx.ringCall.updateMany({
      where: { gateId: { not: null } },
      data: { gateId: null },
    });

    return { visits, assignments, gates, locations, invites, visitors, rings };
  });

  console.log('Done.');
  console.log(`  GateVisit deleted:         ${result.visits.count}`);
  console.log(`  Assignments deleted:       ${result.assignments.count}`);
  console.log(`  Gates deleted:             ${result.gates.count}`);
  console.log(`  Locations deleted:         ${result.locations.count}`);
  console.log(`  Invite.locationId cleared: ${result.invites.count}`);
  console.log(`  Visitor.gateId cleared:    ${result.visitors.count}`);
  console.log(`  RingCall.gateId cleared:   ${result.rings.count}`);
}

main()
  .catch((err) => {
    console.error('Clear failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
