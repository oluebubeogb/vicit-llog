import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Agency admin → own agency (any ?orgId is ignored). Super Admin → the agency picked with ?orgId. */
  async scopeOrg(actor: any, orgId?: string): Promise<string> {
    if (actor?.role === 'SUPER_ADMIN') {
      const id = String(orgId || '').trim();
      if (!id) throw new BadRequestException('Choose an agency first');
      const org = await this.prisma.organisation.findUnique({ where: { id }, select: { id: true } });
      if (!org) throw new NotFoundException('Agency not found');
      return id;
    }
    if (!actor?.orgId) throw new ForbiddenException('No agency on this account');
    return actor.orgId;
  }

  /** Gate officers of this agency plus every Super Gate Officer (assignable anywhere). */
  async officers(orgId: string) {
    return this.prisma.user.findMany({
      where: { isActive: true, OR: [{ role: 'GATE', organisationId: orgId }, { role: 'GLOBAL_GATE' }] },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /** v25: edit an existing location of this agency. */
  async updateLocation(locationId: string, orgId: string, data: { name?: string; code?: string; address?: string | null }, actor?: any) {
    const loc = await this.prisma.location.findFirst({ where: { id: locationId, OR: [{ organisationId: orgId }, { isShared: true }] } });
    if (!loc) throw new NotFoundException('Location not found');
    if (loc.organisationId !== orgId) throw new ForbiddenException('Shared locations are managed by the owning agency');
    const patch: any = {};
    if (data.name !== undefined) { const n = String(data.name || '').trim(); if (!n) throw new BadRequestException('Location name is required'); patch.name = n.slice(0, 120); }
    if (data.code !== undefined) { const c = String(data.code || '').trim().toUpperCase(); if (!c) throw new BadRequestException('Location code is required'); patch.code = c.slice(0, 30); }
    if (data.address !== undefined) patch.address = String(data.address || '').trim() || null;
    let updated;
    try {
      updated = await this.prisma.location.update({ where: { id: locationId }, data: patch });
    } catch {
      throw new ConflictException('Location code already exists');
    }
    await this.audit.log({ action: 'LOCATION_UPDATED', entity: 'Location', entityId: locationId, userId: actor?.id, details: { organisationId: orgId, before: { name: loc.name, code: loc.code, address: loc.address }, after: patch } });
    return updated;
  }

  async listLocations(orgId: string) {
    return this.prisma.location.findMany({
      where: { OR: [{ organisationId: orgId }, { isShared: true }] },
      include: { organisation: { select: { id: true, name: true, code: true } }, gates: { include: { assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true, organisationId: true } } } } }, orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createLocation(orgId: string, data: { name: string; code: string; address?: string }) {
    try {
      return await this.prisma.location.create({
        data: { ...data, organisationId: orgId },
        include: { gates: { include: { assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true, organisationId: true } } } } }, orderBy: { sequence: 'asc' } } },
      });
    } catch {
      throw new ConflictException('Location code already exists');
    }
  }

  async createGate(locationId: string, orgId: string, data: { name: string; code: string; officerId?: string; admissionsEnabled?: boolean; particularsCheckEnabled?: boolean; dailyAdmissionLimit?: number | null }) {
    const loc = await this.prisma.location.findFirst({
      where: { id: locationId, OR: [{ organisationId: orgId }, { isShared: true }] },
    });
    if (!loc) throw new NotFoundException('Location not found');
    if (loc.organisationId !== orgId) throw new ForbiddenException('Shared location gates are managed by the owning agency');
    const org = await this.prisma.organisation.findUnique({ where: { id: orgId }, select: { maxGates: true } });
    const gateCount = await this.prisma.gate.count({ where: { location: { organisationId: orgId } } });
    if (gateCount >= (org?.maxGates ?? 10)) throw new BadRequestException(`This agency has reached its gate limit (${org?.maxGates ?? 10}). Increase the limit in Locations & gates settings.`);
    if (data.officerId) { const officer = await this.prisma.user.findFirst({ where: { id: data.officerId, organisationId: orgId, role: 'GATE', isActive: true } }); if (!officer) throw new NotFoundException('Active gate officer not found in this agency'); }
    const dailyAdmissionLimit = data.dailyAdmissionLimit === null || data.dailyAdmissionLimit === undefined || data.dailyAdmissionLimit === ('' as any) ? null : Number(data.dailyAdmissionLimit);
    if (dailyAdmissionLimit !== null && (!Number.isInteger(dailyAdmissionLimit) || dailyAdmissionLimit < 1)) throw new BadRequestException('Daily admission limit must be a positive whole number');
    try {
      const last = await this.prisma.gate.aggregate({ where: { locationId }, _max: { sequence: true } });
      return await this.prisma.$transaction(async tx => {
        const gate = await tx.gate.create({ data: { name: data.name, code: data.code, locationId, sequence: (last._max.sequence ?? -1) + 1, admissionsEnabled: data.admissionsEnabled ?? true, particularsCheckEnabled: data.particularsCheckEnabled ?? true, dailyAdmissionLimit } });
        if (data.officerId) await tx.gateOfficerAssignment.create({ data: { gateId: gate.id, userId: data.officerId } });
        return gate;
      });
    } catch {
      throw new ConflictException('Gate code already exists at this location');
    }
  }

  async assignOfficer(gateId: string, orgId: string, userId: string, actor?: any) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } } });
    if (!gate) throw new NotFoundException('Gate not found');
    const officer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!officer || !['GATE', 'GLOBAL_GATE'].includes(officer.role)) throw new NotFoundException('Gate officer not found');
    if (officer.role === 'GATE' && officer.organisationId !== orgId) throw new NotFoundException('Gate officer not found in this agency');
    const a = await this.prisma.gateOfficerAssignment.upsert({ where: { gateId_userId: { gateId, userId } }, update: {}, create: { gateId, userId } });
    await this.audit.log({ action: 'GATE_OFFICER_ASSIGNED', entity: 'Gate', entityId: gateId, userId: actor?.id, details: { organisationId: orgId, officerId: userId, officerName: officer.fullName, gateName: gate.name } });
    return a;
  }

  /** Removes only the assignment; past checkpoint records (GateVisit) are untouched. */
  async unassignOfficer(gateId: string, orgId: string, userId: string, actor?: any) {
    const gate = await this.prisma.gate.findFirst({
      where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } },
      include: { location: { select: { organisationId: true } } },
    });
    if (!gate) throw new NotFoundException('Gate not found');
    const assignment = await this.prisma.gateOfficerAssignment.findUnique({ where: { gateId_userId: { gateId, userId } } });
    if (!assignment) throw new NotFoundException('Officer is not assigned to this gate');
    const officer = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, role: true, organisationId: true } });
    // The owning agency manages everyone on its gates. On another agency's shared site,
    // an agency may only take its OWN gate officers off (matches the user edit screen).
    const ownsSite = gate.location.organisationId === orgId;
    const ownOfficer = officer?.role === 'GATE' && officer.organisationId === orgId;
    if (!ownsSite && !ownOfficer) throw new ForbiddenException('On a shared site you can only remove your own agency’s gate officers');
    await this.prisma.gateOfficerAssignment.delete({ where: { id: assignment.id } });
    await this.audit.log({ action: 'GATE_OFFICER_UNASSIGNED', entity: 'Gate', entityId: gateId, userId: actor?.id, details: { organisationId: orgId, officerId: userId, officerName: officer?.fullName, gateName: gate.name, sharedSite: !ownsSite } });
    return { ok: true };
  }

  async reorderGate(gateId: string, orgId: string, sequence: number) {
    if (!Number.isInteger(sequence) || sequence < 0) throw new ConflictException('Gate order must be zero or greater');
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } }, include: { location: { select: { organisationId: true } } } });
    if (!gate) throw new NotFoundException('Gate not found');
    if (gate.location.organisationId !== orgId) throw new ForbiddenException('Shared location gates are managed by the owning agency');
    return this.prisma.$transaction(async tx => {
      const displaced = await tx.gate.findFirst({ where: { locationId: gate.locationId, sequence, id: { not: gateId } } });
      if (displaced) await tx.gate.update({ where: { id: displaced.id }, data: { sequence: gate.sequence } });
      return tx.gate.update({ where: { id: gateId }, data: { sequence } });
    });
  }

  async settings(orgId: string) {
    return this.prisma.organisation.findUnique({ where: { id: orgId }, select: { maxGates: true } });
  }

  async updateSettings(orgId: string, maxGates: number) {
    if (!Number.isInteger(maxGates) || maxGates < 1 || maxGates > 500) throw new BadRequestException('Maximum gates must be between 1 and 500');
    const current = await this.prisma.gate.count({ where: { location: { organisationId: orgId } } });
    if (maxGates < current) throw new BadRequestException(`There are already ${current} gates. The limit cannot be lower than the current count.`);
    return this.prisma.organisation.update({ where: { id: orgId }, data: { maxGates }, select: { maxGates: true } });
  }

  async updateGate(gateId: string, orgId: string, data: any, actor?: any) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } }, include: { location: { select: { organisationId: true } } } });
    if (!gate) throw new NotFoundException('Gate not found');
    if (gate.location.organisationId !== orgId) throw new ForbiddenException('Shared location gates are managed by the owning agency');
    const dailyAdmissionLimit = data.dailyAdmissionLimit === undefined ? gate.dailyAdmissionLimit : data.dailyAdmissionLimit === '' || data.dailyAdmissionLimit === null ? null : Number(data.dailyAdmissionLimit);
    if (dailyAdmissionLimit !== null && (!Number.isInteger(dailyAdmissionLimit) || dailyAdmissionLimit < 1)) throw new BadRequestException('Daily admission limit must be a positive whole number');
    const patch: any = {
      admissionsEnabled: data.admissionsEnabled === undefined ? gate.admissionsEnabled : !!data.admissionsEnabled,
      particularsCheckEnabled: data.particularsCheckEnabled === undefined ? gate.particularsCheckEnabled : !!data.particularsCheckEnabled,
      dailyAdmissionLimit,
    };
    if (data.name !== undefined) { const n = String(data.name || '').trim(); if (!n) throw new BadRequestException('Gate name is required'); patch.name = n.slice(0, 120); }
    if (data.code !== undefined) { const c = String(data.code || '').trim(); if (!c) throw new BadRequestException('Gate code is required'); patch.code = c.slice(0, 30); }
    let updated;
    try {
      updated = await this.prisma.gate.update({ where: { id: gateId }, data: patch });
    } catch {
      throw new ConflictException('Gate code already exists at this location');
    }
    await this.audit.log({
      action: 'GATE_UPDATED', entity: 'Gate', entityId: gateId, userId: actor?.id,
      details: { organisationId: orgId, before: { name: gate.name, code: gate.code, admissionsEnabled: gate.admissionsEnabled, particularsCheckEnabled: gate.particularsCheckEnabled, dailyAdmissionLimit: gate.dailyAdmissionLimit }, after: patch },
    });
    return updated;
  }

  async listGates(orgId: string) {
    return this.prisma.gate.findMany({
      where: { location: { OR: [{ organisationId: orgId }, { isShared: true }] } },
      include: { location: { select: { name: true, code: true, organisationId: true } }, assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true, organisationId: true } } } } },
      orderBy: [{ locationId: 'asc' }, { sequence: 'asc' }],
    });
  }
}
