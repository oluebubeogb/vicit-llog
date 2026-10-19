import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  async get(orgId: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        code: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        customDomain: true,
        requireApproval: true,
        defaultWorkflow: true,
        photoRetentionDays: true,
      },
    });
    if (!org) throw new NotFoundException('Organisation not found');
    return org;
  }

  async update(
    orgId: string,
    data: {
      name?: string;
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      customDomain?: string;
      requireApproval?: boolean;
      photoRetentionDays?: number;
    },
  ) {
    return this.prisma.organisation.update({
      where: { id: orgId },
      data,
      select: {
        id: true,
        name: true,
        code: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        customDomain: true,
        requireApproval: true,
        defaultWorkflow: true,
        photoRetentionDays: true,
      },
    });
  }
}
