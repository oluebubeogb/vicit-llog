import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const orgName = (process.env.ORGANIZATION || process.env.ORGANISATION || 'Demo Organisation').trim();
  const orgCode = (process.env.ORGANIZATION_CODE || 'DEMO').toUpperCase().trim().slice(0, 16);
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@vicit.local').toLowerCase().trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || 'Admin@12345').trim();
  const adminName = (process.env.ADMIN_NAME || 'System Administrator').trim();
  const adminPhone = (process.env.ADMIN_PHONE || '').trim() || null;

  // Always reset bootstrap admin password from env when ADMIN_PASSWORD is set
  // (Coolify deploys often change env; operators expect login to match env UI)
  const syncPassword = Boolean(process.env.ADMIN_PASSWORD);

  console.log(`Seeding org="${orgName}" code=${orgCode} admin=${adminEmail} syncPassword=${syncPassword}`);

  const org = await prisma.organisation.upsert({
    where: { code: orgCode },
    update: { name: orgName },
    create: {
      name: orgName,
      code: orgCode,
    },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        fullName: adminName,
        organisationId: org.id,
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: false,
        ...(adminPhone ? { phone: adminPhone } : {}),
        ...(syncPassword ? { passwordHash } : {}),
      },
    });
    console.log(`Admin updated: ${adminEmail}${syncPassword ? ' (password synced from ADMIN_PASSWORD)' : ''}`);
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: adminName,
        role: Role.ADMIN,
        portfolio: 'Administration',
        phone: adminPhone,
        organisationId: org.id,
        mustChangePassword: false,
      },
    });
    console.log(`Admin created: ${adminEmail}`);
  }

  // If an old default admin exists under a different email, leave it — do not delete
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
