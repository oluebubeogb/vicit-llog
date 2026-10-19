import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as fs from 'fs';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async check() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const photoPath = process.env.PHOTO_STORAGE_PATH || '/data/photos';
    let photoDirOk = false;
    let photoCount = 0;
    try {
      if (!fs.existsSync(photoPath)) fs.mkdirSync(photoPath, { recursive: true });
      photoDirOk = true;
      photoCount = fs.readdirSync(photoPath).filter((f) => !f.startsWith('.')).length;
    } catch {
      photoDirOk = false;
    }

    return {
      status: dbOk && photoDirOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'up' : 'down',
        photoStorage: photoDirOk ? 'up' : 'down',
        photoCount,
      },
      version: '2.0.0-phase2',
    };
  }

  async cleanupOldPhotos(orgId: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });
    const days = org?.photoRetentionDays ?? parseInt(process.env.PHOTO_RETENTION_DAYS || '90', 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const old = await this.prisma.visitor.findMany({
      where: {
        invite: { organisationId: orgId },
        photoPath: { not: null },
        createdAt: { lt: cutoff },
        status: 'EXITED',
      },
      select: { id: true, photoPath: true },
      take: 500,
    });

    const photoDir = process.env.PHOTO_STORAGE_PATH || '/data/photos';
    let deleted = 0;
    for (const v of old) {
      if (v.photoPath) {
        const fp = `${photoDir}/${v.photoPath}`;
        try {
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
            deleted++;
          }
          await this.prisma.visitor.update({
            where: { id: v.id },
            data: { photoPath: null },
          });
        } catch {
          // skip
        }
      }
    }
    return { scanned: old.length, deleted, retentionDays: days };
  }
}
