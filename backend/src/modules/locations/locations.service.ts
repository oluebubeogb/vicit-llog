import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async listLocations(orgId: string) {
    return this.prisma.location.findMany({
      where: { organisationId: orgId },
      include: { gates: { include: { assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } }, orderBy: { sequence: 'asc' } } },
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

  async createGate(locationId: string, orgId: string, data: { name: string; code: string }) {
    const loc = await this.prisma.location.findFirst({
      where: { id: locationId, organisationId: orgId },
    });
    if (!loc) throw new NotFoundException('Location not found');
    try {
      const last = await this.prisma.gate.aggregate({ where: { locationId }, _max: { sequence: true } });
      return await this.prisma.gate.create({
        data: { ...data, locationId, sequence: (last._max.sequence ?? -1) + 1 },
      });
    } catch {
      throw new ConflictException('Gate code already exists at this location');
    }
  }

  async assignOfficer(gateId: string, orgId: string, userId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { organisationId: orgId } } });
    if (!gate) throw new NotFoundException('Gate not found');
    const officer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!officer || !['GATE', 'GLOBAL_GATE'].includes(officer.role)) throw new NotFoundException('Gate officer not found');
    if (officer.role === 'GATE' && officer.organisationId !== orgId) throw new NotFoundException('Gate officer not found in this agency');
    return this.prisma.gateOfficerAssignment.upsert({ where: { gateId_userId: { gateId, userId } }, update: {}, create: { gateId, userId } });
  }

  async reorderGate(gateId: string, orgId: string, sequence: number) {
    if (!Number.isInteger(sequence) || sequence < 0) throw new ConflictException('Gate order must be zero or greater');
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, location: { organisationId: orgId } } });
    if (!gate) throw new NotFoundException('Gate not found');
    return this.prisma.$transaction(async tx => {
      const displaced = await tx.gate.findFirst({ where: { locationId: gate.locationId, sequence, id: { not: gateId } } });
      if (displaced) await tx.gate.update({ where: { id: displaced.id }, data: { sequence: gate.sequence } });
      return tx.gate.update({ where: { id: gateId }, data: { sequence } });
    });
  }

  async listGates(orgId: string) {
    return this.prisma.gate.findMany({
      where: { location: { organisationId: orgId } },
      include: { location: { select: { name: true, code: true, organisationId: true } }, assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } },
      orderBy: [{ locationId: 'asc' }, { sequence: 'asc' }],
    });
  }
}
