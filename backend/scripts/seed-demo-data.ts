/**
 * TypeScript entry for the demo seeder.
 *
 * The Docker runner image copies /app/scripts but may not include ts-node
 * sources unless the image is rebuilt. Prefer the companion plain-JS file,
 * which only needs @prisma/client and bcrypt (already installed):
 *
 *   SEED_DEMO=YES DEMO_PASSWORD='…' node /app/scripts/seed-demo-data.js
 *   SEED_DEMO=YES node /app/scripts/seed-demo-data.js --reset
 *
 * From the backend package (also the npm script `seed:demo`):
 *
 *   SEED_DEMO=YES DEMO_PASSWORD='…' npm run seed:demo
 *   SEED_DEMO=YES npm run seed:demo -- --reset
 *
 * DEMO_PASSWORD is required when seeding (not for --reset). No default.
 * Emails: firstname.lastname.vicit@beuden.com.ng
 * (collision: firstname.lastname2.vicit@beuden.com.ng)
 * --reset uses DemoSeedRecord tags only for users (plus leftover @demo.vicit.ng).
 *
 * This file simply delegates to the JS implementation so both paths stay in sync.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./seed-demo-data.js');
