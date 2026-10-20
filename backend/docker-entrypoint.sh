#!/bin/sh
set -e

echo "=== Vicit Llog backend starting ==="
echo "DATABASE_URL host check..."
echo "Running prisma migrate deploy..."

if ! npx prisma migrate deploy; then
  echo "WARNING: prisma migrate deploy failed. Showing migration_lock.toml:"
  cat prisma/migrations/migration_lock.toml || true
  echo "Attempting to continue if tables already exist..."
fi

# Seed is best-effort
npx ts-node prisma/seed.ts 2>/dev/null || node -e "
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcrypt');
const p=new PrismaClient();
(async()=>{
  try {
    const org=await p.organisation.upsert({where:{code:'DEMO'},update:{},create:{name:'Demo Organisation',code:'DEMO'}});
    const hash=await bcrypt.hash('Admin@12345',12);
    await p.user.upsert({where:{email:'admin@vicit.local'},update:{},create:{email:'admin@vicit.local',passwordHash:hash,fullName:'System Administrator',role:'ADMIN',portfolio:'IT & Security',organisationId:org.id}});
    console.log('Seed OK');
  } catch(e){ console.log('Seed skip:', e.message); }
  finally{ await p.\$disconnect(); }
})();
" || true

if [ -f dist/main.js ]; then
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
else
  echo "FATAL: cannot find compiled main.js"
  ls -laR dist || true
  exit 1
fi
