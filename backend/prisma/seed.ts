import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Bootstrap ONLY from environment variables.
 * No hardcoded admin@vicit.local / Admin@12345.
 *
 * Required on first boot (and kept in sync on every seed run):
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ORGANIZATION, ORGANIZATION_CODE
 */
async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const orgName = (process.env.ORGANIZATION || process.env.ORGANISATION || '').trim();
  const orgCode = (process.env.ORGANIZATION_CODE || '').toUpperCase().trim().slice(0, 16);
  const adminName = (process.env.ADMIN_NAME || 'Administrator').trim();
  const adminPhone = (process.env.ADMIN_PHONE || '').trim() || null;

  if (!adminEmail || !adminPassword) {
    console.error(
      'SEED ABORTED: Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment before deploy. No default admin is created.',
    );
    process.exit(1);
  }
  if (!orgName || !orgCode) {
    console.error(
      'SEED ABORTED: Set ORGANIZATION and ORGANIZATION_CODE in the environment before deploy.',
    );
    process.exit(1);
  }
  if (adminPassword.length < 5) {
    console.error('SEED ABORTED: ADMIN_PASSWORD must be at least 5 characters.');
    process.exit(1);
  }

  console.log(`Seeding org="${orgName}" (${orgCode}) admin=${adminEmail}`);

  const org = await prisma.organisation.upsert({
    where: { code: orgCode },
    update: { name: orgName },
    create: { name: orgName, code: orgCode },
  });

  // Always sync password from env so Coolify env UI is the source of truth
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      fullName: adminName,
      role: Role.ADMIN,
      isActive: true,
      mustChangePassword: false,
      organisationId: org.id,
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
      mustChangePassword: false,
      isActive: true,
    },
  });

  console.log(`Admin ready: ${adminEmail} (password synced from ADMIN_PASSWORD)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
