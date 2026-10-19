import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async listLocations(orgId: string) {
    return this.prisma.location.findMany({
      where: { organisationId: orgId },
      include: { gates: true },
      orderBy: { name: 'asc' },
    });
  }

  async createLocation(orgId: string, data: { name: string; code: string; address?: string }) {
    try {
      return await this.prisma.location.create({
        data: { ...data, organisationId: orgId },
        include: { gates: true },
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
      return await this.prisma.gate.create({
        data: { ...data, locationId },
      });
    } catch {
      throw new ConflictException('Gate code already exists at this location');
    }
  }

  async listGates(orgId: string) {
    return this.prisma.gate.findMany({
      where: { location: { organisationId: orgId } },
      include: { location: { select: { name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }
}
