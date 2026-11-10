# Demo data seed

Fills **existing** agencies with realistic Nigerian demo staff, locations, invites, visits, attendance, notifications and a few ring calls.

It does **not** create or change Super Admins, Super Admin II, Super Gate Officers, agency admins or gate officers, and it never touches their passwords.

## Safety

- Refuses to run unless `SEED_DEMO=YES`
- Seeding also requires `DEMO_PASSWORD` (no default; clear refusal if it is missing). `--reset` does not need it.
- Demo staff emails use `firstname.lastname.vicit@beuden.com.ng` (collisions become `firstname.lastname2.vicit@beuden.com.ng`, then 3, …). Existing accounts on that address are left untouched; the seed picks the next free suffix.
- Locations use codes starting `DEMO-`
- Invite tokens start with `demo-`
- A `DemoSeedRecord` table tags created rows (including attendance written for existing officers) so `--reset` can remove only demo data
- `--reset` identifies demo **users** only via those tags (plus leftover `@demo.vicit.ng` accounts from an earlier pattern). It never matches on `@beuden.com.ng`, which real staff accounts use.

## Demo staff password

Set `DEMO_PASSWORD` when seeding. New STAFF accounts get that password, hashed with bcrypt 12, and `mustChangePassword` is false. There is no password baked into the script.

Email pattern: `firstname.lastname.vicit@beuden.com.ng`. If that address is already taken, the seed inserts a number before `.vicit` (`firstname.lastname2.vicit@beuden.com.ng`, and so on).

## Commands (inside the API container, working directory `/app`)

```bash
# Apply migrations if this image predates DemoSeedRecord
npx prisma migrate deploy

# Seed (DEMO_PASSWORD is required)
SEED_DEMO=YES DEMO_PASSWORD='your-demo-password' node /app/scripts/seed-demo-data.js

# Or via npm (from /app)
SEED_DEMO=YES DEMO_PASSWORD='your-demo-password' npm run seed:demo

# Remove only demo-tagged data (existing admins/officers and untagged @beuden.com.ng users stay)
SEED_DEMO=YES node /app/scripts/seed-demo-data.js --reset
SEED_DEMO=YES npm run seed:demo -- --reset
```

The runner image may not include TypeScript sources; the plain JS file is the supported entry point.

From a local backend checkout with `DATABASE_URL` set:

```bash
SEED_DEMO=YES DEMO_PASSWORD='your-demo-password' npm run seed:demo
SEED_DEMO=YES npm run seed:demo -- --reset
```

## What is created per agency

- Locations and gates only when the agency has none (Lagos Victoria Island + Abuja Wuse II, fictional addresses). Existing locations are reused.
- Existing agency gate officers may be assigned onto **new demo gates** (assignments are tagged and removed on reset).
- Six STAFF users with Nigerian names and portfolios (HR, Finance, Legal, Operations, Communications, IT). Full names are unique across **all** agencies (a shuffled pool is partitioned per organisation). Visitors and hosts use those same unique names.
- If an earlier seed reused names across agencies, run `--reset` and then re-seed to replace tagged demo staff and invites.
- About 24 invites across the past ~30 days and the coming week (meetings, deliveries, interviews, tours, …) with visitors, statuses, and gate check-in/out where appropriate.
- Staff attendance for the last ~20 weekdays (arrivals 07:30–09:45, exits 16:30–18:30, some late, some absences, some missing exits), including existing agency staff/admins/officers. Those attendance rows are tagged for reset.
- In-app notifications and a few host/gate ring calls.

Re-running without `--reset` is idempotent (existing demo tokens and tagged staff are reused; no duplicates).
