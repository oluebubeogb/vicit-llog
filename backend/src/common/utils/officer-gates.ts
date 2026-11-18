import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Gate-officer ↔ gate/checkpoint assignments used by the user screens
 * (agency Admin users page and the Super Admin agency workspace).
 *
 * A "gate" is the first stop (lowest sequence) of a location; every later
 * stop on the same location is a "checkpoint".
 */
export type OfficerAssignment = {
  gateId: string;
  name: string;
  code: string;
  sequence: number;
  locationId: string;
  locationName: string;
  kind: 'GATE' | 'CHECKPOINT';
  shared: boolean;
};

type Db = any; // PrismaService or a transaction client
type Audit = { log: (data: any) => Promise<any> };

const MAX_GATES = 200;

/** Two queries for any number of users. */
export async function assignmentsByUser(prisma: Db, userIds: string[]): Promise<Map<string, OfficerAssignment[]>> {
  const out = new Map<string, OfficerAssignment[]>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return out;
  const rows: any[] = await prisma.gateOfficerAssignment.findMany({
    where: { userId: { in: ids } },
    select: {
      userId: true,
      gate: { select: { id: true, name: true, code: true, sequence: true, locationId: true, location: { select: { name: true, isShared: true } } } },
    },
  });
  if (!rows.length) return out;
  const locIds = Array.from(new Set(rows.map((r) => r.gate.locationId)));
  const ordered: any[] = await prisma.gate.findMany({
    where: { locationId: { in: locIds } },
    select: { id: true, locationId: true },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
  });
  const firstByLoc = new Map<string, string>();
  for (const g of ordered) if (!firstByLoc.has(g.locationId)) firstByLoc.set(g.locationId, g.id);
  for (const r of rows) {
    const g = r.gate;
    const list = out.get(r.userId) || [];
    list.push({
      gateId: g.id,
      name: g.name,
      code: g.code,
      sequence: g.sequence,
      locationId: g.locationId,
      locationName: g.location?.name || '',
      kind: firstByLoc.get(g.locationId) === g.id ? 'GATE' : 'CHECKPOINT',
      shared: !!g.location?.isShared,
    });
    out.set(r.userId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.locationName.localeCompare(b.locationName) || a.sequence - b.sequence || a.name.localeCompare(b.name));
  return out;
}

/** Attach `gateAssignments` to each user (GATE users only; others get []). */
export async function withGateAssignments<T extends { id: string; role?: any }>(prisma: Db, users: T[]): Promise<Array<T & { gateAssignments: OfficerAssignment[] }>> {
  const map = await assignmentsByUser(prisma, users.filter((u) => u.role === Role.GATE).map((u) => u.id));
  return users.map((u) => ({ ...u, gateAssignments: map.get(u.id) || [] }));
}

/** Validate a list of gate ids against an agency's scope (own locations + shared locations). */
export async function validateGateIds(prisma: Db, orgId: string, gateIds: unknown): Promise<string[]> {
  if (gateIds === undefined || gateIds === null) return [];
  if (!Array.isArray(gateIds)) throw new BadRequestException('gateIds must be a list');
  const ids = Array.from(new Set(gateIds.map((x) => String(x ?? '').trim()).filter(Boolean)));
  if (ids.length > MAX_GATES) throw new BadRequestException('Too many gates selected');
  if (!ids.length) return [];
  const found: any[] = await prisma.gate.findMany({
    where: { id: { in: ids }, location: { OR: [{ organisationId: orgId }, { isShared: true }] } },
    select: { id: true },
  });
  if (found.length !== ids.length) throw new BadRequestException('One or more gates or checkpoints are not available to this agency');
  return ids;
}

/**
 * Make an officer's assignments exactly `gateIds` (already validated or not).
 * Adds and removes only the difference; past checkpoint records are never touched.
 * Each change is audited with the same actions as the Locations page.
 */
export async function syncOfficerGates(
  prisma: Db,
  audit: Audit,
  opts: { orgId: string; userId: string; gateIds: unknown; actorId?: string; via: string },
): Promise<{ added: string[]; removed: string[] }> {
  const officer = await prisma.user.findUnique({ where: { id: opts.userId }, select: { id: true, fullName: true, role: true, organisationId: true } });
  if (!officer || officer.organisationId !== opts.orgId) throw new NotFoundException('User not found in this agency');
  const ids = await validateGateIds(prisma, opts.orgId, opts.gateIds);
  if (ids.length && officer.role !== Role.GATE) throw new BadRequestException('Only gate officers can be assigned to gates or checkpoints');
  const current: any[] = await prisma.gateOfficerAssignment.findMany({
    where: { userId: officer.id },
    select: { id: true, gateId: true, gate: { select: { name: true } } },
  });
  const have = new Set(current.map((a) => a.gateId));
  const toAdd = ids.filter((id) => !have.has(id));
  const toRemove = current.filter((a) => !ids.includes(a.gateId));
  if (!toAdd.length && !toRemove.length) return { added: [], removed: [] };
  const names = new Map<string, string>();
  if (toAdd.length) {
    const gates: any[] = await prisma.gate.findMany({ where: { id: { in: toAdd } }, select: { id: true, name: true } });
    for (const g of gates) names.set(g.id, g.name);
  }
  await prisma.$transaction([
    ...(toAdd.length ? [prisma.gateOfficerAssignment.createMany({ data: toAdd.map((gateId) => ({ gateId, userId: officer.id })), skipDuplicates: true })] : []),
    ...(toRemove.length ? [prisma.gateOfficerAssignment.deleteMany({ where: { id: { in: toRemove.map((a) => a.id) } } })] : []),
  ]);
  for (const gateId of toAdd) {
    await audit.log({ action: 'GATE_OFFICER_ASSIGNED', entity: 'Gate', entityId: gateId, userId: opts.actorId, details: { organisationId: opts.orgId, officerId: officer.id, officerName: officer.fullName, gateName: names.get(gateId), via: opts.via } });
  }
  for (const a of toRemove) {
    await audit.log({ action: 'GATE_OFFICER_UNASSIGNED', entity: 'Gate', entityId: a.gateId, userId: opts.actorId, details: { organisationId: opts.orgId, officerId: officer.id, officerName: officer.fullName, gateName: a.gate?.name, via: opts.via } });
  }
  return { added: toAdd, removed: toRemove.map((a) => a.gateId) };
}
