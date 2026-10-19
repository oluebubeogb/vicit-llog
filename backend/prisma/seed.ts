import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organisation.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: {
      name: 'Demo Organisation',
      code: 'DEMO',
    },
  });

  const passwordHash = await bcrypt.hash('Admin@12345', 12);

  await prisma.user.upsert({
    where: { email: 'admin@vicit.local' },
    update: {},
    create: {
      email: 'admin@vicit.local',
      passwordHash,
      fullName: 'System Administrator',
      role: Role.ADMIN,
      portfolio: 'IT & Security',
      organisationId: org.id,
    },
  });

  console.log('Seed complete. Admin: admin@vicit.local / Admin@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
