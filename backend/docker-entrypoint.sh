#!/bin/sh
set -e

echo "=== Vicit Llog backend starting ==="
echo "Running prisma migrate deploy..."

if ! npx prisma migrate deploy; then
  echo "WARNING: prisma migrate deploy failed."
  cat prisma/migrations/migration_lock.toml 2>/dev/null || true
fi

echo "Running seed (ADMIN_EMAIL / ADMIN_PASSWORD / ORGANIZATION required)..."
# Prefer compiled-free seed via ts-node; fallback to node requiring seed after transpile is not available
# so use inline node that mirrors seed.ts env-only logic (no hardcoded admin)
if ! npx ts-node prisma/seed.ts; then
  echo "ts-node seed failed, running env-only JS seed..."
  node << 'SEEDJS'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const p = new PrismaClient();
(async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const orgName = (process.env.ORGANIZATION || process.env.ORGANISATION || '').trim();
  const orgCode = (process.env.ORGANIZATION_CODE || '').toUpperCase().trim().slice(0, 16);
  const adminName = (process.env.ADMIN_NAME || 'Administrator').trim();
  const adminPhone = (process.env.ADMIN_PHONE || '').trim() || null;

  if (!adminEmail || !adminPassword) {
    console.error('SEED ABORTED: ADMIN_EMAIL and ADMIN_PASSWORD must be set. No default admin.');
    process.exit(1);
  }
  if (!orgName || !orgCode) {
    console.error('SEED ABORTED: ORGANIZATION and ORGANIZATION_CODE must be set.');
    process.exit(1);
  }

  const org = await p.organisation.upsert({
    where: { code: orgCode },
    update: { name: orgName },
    create: { name: orgName, code: orgCode },
  });
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await p.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      fullName: adminName,
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: false,
      organisationId: org.id,
      ...(adminPhone ? { phone: adminPhone } : {}),
    },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: 'ADMIN',
      portfolio: 'Administration',
      phone: adminPhone,
      organisationId: org.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  console.log('Admin ready:', adminEmail, '(password synced from ADMIN_PASSWORD)');
  await p.$disconnect();
})().catch(async (e) => {
  console.error('Seed failed:', e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
SEEDJS
fi

if [ -f dist/main.js ]; then
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
else
  echo "FATAL: cannot find compiled main.js"
  ls -laR dist || true
  exit 1
fi
