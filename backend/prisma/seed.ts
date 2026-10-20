import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const orgName = process.env.ORGANIZATION || process.env.ORGANISATION || 'Demo Organisation';
  const orgCode = (process.env.ORGANIZATION_CODE || 'DEMO').toUpperCase().slice(0, 16);
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@vicit.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const adminName = process.env.ADMIN_NAME || 'System Administrator';
  const adminPhone = process.env.ADMIN_PHONE || null;

  const org = await prisma.organisation.upsert({
    where: { code: orgCode },
    update: { name: orgName },
    create: {
      name: orgName,
      code: orgCode,
    },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      // Do not overwrite password on every restart — only ensure org link/name
      fullName: adminName,
      organisationId: org.id,
      role: Role.ADMIN,
      isActive: true,
      ...(adminPhone ? { phone: adminPhone } : {}),
    },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: Role.ADMIN,
      portfolio: 'Administration',
      phone: adminPhone,
      organisationId: org.id,
      mustChangePassword: false, // env-set admin password is intentional
    },
  });

  console.log(`Seed complete. Org="${orgName}" Admin=${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
