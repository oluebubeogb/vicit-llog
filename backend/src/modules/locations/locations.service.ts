import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async listLocations(orgId: string) {
    return this.prisma.location.findMany({
      where: { OR: [{ organisationId: orgId }, { isShared: true }] },
      include: { organisation: { select: { id: true, name: true, code: true } }, gates: { include: { assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } }, orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createLocation(orgId: string, data: { name: string; code: string; address?: string }) {
    try {
      return await this.prisma.location.create({
        data: { ...data, organisationId: orgId },
        include: { gates: { include: { assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } }, orderBy: { sequence: 'asc' } } },
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

  async assignOfficer(gateId: string, orgId: string, userId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } } });
    if (!gate) throw new NotFoundException('Gate not found');
    const officer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!officer || !['GATE', 'GLOBAL_GATE'].includes(officer.role)) throw new NotFoundException('Gate officer not found');
    if (officer.role === 'GATE' && officer.organisationId !== orgId) throw new NotFoundException('Gate officer not found in this agency');
    return this.prisma.gateOfficerAssignment.upsert({ where: { gateId_userId: { gateId, userId } }, update: {}, create: { gateId, userId } });
  }

  async unassignOfficer(gateId: string, orgId: string, userId: string) {
    const gate = await this.prisma.gate.findFirst({
      where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } },
      include: { location: { select: { organisationId: true } } },
    });
    if (!gate) throw new NotFoundException('Gate not found');
    if (gate.location.organisationId !== orgId) throw new ForbiddenException('Shared location gates are managed by the owning agency');
    const assignment = await this.prisma.gateOfficerAssignment.findUnique({ where: { gateId_userId: { gateId, userId } } });
    if (!assignment) throw new NotFoundException('Officer is not assigned to this gate');
    await this.prisma.gateOfficerAssignment.delete({ where: { id: assignment.id } });
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

  async updateGate(gateId: string, orgId: string, data: any) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { OR: [{ organisationId: orgId }, { isShared: true }] } }, include: { location: { select: { organisationId: true } } } });
    if (!gate) throw new NotFoundException('Gate not found');
    if (gate.location.organisationId !== orgId) throw new ForbiddenException('Shared location gates are managed by the owning agency');
    const dailyAdmissionLimit = data.dailyAdmissionLimit === '' || data.dailyAdmissionLimit === null || data.dailyAdmissionLimit === undefined ? null : Number(data.dailyAdmissionLimit);
    if (dailyAdmissionLimit !== null && (!Number.isInteger(dailyAdmissionLimit) || dailyAdmissionLimit < 1)) throw new BadRequestException('Daily admission limit must be a positive whole number');
    return this.prisma.gate.update({ where: { id: gateId }, data: { admissionsEnabled: data.admissionsEnabled === undefined ? gate.admissionsEnabled : !!data.admissionsEnabled, particularsCheckEnabled: data.particularsCheckEnabled === undefined ? gate.particularsCheckEnabled : !!data.particularsCheckEnabled, dailyAdmissionLimit } });
  }

  async listGates(orgId: string) {
    return this.prisma.gate.findMany({
      where: { location: { OR: [{ organisationId: orgId }, { isShared: true }] } },
      include: { location: { select: { name: true, code: true, organisationId: true } }, assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } },
      orderBy: [{ locationId: 'asc' }, { sequence: 'asc' }],
    });
  }
}
