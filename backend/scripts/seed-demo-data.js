/**
 * Seed realistic demo data into EXISTING agencies (organisations).
 *
 * Does not modify existing Super Admins, agency admins or agency gate officers,
 * and never touches their passwords. Creates Super Admin II
 * (super.admin.ii@beuden.com.ng) and a Super Gate Officer
 * (super.gate@beuden.com.ng) when missing, tagged as demo, with DEMO_PASSWORD.
 *
 * Safety: refuses to run unless SEED_DEMO=YES.
 *
 *   SEED_DEMO=YES DEMO_PASSWORD='…' node scripts/seed-demo-data.js
 *   SEED_DEMO=YES node scripts/seed-demo-data.js --reset
 *
 * Inside the API container (/app):
 *   SEED_DEMO=YES DEMO_PASSWORD='…' node /app/scripts/seed-demo-data.js
 *   SEED_DEMO=YES node /app/scripts/seed-demo-data.js --reset
 *
 * DEMO_PASSWORD is required when seeding (clear refusal if missing) and is not
 * needed for --reset. There is no default password.
 * Demo staff emails: firstname.lastname.vicit@beuden.com.ng
 * (on collision: firstname.lastname2.vicit@beuden.com.ng, then 3, …).
 * --reset identifies demo users only via DemoSeedRecord tags (plus leftover
 * @demo.vicit.ng accounts). It never matches on @beuden.com.ng.
 *
 * Only needs @prisma/client (and bcrypt, already a backend dependency).
 */
'use strict';

const crypto = require('crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const DEMO_EMAIL_DOMAIN = 'beuden.com.ng';
const DEMO_EMAIL_LOCAL_MARK = '.vicit';
const LEGACY_DEMO_EMAIL_DOMAIN = 'demo.vicit.ng';
const LOCATION_PREFIX = 'DEMO-';
const INVITE_TOKEN_PREFIX = 'demo-';
const PROTECTED_ROLES = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE', 'ADMIN', 'GATE'];
const AGENCY_ROLES = ['ADMIN', 'STAFF', 'GATE'];

const STAFF_PER_AGENCY = 6;
const VISITORS_PER_AGENCY = 36;
const PORTFOLIOS = [
  'Human Resources',
  'Finance',
  'Legal',
  'Operations',
  'Communications',
  'Information Technology',
];

// Yoruba, Igbo, Hausa and other Nigerian given names / surnames. Combinations
// are shuffled once (deterministic) and partitioned per agency so no full name
// is reused across organisations.
const FIRST_NAMES = [
  'Adebayo', 'Adeola', 'Adetola', 'Aisha', 'Akachi', 'Amaka', 'Aminu', 'Amara',
  'Bolanle', 'Bose', 'Chiamaka', 'Chidinma', 'Chinedu', 'Chioma', 'Damilola', 'David',
  'Efe', 'Emeka', 'Emmanuel', 'Eniola', 'Fatima', 'Folake', 'Funke', 'Goretti',
  'Hadiza', 'Halima', 'Ibrahim', 'Idris', 'Ifeoma', 'Ijeoma', 'Jumoke', 'Kelechi',
  'Kunle', 'Lami', 'Maryam', 'Mobolaji', 'Ngozi', 'Nkechi', 'Obinna', 'Olumide',
  'Oluwaseun', 'Osaze', 'Peter', 'Rukayat', 'Sade', 'Segun', 'Seyi', 'Stella',
  'Suleiman', 'Tari', 'Temitope', 'Tobi', 'Tunde', 'Uche', 'Yakubu', 'Yetunde',
  'Yusuf', 'Zainab', 'Zara', 'Bello', 'Chukwuemeka', 'Femi', 'Gbenga', 'Hauwa',
  'Ikenna', 'Kemi', 'Nneka', 'Onyeka', 'Simisola', 'Tochukwu',
];
const LAST_NAMES = [
  'Abdullahi', 'Adebayo', 'Adeyemi', 'Agbaje', 'Ajayi', 'Akinola', 'Alabi', 'Aliyu',
  'Bakare', 'Balogun', 'Bello', 'Chukwu', 'Danjuma', 'Ekanem', 'Ekong', 'Eze',
  'Garba', 'Ibrahim', 'Idris', 'Kalu', 'Lawal', 'Maduike', 'Mohammed', 'Musa',
  'Nnamdi', 'Nwafor', 'Nwosu', 'Obi', 'Okonkwo', 'Okorie', 'Okoro', 'Okeke',
  'Oladipo', 'Olatunji', 'Okafor', 'Onuoha', 'Sani', 'Shonibare', 'Umeh', 'Usman',
  'Yusuf', 'Dike', 'Ekwueme', 'Fashola', 'Gbadamosi', 'Ibe', 'Jibril', 'Nwachukwu',
  'Ogundipe', 'Salami',
];
const ADDRESSES = [
  '12 Boyle Street, Onikan, Lagos',
  '5 Gana Street, Maitama, Abuja',
  '27 Admiralty Road, Lekki Phase 1, Lagos',
  '9 Okon Essien Lane, Uyo',
  '18 Aminu Kano Crescent, Wuse II, Abuja',
  '6 New Market Road, Onitsha',
  '3 Akin Adesola Street, Victoria Island, Lagos',
  '14 Factory Road, Aba',
  '11 Ahmadu Bello Way, Kaduna',
  '8 Marian Road, Calabar',
  '22 Ikorodu Road, Maryland, Lagos',
  '4 Trans Amadi Layout, Port Harcourt',
  '16 Ring Road, Ibadan',
  '9 Independence Layout, Enugu',
  '7 Ahmadu Bello Way, Kano',
  '2 Tafawa Balewa Close, Asokoro, Abuja',
  '31 Aba Road, Port Harcourt',
  '15 Allen Avenue, Ikeja, Lagos',
];

function buildUniquePeople(count) {
  const combos = [];
  for (const last of LAST_NAMES) {
    for (const first of FIRST_NAMES) {
      if (String(first).toLowerCase() === String(last).toLowerCase()) continue;
      combos.push({ first, last, fullName: `${first} ${last}` });
    }
  }
  const rng = mulberry32(hashSeed('vicit-demo-people-v7'));
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = combos[i];
    combos[i] = combos[j];
    combos[j] = tmp;
  }
  const seen = new Set();
  const unique = [];
  for (const p of combos) {
    const key = p.fullName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= count) break;
  }
  if (unique.length < count) {
    throw new Error(`Demo name pool only produced ${unique.length} unique names; need ${count}`);
  }
  return unique;
}

function partitionPeople(orgs) {
  const need = orgs.length * (STAFF_PER_AGENCY + VISITORS_PER_AGENCY);
  const pool = buildUniquePeople(need);
  const byOrg = new Map();
  let offset = 0;
  for (const org of orgs) {
    const staff = pool.slice(offset, offset + STAFF_PER_AGENCY).map((p, i) => ({
      ...p,
      portfolio: PORTFOLIOS[i % PORTFOLIOS.length],
      phone: `+23480${String(20000000 + offset + i).slice(-8)}`,
    }));
    const visitors = pool.slice(offset + STAFF_PER_AGENCY, offset + STAFF_PER_AGENCY + VISITORS_PER_AGENCY).map((p, i) => ({
      ...p,
      email: `${p.first.toLowerCase()}.${p.last.toLowerCase()}@example.com`,
      phone: `+23481${String(30000000 + offset + i).slice(-8)}`,
      address: ADDRESSES[i % ADDRESSES.length],
    }));
    byOrg.set(org.id, { staff, visitors });
    offset += STAFF_PER_AGENCY + VISITORS_PER_AGENCY;
  }
  return byOrg;
}

const PURPOSES = [
  'Quarterly vendor review',
  'Contract signing',
  'Project kickoff meeting',
  'Facility walkthrough',
  'Recruitment interview',
  'IT equipment delivery',
  'Board committee briefing',
  'Partnership discussion',
  'Scheduled maintenance inspection',
  'Staff training workshop',
  'External audit fieldwork',
  'Client presentation',
  'Insurance assessment visit',
  'Document collection',
  'Supplier onboarding',
];

const DEFENCE_COMPLEX_ADDRESS = 'Defence Complex, Area 7, Garki, Abuja, Federal Capital Territory, Nigeria';
const DEFENCE_COMPLEX_CODE = 'DEMO-DEF';

function shortNameFor(org) {
  const n = String((org && (org.shortName || org.name)) || '');
  const lower = n.toLowerCase();
  if (/navy/.test(lower)) return 'Navy';
  if (/army/.test(lower)) return 'Army';
  if (/air/.test(lower)) return 'Air Force';
  if (/headquarter|dhq|defence|defense/.test(lower)) return 'DHQ';
  return (org && org.code) || n.split(/\s+/)[0] || 'Agency';
}

function loginOrderFor(org, index) {
  const order = { DHQ: 0, Army: 1, 'Air Force': 2, Navy: 3 };
  const s = shortNameFor(org);
  return Object.prototype.hasOwnProperty.call(order, s) ? order[s] : 10 + index;
}

function flagReset() {
  return process.argv.slice(2).includes('--reset');
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12) || 'org';
}

/** attempt 0 → firstname.lastname.vicit@beuden.com.ng; attempt 1 → firstname.lastname2.vicit@… */
function demoEmailCandidate(first, last, attempt) {
  const base = `${String(first).toLowerCase()}.${String(last).toLowerCase()}`;
  const collision = attempt === 0 ? '' : String(attempt + 1);
  return `${base}${collision}${DEMO_EMAIL_LOCAL_MARK}@${DEMO_EMAIL_DOMAIN}`;
}

function legacyDemoEmailWhere() {
  return { email: { endsWith: `@${LEGACY_DEMO_EMAIL_DOMAIN}` } };
}

function readDemoPassword() {
  const password = String(process.env.DEMO_PASSWORD || '').trim();
  if (!password) {
    console.error(
      'Refusing to seed. Set DEMO_PASSWORD in the environment (required when seeding; not needed for --reset).',
    );
    process.exit(1);
  }
  return password;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  const h = crypto.createHash('sha256').update(String(str)).digest();
  return h.readUInt32LE(0);
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN(rng, arr, n) {
  const copy = arr.slice();
  const out = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Africa/Lagos is UTC+1 year-round. */
function lagosDate(y, m, d, h = 0, min = 0, s = 0) {
  const base = new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00+01:00`);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid Lagos calendar day ${y}-${pad(m)}-${pad(d)}`);
  }
  base.setTime(base.getTime() + ((h * 3600) + (min * 60) + s) * 1000);
  return base;
}

function lagosParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
  };
}

function dayKeyFromLagos(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** StaffAttendance.day is stored as UTC midnight of the Lagos YYYY-MM-DD key. */
function attendanceDay(y, m, d) {
  return new Date(`${dayKeyFromLagos(y, m, d)}T00:00:00.000Z`);
}

function lastWeekdays(count, from = new Date()) {
  const days = [];
  const cur = new Date(from.getTime());
  // Start from yesterday so "today" is not half-filled.
  cur.setTime(cur.getTime() - 24 * 3600 * 1000);
  while (days.length < count) {
    const p = lagosParts(cur);
    const wd = new Date(`${p.year}-${pad(p.month)}-${pad(p.day)}T12:00:00+01:00`).getUTCDay();
    // getUTCDay on a +01:00 noon is the Lagos weekday (Sun=0)
    const lagosNoon = new Date(`${p.year}-${pad(p.month)}-${pad(p.day)}T12:00:00+01:00`);
    const day = lagosNoon.getUTCDay(); // actually this is UTC day of that instant
    // 12:00 Lagos = 11:00 UTC, same calendar day. getUTCDay is correct Mon-Fri.
    if (day !== 0 && day !== 6) {
      days.push({ year: p.year, month: p.month, day: p.day, key: dayKeyFromLagos(p.year, p.month, p.day) });
    }
    cur.setTime(cur.getTime() - 24 * 3600 * 1000);
  }
  return days.reverse();
}

function upcomingDays(count, from = new Date()) {
  const days = [];
  const cur = new Date(from.getTime());
  cur.setTime(cur.getTime() + 24 * 3600 * 1000);
  while (days.length < count) {
    const p = lagosParts(cur);
    const lagosNoon = new Date(`${p.year}-${pad(p.month)}-${pad(p.day)}T12:00:00+01:00`);
    const day = lagosNoon.getUTCDay();
    if (day !== 0 && day !== 6) {
      days.push({ year: p.year, month: p.month, day: p.day, key: dayKeyFromLagos(p.year, p.month, p.day) });
    }
    cur.setTime(cur.getTime() + 24 * 3600 * 1000);
  }
  return days;
}

function minutesBetween(rng, startH, startM, endH, endM) {
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  const m = start + Math.floor(rng() * (end - start + 1));
  return { h: Math.floor(m / 60), min: m % 60 };
}

function passphrase(orgCode, i) {
  const words = ['CEDAR', 'NIGER', 'SAVANNA', 'HARMATTAN', 'LAGOON', 'BAOBAB', 'KOLA', 'IBIS'];
  const w1 = words[i % words.length];
  const w2 = words[(i * 3 + 1) % words.length];
  return `DEMO-${orgCode}-${w1}-${w2}-${1000 + i}`;
}

let canTag = true;

async function tag(model, recordId) {
  if (!canTag || !recordId) return;
  try {
    await prisma.demoSeedRecord.upsert({
      where: { model_recordId: { model, recordId } },
      create: { model, recordId },
      update: {},
    });
  } catch (err) {
    canTag = false;
    console.warn('DemoSeedRecord unavailable (run migrations). Falling back to tagged fields only.', err.message || err);
  }
}

async function taggedIds(model) {
  if (!canTag) return [];
  try {
    const rows = await prisma.demoSeedRecord.findMany({ where: { model }, select: { recordId: true } });
    return rows.map((r) => r.recordId);
  } catch {
    return [];
  }
}

async function resetDemo() {
  const summary = {
    gateParticulars: 0,
    gateVisits: 0,
    ringCalls: 0,
    notifications: 0,
    staffAttendances: 0,
    visitors: 0,
    invites: 0,
    assignments: 0,
    gates: 0,
    locations: 0,
    users: 0,
    tags: 0,
  };

  // Demo users are identified ONLY by DemoSeedRecord tags, plus leftover
  // @demo.vicit.ng accounts from an earlier email pattern. Never match on
  // @beuden.com.ng — that domain is used by real staff accounts.
  const taggedUsers = await taggedIds('User');
  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        legacyDemoEmailWhere(),
        ...(taggedUsers.length ? [{ id: { in: taggedUsers } }] : []),
      ],
    },
    select: { id: true, role: true, email: true },
  });
  const demoUserIds = demoUsers
    .filter((u) => !PROTECTED_ROLES.includes(u.role) && u.role === 'STAFF')
    .map((u) => u.id);
  if (demoUsers.length !== demoUserIds.length) {
    console.warn('Refusing to delete protected-role accounts even if they were tagged as demo.');
  }

  const taggedAttendance = await taggedIds('StaffAttendance');
  const taggedVisits = await taggedIds('GateVisit');
  const taggedRings = await taggedIds('RingCall');
  const taggedNotes = await taggedIds('Notification');
  const taggedInvites = await taggedIds('Invite');
  const taggedVisitors = await taggedIds('Visitor');
  const taggedAssignments = await taggedIds('GateOfficerAssignment');
  const taggedGates = await taggedIds('Gate');
  const taggedLocations = await taggedIds('Location');

  const demoLocations = await prisma.location.findMany({
    where: { OR: [{ code: { startsWith: LOCATION_PREFIX } }, { id: { in: taggedLocations.length ? taggedLocations : ['__none__'] } }] },
    select: { id: true, gates: { select: { id: true } } },
  });
  const locationIds = [...new Set(demoLocations.map((l) => l.id).concat(taggedLocations))];
  const gateIds = [
    ...new Set(demoLocations.flatMap((l) => l.gates.map((g) => g.id)).concat(taggedGates)),
  ];

  const demoInvites = await prisma.invite.findMany({
    where: {
      OR: [
        { token: { startsWith: INVITE_TOKEN_PREFIX } },
        { passphrase: { startsWith: 'DEMO-' } },
        { id: { in: taggedInvites.length ? taggedInvites : ['__none__'] } },
      ],
    },
    select: { id: true, visitors: { select: { id: true } } },
  });
  const inviteIds = [...new Set(demoInvites.map((i) => i.id).concat(taggedInvites))];
  const visitorIds = [
    ...new Set(demoInvites.flatMap((i) => i.visitors.map((v) => v.id)).concat(taggedVisitors)),
  ];

  // Particulars cascade from GateVisit; delete visits first (RESTRICT on gate).
  if (taggedVisits.length) {
    const parts = await prisma.gateParticular.deleteMany({ where: { gateVisitId: { in: taggedVisits } } });
    summary.gateParticulars += parts.count;
  }
  if (visitorIds.length || taggedVisits.length) {
    const r = await prisma.gateVisit.deleteMany({
      where: { OR: [{ id: { in: taggedVisits.length ? taggedVisits : ['__none__'] } }, { visitorId: { in: visitorIds.length ? visitorIds : ['__none__'] } }] },
    });
    summary.gateVisits = r.count;
  }
  if (visitorIds.length || taggedRings.length) {
    const r = await prisma.ringCall.deleteMany({
      where: { OR: [{ id: { in: taggedRings.length ? taggedRings : ['__none__'] } }, { visitorId: { in: visitorIds.length ? visitorIds : ['__none__'] } }] },
    });
    summary.ringCalls = r.count;
  }

  // Notifications have no FK; delete tagged + those tied to demo users / meta.demo
  const noteOr = [];
  if (taggedNotes.length) noteOr.push({ id: { in: taggedNotes } });
  if (demoUserIds.length) noteOr.push({ userId: { in: demoUserIds } });
  if (noteOr.length) {
    const r = await prisma.notification.deleteMany({ where: { OR: noteOr } });
    summary.notifications = r.count;
  }
  // Also drop notifications whose meta marks them as demo (best-effort JSON).
  try {
    const extra = await prisma.$executeRaw`
      DELETE FROM "Notification"
      WHERE meta IS NOT NULL
        AND (meta->>'demo') = 'true'
    `;
    if (typeof extra === 'number') summary.notifications += extra;
  } catch {
    /* ignore */
  }

  const attOr = [];
  if (taggedAttendance.length) attOr.push({ id: { in: taggedAttendance } });
  if (demoUserIds.length) attOr.push({ userId: { in: demoUserIds } });
  if (attOr.length) {
    const r = await prisma.staffAttendance.deleteMany({ where: { OR: attOr } });
    summary.staffAttendances = r.count;
  }

  const taggedContractors = await taggedIds('Contractor');
  const taggedDispatches = await taggedIds('Dispatch');
  if (taggedDispatches.length) {
    try {
      await prisma.dispatchItem.deleteMany({ where: { dispatchId: { in: taggedDispatches } } });
      await prisma.dispatchDestination.deleteMany({ where: { dispatchId: { in: taggedDispatches } } });
      const r = await prisma.dispatch.deleteMany({ where: { id: { in: taggedDispatches } } });
      summary.dispatches = r.count;
    } catch (err) {
      console.warn('Dispatch reset skipped:', err.message || err);
    }
  }
  if (taggedContractors.length) {
    try {
      await prisma.contractorVisit.deleteMany({ where: { contractorId: { in: taggedContractors } } });
      await prisma.contractorOrganisation.deleteMany({ where: { contractorId: { in: taggedContractors } } });
      const r = await prisma.contractor.deleteMany({ where: { id: { in: taggedContractors } } });
      summary.contractors = r.count;
    } catch (err) {
      console.warn('Contractor reset skipped:', err.message || err);
    }
  }

  if (visitorIds.length) {
    const r = await prisma.visitor.deleteMany({ where: { id: { in: visitorIds } } });
    summary.visitors = r.count;
  }
  if (inviteIds.length) {
    const r = await prisma.invite.deleteMany({ where: { id: { in: inviteIds } } });
    summary.invites = r.count;
  }

  const assignOr = [];
  if (taggedAssignments.length) assignOr.push({ id: { in: taggedAssignments } });
  if (gateIds.length) assignOr.push({ gateId: { in: gateIds } });
  if (assignOr.length) {
    const r = await prisma.gateOfficerAssignment.deleteMany({ where: { OR: assignOr } });
    summary.assignments = r.count;
  }

  if (gateIds.length) {
    // GateVisit -> Gate is RESTRICT. Any remaining visit rows on demo gates
    // (e.g. test scans of real visitors at demo gates) must go first, or the
    // gate delete fails with P2003. Particulars cascade from GateVisit.
    const leftover = await prisma.gateVisit.deleteMany({ where: { gateId: { in: gateIds } } });
    if (leftover.count) {
      summary.gateVisits += leftover.count;
      console.log(`Removed ${leftover.count} other gate visit record(s) that pointed at demo gates.`);
    }
    const r = await prisma.gate.deleteMany({ where: { id: { in: gateIds } } });
    summary.gates = r.count;
  }
  if (locationIds.length) {
    // Null soft refs before delete
    await prisma.invite.updateMany({ where: { locationId: { in: locationIds } }, data: { locationId: null } });
    const r = await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    summary.locations = r.count;
  }

  if (demoUserIds.length) {
    const r = await prisma.user.deleteMany({
      where: {
        id: { in: demoUserIds },
        role: 'STAFF',
        OR: [
          legacyDemoEmailWhere(),
          ...(taggedUsers.length ? [{ id: { in: taggedUsers } }] : []),
        ],
      },
    });
    summary.users = r.count;
  }

  try {
    const r = await prisma.demoSeedRecord.deleteMany({});
    summary.tags = r.count;
  } catch {
    /* table may not exist */
  }

  return summary;
}

async function ensureLocations(org, officers, rng) {
  const existing = await prisma.location.findMany({
    where: { organisationId: org.id },
    include: { gates: true },
  });
  const created = { locations: 0, gates: 0, assignments: 0 };
  let locations = existing;

  const short = shortNameFor(org);
  const wantedGates = [
    { name: 'Main Gate', code: 'MAIN' },
    { name: `${short} Gate`, code: 'AGENCY' },
  ];
  let complex = existing.find((l) => l.code === DEFENCE_COMPLEX_CODE);
  if (!complex) {
    complex = await prisma.location.create({
      data: {
        name: 'Defence Complex',
        code: DEFENCE_COMPLEX_CODE,
        address: DEFENCE_COMPLEX_ADDRESS,
        organisationId: org.id,
        isShared: true,
      },
      include: { gates: true },
    });
    await tag('Location', complex.id);
    created.locations += 1;
    locations = existing.concat([complex]);
  }
  for (let i = 0; i < wantedGates.length; i++) {
    const g = wantedGates[i];
    if ((complex.gates || []).some((row) => row.code === g.code)) continue;
    const gate = await prisma.gate.create({
      data: {
        name: g.name,
        code: g.code,
        locationId: complex.id,
        isActive: true,
        sequence: i,
        admissionsEnabled: true,
        particularsCheckEnabled: true,
      },
    });
    await tag('Gate', gate.id);
    complex.gates = (complex.gates || []).concat([gate]);
    created.gates += 1;
  }
  locations = locations.map((l) => (l.id === complex.id ? complex : l));
  if (!locations.some((l) => l.id === complex.id)) locations.push(complex);

  const allGates = locations.flatMap((l) => l.gates || []);
  // Assign existing agency gate officers (never created here) onto demo gates if a demo gate has nobody.
  const demoGates = allGates.filter((g) => {
    const loc = locations.find((l) => l.id === g.locationId);
    return loc && String(loc.code || '').startsWith(LOCATION_PREFIX);
  });
  const targets = demoGates.length ? demoGates : allGates.slice(0, 3);
  for (const officer of officers) {
    if (!targets.length) break;
    const gate = pick(rng, targets);
    try {
      const asg = await prisma.gateOfficerAssignment.upsert({
        where: { gateId_userId: { gateId: gate.id, userId: officer.id } },
        create: { gateId: gate.id, userId: officer.id },
        update: {},
      });
      // Only tag if we created it this run — upsert doesn't tell us; tag anyway so reset can unassign.
      // To avoid unassigning a pre-existing assignment on a pre-existing gate, only tag when the gate itself is demo-tagged.
      if (demoGates.some((g) => g.id === gate.id)) {
        await tag('GateOfficerAssignment', asg.id);
        created.assignments += 1;
      }
    } catch {
      /* unique race */
    }
  }

  return { locations, gates: allGates.length ? allGates : locations.flatMap((l) => l.gates || []), created };
}

async function ensureStaff(org, passwordHash, staffPeople) {
  const created = [];
  const reused = [];
  const tagged = new Set(await taggedIds('User'));
  const people = staffPeople && staffPeople.length ? staffPeople : [];
  if (!people.length) {
    console.warn(`No unique staff names allocated for ${org.name}; skipping staff seed.`);
  }
  for (const p of people) {
    const fullName = p.fullName || `${p.first} ${p.last}`;
    const already = await prisma.user.findFirst({
      where: {
        organisationId: org.id,
        role: 'STAFF',
        fullName,
        OR: [
          ...(tagged.size ? [{ id: { in: [...tagged] } }] : []),
          legacyDemoEmailWhere(),
        ],
      },
    });
    if (already) {
      if (PROTECTED_ROLES.includes(already.role)) {
        console.warn(`Skipping ${fullName}: a protected role already uses a matching demo identity.`);
        continue;
      }
      reused.push(already);
      await tag('User', already.id);
      continue;
    }

    let email = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = demoEmailCandidate(p.first, p.last, attempt);
      const taken = await prisma.user.findUnique({ where: { email: candidate }, select: { id: true, role: true, email: true } });
      if (!taken) {
        email = candidate;
        break;
      }
      // Address already held — never modify that account; try firstname.lastname2.vicit@…
    }
    if (!email) {
      throw new Error(`Unable to allocate a demo email for ${fullName} (firstname.lastname.vicit@${DEMO_EMAIL_DOMAIN})`);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: 'STAFF',
        portfolio: p.portfolio,
        phone: p.phone,
        isActive: true,
        mustChangePassword: false,
        organisationId: org.id,
        staffQrToken: token,
      },
    });
    await tag('User', user.id);
    created.push(user);
  }
  return { created, reused, all: created.concat(reused) };
}

async function seedInvitesAndVisits(org, hosts, gates, officers, rng, visitorPeople) {
  const counts = { invites: 0, visitors: 0, visits: 0, rings: 0, notifications: 0 };
  if (!hosts.length) return counts;
  const guestsPool = (visitorPeople || []).slice();
  let guestCursor = 0;
  const nextVisitor = () => (guestCursor < guestsPool.length ? guestsPool[guestCursor++] : null);

  const pastDays = lastWeekdays(22);
  const futureDays = upcomingDays(6);
  const modes = ['PEDESTRIAN', 'MOTORCYCLE', 'VEHICLE'];
  const categories = ['OFFICIAL', 'OFFICIAL', 'OFFICIAL', 'PERSONAL'];

  const plans = [];
  // ~18 past + ~6 upcoming
  for (let i = 0; i < 18; i++) {
    const day = pastDays[i % pastDays.length] || pastDays[0];
    const roll = rng();
    let status = 'USED';
    let visitorStatus = 'EXITED';
    if (roll > 0.88) {
      status = 'EXPIRED';
      visitorStatus = 'INVITED';
    } else if (roll > 0.8) {
      status = 'REVOKED';
      visitorStatus = 'CANCELLED';
    } else if (roll > 0.72) {
      status = 'USED';
      visitorStatus = 'DENIED';
    } else if (roll > 0.62) {
      status = 'USED';
      visitorStatus = 'ARRIVED';
    }
    plans.push({ day, status, visitorStatus, upcoming: false, index: i });
  }
  for (let i = 0; i < 6; i++) {
    const day = futureDays[i % futureDays.length] || futureDays[0];
    const status = i === 5 ? 'PENDING' : 'ACTIVE';
    plans.push({ day, status, visitorStatus: 'INVITED', upcoming: true, index: 18 + i });
  }

  for (const plan of plans) {
    const token = `${INVITE_TOKEN_PREFIX}${slug(org.code)}-inv-${plan.index}`;
    const existing = await prisma.invite.findUnique({ where: { token }, select: { id: true } });
    if (existing) continue;

    const host = pick(rng, hosts);
    const guest = nextVisitor();
    if (!guest) continue;
    const companion = plan.index % 5 === 0 ? nextVisitor() : null;
    const purpose = PURPOSES[plan.index % PURPOSES.length];
    const mode = pick(rng, modes);
    const arr = minutesBetween(rng, 9, 0, 15, 30);
    const expectedAt = lagosDate(plan.day.year, plan.day.month, plan.day.day, arr.h, arr.min);
    const expiresAt = lagosDate(plan.day.year, plan.day.month, plan.day.day, 23, 59, 59);
    const createdAt = new Date(expectedAt.getTime() - (1 + Math.floor(rng() * 4)) * 24 * 3600 * 1000);
    const gate = gates.length ? pick(rng, gates) : null;
    const officer = officers.length ? pick(rng, officers) : host;
    const guestNames = (companion && companion.fullName !== guest.fullName)
      ? [guest.fullName, companion.fullName]
      : [guest.fullName];

    const invite = await prisma.invite.create({
      data: {
        token,
        passphrase: passphrase(org.code, plan.index),
        status: plan.status,
        purpose,
        category: pick(rng, categories),
        guestCount: guestNames.length,
        guestNames,
        expectedMode: mode,
        expectedAt,
        expiresAt,
        hostId: host.id,
        organisationId: org.id,
        locationId: gate ? gate.locationId : null,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await tag('Invite', invite.id);
    counts.invites += 1;

    const second = companion && companion.fullName !== guest.fullName ? companion : null;
    const guests = second ? [guest, second] : [guest];
    const visitorRows = [];
    for (let g = 0; g < guests.length; g++) {
      const person = guests[g];
      const enteredAt =
        plan.visitorStatus === 'ARRIVED' || plan.visitorStatus === 'EXITED' || plan.visitorStatus === 'DENIED'
          ? lagosDate(plan.day.year, plan.day.month, plan.day.day, arr.h, arr.min + g * 4)
          : null;
      let exitedAt = null;
      if (plan.visitorStatus === 'EXITED' && enteredAt) {
        const ex = minutesBetween(rng, 16, 0, 18, 15);
        exitedAt = lagosDate(plan.day.year, plan.day.month, plan.day.day, ex.h, ex.min);
        if (exitedAt <= enteredAt) exitedAt = new Date(enteredAt.getTime() + 2 * 3600 * 1000);
      }
      const deniedAt = plan.visitorStatus === 'DENIED' ? enteredAt : null;
      const v = await prisma.visitor.create({
        data: {
          inviteId: invite.id,
          fullName: person.fullName,
          email: person.email.replace('@example.com', `+${slug(org.code)}${plan.index}${g}@example.com`),
          phone: person.phone,
          address: person.address,
          status: plan.visitorStatus,
          entryMode: enteredAt ? mode : null,
          enteredAt,
          exitedAt,
          deniedAt,
          deniedReason: plan.visitorStatus === 'DENIED' ? 'ID details did not match the invitation' : null,
          gateId: enteredAt && gate ? gate.id : null,
          entryById: enteredAt && officer ? officer.id : null,
          exitById: exitedAt && officer ? officer.id : null,
          hostAvailabilityStatus:
            plan.visitorStatus === 'ARRIVED' || plan.visitorStatus === 'EXITED' ? 'AVAILABLE' : 'PENDING',
          hostRespondedAt: plan.visitorStatus === 'ARRIVED' || plan.visitorStatus === 'EXITED' ? enteredAt : null,
          createdAt,
          updatedAt: exitedAt || enteredAt || createdAt,
        },
      });
      await tag('Visitor', v.id);
      counts.visitors += 1;
      visitorRows.push({ ...v, enteredAt, exitedAt });

      if (enteredAt && gate && officer && plan.visitorStatus !== 'INVITED' && plan.visitorStatus !== 'CANCELLED') {
        const visit = await prisma.gateVisit.create({
          data: {
            visitorId: v.id,
            gateId: gate.id,
            officerId: officer.id,
            decision: plan.visitorStatus === 'DENIED' ? 'DENIED' : 'PASSED',
            particularsChecked: true,
            notes: plan.visitorStatus === 'DENIED' ? 'ID mismatch at checkpoint' : 'Cleared at reception',
            occurredAt: enteredAt,
          },
        });
        await tag('GateVisit', visit.id);
        counts.visits += 1;
      }
    }

    // A few ring calls on arrived/exited visits
    if (officer && (plan.visitorStatus === 'ARRIVED' || plan.visitorStatus === 'EXITED') && plan.index % 4 === 0) {
      const v = visitorRows[0];
      if (v) {
        const started = v.enteredAt || expectedAt;
        const answered = new Date(started.getTime() + 20 * 1000);
        const ended = new Date(started.getTime() + 95 * 1000);
        const ring = await prisma.ringCall.create({
          data: {
            visitorId: v.id,
            fromUserId: officer.id,
            toUserId: host.id,
            direction: 'GATE_TO_HOST',
            status: 'ACCEPTED',
            gateId: gate ? gate.id : null,
            createdAt: started,
            answeredAt: answered,
            endedAt: ended,
          },
        });
        await tag('RingCall', ring.id);
        counts.rings += 1;
      }
    }

    // Host notifications for past arrivals / upcoming reminders
    if (plan.visitorStatus === 'ARRIVED' || plan.visitorStatus === 'EXITED') {
      const v = visitorRows[0];
      const n = await prisma.notification.create({
        data: {
          userId: host.id,
          title: plan.visitorStatus === 'EXITED' ? 'Visitor Exited' : 'Visitor Arrived',
          body:
            plan.visitorStatus === 'EXITED'
              ? `${v.fullName} has left the premises.`
              : `${v.fullName} has entered the premises.`,
          isRead: plan.visitorStatus === 'EXITED',
          channel: 'in_app',
          meta: { demo: 'true', visitorId: v.id, inviteId: invite.id, type: plan.visitorStatus === 'EXITED' ? 'EXIT' : 'ARRIVAL' },
          createdAt: v.enteredAt || createdAt,
        },
      });
      await tag('Notification', n.id);
      counts.notifications += 1;
    } else if (plan.upcoming && plan.index % 2 === 0) {
      const n = await prisma.notification.create({
        data: {
          userId: host.id,
          title: 'Upcoming visitor',
          body: `${guest.fullName} is expected for ${purpose.toLowerCase()} on ${plan.day.key}.`,
          isRead: false,
          channel: 'in_app',
          meta: { demo: 'true', inviteId: invite.id, type: 'UPCOMING' },
          createdAt: new Date(),
        },
      });
      await tag('Notification', n.id);
      counts.notifications += 1;
    }
  }

  return counts;
}

async function seedAttendance(org, subjects, officers, gates, rng) {
  const days = lastWeekdays(20);
  let created = 0;
  let skipped = 0;
  for (const user of subjects) {
    for (const day of days) {
      const roll = rng();
      if (roll < 0.1) continue; // absence
      const late = roll > 0.75;
      const arrival = late ? minutesBetween(rng, 9, 0, 9, 45) : minutesBetween(rng, 7, 30, 8, 55);
      const arrivedAt = lagosDate(day.year, day.month, day.day, arrival.h, arrival.min);
      const missingExit = roll > 0.92;
      let exitedAt = null;
      if (!missingExit) {
        const ex = minutesBetween(rng, 16, 30, 18, 30);
        exitedAt = lagosDate(day.year, day.month, day.day, ex.h, ex.min);
      }
      const dayDate = attendanceDay(day.year, day.month, day.day);
      const gate = gates.length ? pick(rng, gates) : null;
      const scanner = officers.length ? pick(rng, officers) : null;
      try {
        const row = await prisma.staffAttendance.create({
          data: {
            userId: user.id,
            organisationId: org.id,
            day: dayDate,
            arrivedAt,
            exitedAt,
            arrivalGateId: gate ? gate.id : null,
            exitGateId: exitedAt && gate ? gate.id : null,
            scannedById: scanner ? scanner.id : null,
          },
        });
        await tag('StaffAttendance', row.id);
        created += 1;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
  }
  return { created, skipped };
}

async function seedAlertsForAdmins(org, admins, rng) {
  let created = 0;
  for (const admin of admins) {
    const already = await prisma.notification.findFirst({
      where: { userId: admin.id, title: 'Attendance digest' },
    });
    if (already) continue;
    const n = await prisma.notification.create({
      data: {
        userId: admin.id,
        title: 'Attendance digest',
        body: `Yesterday's gate activity and a few late arrivals are ready to review for ${org.name}.`,
        isRead: false,
        channel: 'in_app',
        meta: { demo: 'true', type: 'DIGEST', organisationId: org.id },
        createdAt: new Date(),
      },
    });
    await tag('Notification', n.id);
    created += 1;
  }
  return created;
}


async function ensurePlatformOfficers(passwordHash) {
  const sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!sa) {
    console.warn('No Super Admin found; skipping Super Admin II / Super Gate Officer seed.');
    return { created: [], reused: [] };
  }
  const specs = [
    { email: 'super.admin.ii@beuden.com.ng', fullName: 'Super Admin II', role: 'GLOBAL_ADMIN', permissions: ['visits.view'] },
    { email: 'super.gate@beuden.com.ng', fullName: 'Super Gate Officer', role: 'GLOBAL_GATE', permissions: [] },
  ];
  const created = [];
  const reused = [];
  for (const spec of specs) {
    const existing = await prisma.user.findUnique({ where: { email: spec.email } });
    if (existing) {
      await tag('User', existing.id);
      reused.push(existing);
      continue;
    }
    const row = await prisma.user.create({
      data: {
        email: spec.email,
        passwordHash,
        fullName: spec.fullName,
        role: spec.role,
        permissions: spec.permissions,
        organisationId: sa.organisationId,
        isActive: true,
        mustChangePassword: false,
        portfolio: spec.role === 'GLOBAL_ADMIN' ? 'Platform oversight' : 'Platform gate',
      },
    });
    await tag('User', row.id);
    created.push(row);
    console.log(`Created ${spec.fullName} <${spec.email}> (password from DEMO_PASSWORD)`);
  }
  return { created, reused };
}

async function applyLoginGrid(orgs) {
  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i];
    await prisma.organisation.update({
      where: { id: org.id },
      data: {
        shortName: org.shortName || shortNameFor(org),
        loginOrder: org.loginOrder || loginOrderFor(org, i),
        loginVisible: /platform/i.test(String(org.code || org.name || '')) ? false : org.loginVisible !== false,
      },
    });
  }
}

async function seedContractorsAndDispatches(agencies, reportByOrg, passwordHash) {
  const created = { contractors: 0, visits: 0, dispatches: 0 };
  const names = buildUniquePeople(agencies.length * 3 + 6);
  let ni = 0;
  // One multi-agency contractor, plus one expired and one terminated per first agencies
  const allIds = agencies.map((o) => o.id);
  if (allIds.length) {
    const multi = names[ni++];
    const from = new Date();
    from.setDate(from.getDate() - 5);
    const through = new Date();
    through.setMonth(through.getMonth() + 1);
    const row = await prisma.contractor.create({
      data: {
        token: crypto.randomBytes(32).toString('hex'),
        qrToken: 'c_' + crypto.randomBytes(20).toString('hex'),
        fullName: multi.fullName,
        company: 'Sahel Works Ltd',
        phone: '+2348010000001',
        email: `${multi.first.toLowerCase()}.${multi.last.toLowerCase()}.contractor@example.com`,
        organisationId: allIds[0],
        cycle: 'monthly',
        validFrom: from,
        validThrough: through,
        createdById: (agencies[0].users.find((u) => u.role === 'ADMIN') || agencies[0].users[0]).id,
        agencies: { create: allIds.slice(0, Math.min(3, allIds.length)).map((organisationId) => ({ organisationId })) },
      },
    });
    await tag('Contractor', row.id);
    created.contractors += 1;
    const home = agencies[0];
    const locM = await prisma.location.findFirst({ where: { organisationId: home.id, code: DEFENCE_COMPLEX_CODE }, include: { gates: true } });
    const gateM = locM && locM.gates && locM.gates[0];
    const hostM = home.users.find((u) => u.role === 'STAFF' || u.role === 'ADMIN');
    const officerM = home.users.find((u) => u.role === 'GATE');
    if (gateM) {
      const arrived = new Date();
      arrived.setDate(arrived.getDate() - 1);
      arrived.setHours(9, 15, 0, 0);
      const visit = await prisma.contractorVisit.create({
        data: {
          contractorId: row.id,
          organisationId: home.id,
          destination: hostM ? hostM.fullName : 'Protocol office',
          hostId: hostM ? hostM.id : null,
          gateId: gateM.id,
          officerId: officerM ? officerM.id : null,
          arrivedAt: arrived,
          exitedAt: new Date(arrived.getTime() + 5 * 3600000),
          day: new Date(arrived.getFullYear(), arrived.getMonth(), arrived.getDate()),
        },
      });
      await tag('ContractorVisit', visit.id);
      created.visits += 1;
    }
  }
  for (let i = 0; i < Math.min(agencies.length, 4); i++) {
    const org = agencies[i];
    const person = names[ni++];
    const expired = i === 0;
    const terminated = i === 1;
    const validFrom = new Date();
    validFrom.setDate(validFrom.getDate() - (expired ? 40 : 3));
    const validThrough = new Date();
    if (expired) validThrough.setDate(validThrough.getDate() - 5);
    else validThrough.setDate(validThrough.getDate() + 20);
    const admin = org.users.find((u) => u.role === 'ADMIN') || org.users[0];
    const row = await prisma.contractor.create({
      data: {
        token: crypto.randomBytes(32).toString('hex'),
        qrToken: 'c_' + crypto.randomBytes(20).toString('hex'),
        fullName: person.fullName,
        company: terminated ? 'Sunset Facilities' : 'Riverstone Engineering',
        phone: `+23480100${String(1000 + i).slice(-4)}`,
        email: `${person.first.toLowerCase()}.${person.last.toLowerCase()}.ctr@example.com`,
        organisationId: org.id,
        cycle: 'monthly',
        validFrom,
        validThrough,
        isActive: !terminated,
        terminatedAt: terminated ? new Date() : null,
        terminatedReason: terminated ? 'Contract ended early by the agency' : null,
        createdById: admin.id,
        agencies: { create: [{ organisationId: org.id }] },
      },
    });
    await tag('Contractor', row.id);
    created.contractors += 1;
    const loc = await prisma.location.findFirst({ where: { organisationId: org.id, code: DEFENCE_COMPLEX_CODE }, include: { gates: true } });
    const gate = loc && loc.gates && loc.gates[0];
    const officer = org.users.find((u) => u.role === 'GATE');
    if (gate && !expired && !terminated) {
      const host = org.users.find((u) => u.role === 'STAFF' || u.role === 'ADMIN');
      const arrived = new Date();
      arrived.setHours(9, 10, 0, 0);
      const visit = await prisma.contractorVisit.create({
        data: {
          contractorId: row.id,
          organisationId: org.id,
          destination: host ? host.fullName : 'Protocol office',
          hostId: host ? host.id : null,
          gateId: gate.id,
          officerId: officer ? officer.id : null,
          arrivedAt: arrived,
          exitedAt: i === 0 ? new Date(arrived.getTime() + 4 * 3600000) : null,
          day: new Date(arrived.getFullYear(), arrived.getMonth(), arrived.getDate()),
        },
      });
      await tag('ContractorVisit', visit.id);
      created.visits += 1;
    }
    if (officer && loc) {
      const destOrgs = agencies.slice(i, i + 1).concat(agencies[(i + 1) % agencies.length]).filter((o, idx, arr) => arr.findIndex((x) => x.id === o.id) === idx);
      const dispatch = await prisma.dispatch.create({
        data: {
          courierName: `${person.first} Courier`,
          courierCompany: 'NIPOST',
          courierPhone: `+23480200${String(2000 + i).slice(-4)}`,
          notes: 'Demo pouch',
          createdById: officer.id,
          gateId: gate ? gate.id : null,
          status: 'REGISTERED',
          items: { create: [{ description: 'Sealed letters', quantity: 2 }] },
          destinations: {
            create: destOrgs.map((o) => ({
              organisationId: o.id,
              hostId: (o.users.find((u) => u.role === 'STAFF') || o.users.find((u) => u.role === 'ADMIN') || {}).id || null,
              status: 'APPROVED',
            })),
          },
        },
      });
      await tag('Dispatch', dispatch.id);
      created.dispatches += 1;
    }
  }
  return created;
}

async function seed(demoPassword) {
  const orgs = await prisma.organisation.findMany({
    include: {
      users: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          organisationId: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const agencies = orgs
    .filter((o) => o.users.some((u) => AGENCY_ROLES.includes(u.role)))
    .sort((a, b) => {
      const c = new Date(a.createdAt) - new Date(b.createdAt);
      return c !== 0 ? c : String(a.id).localeCompare(String(b.id));
    });
  if (!agencies.length) {
    console.log('No agencies with admin/staff/gate users were found. Nothing to seed.');
    return { agencies: 0 };
  }

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const platformOfficers = await ensurePlatformOfficers(passwordHash);
  await applyLoginGrid(orgs);
  const allotment = partitionPeople(agencies);
  const report = [];

  for (const org of agencies) {
    const rng = mulberry32(hashSeed(org.id + org.code + ':core'));
    const inviteRng = mulberry32(hashSeed(org.id + org.code + ':invites'));
    const attRng = mulberry32(hashSeed(org.id + org.code + ':attendance'));
    const existingStaff = org.users.filter((u) => u.role === 'STAFF' && u.isActive);
    const admins = org.users.filter((u) => u.role === 'ADMIN' && u.isActive);
    const officers = org.users.filter((u) => u.role === 'GATE' && u.isActive);
    const { locations, gates, created: locCreated } = await ensureLocations(org, officers, rng);
    const names = allotment.get(org.id) || { staff: [], visitors: [] };
    const staff = await ensureStaff(org, passwordHash, names.staff);
    const hosts = staff.all.concat(existingStaff, admins).filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);
    // Attendance subjects: demo + existing STAFF, plus agency admins and officers (tagged so reset can drop those rows).
    const subjects = staff.all.concat(existingStaff, admins, officers).filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);
    const visits = await seedInvitesAndVisits(org, hosts.length ? hosts : subjects, gates, officers, inviteRng, names.visitors);
    const attendance = await seedAttendance(org, subjects, officers, gates, attRng);
    const alerts = await seedAlertsForAdmins(org, admins, rng);

    report.push({
      organisation: org.name,
      code: org.code,
      locationsCreated: locCreated.locations,
      gatesCreated: locCreated.gates,
      assignmentsTagged: locCreated.assignments,
      locationsUsed: locations.length,
      gatesUsed: gates.length,
      staffCreated: staff.created.length,
      staffReused: staff.reused.length,
      staffEmails: staff.all.map((u) => u.email),
      invites: visits.invites,
      visitors: visits.visitors,
      gateVisits: visits.visits,
      ringCalls: visits.rings,
      notifications: visits.notifications + alerts,
      attendanceRows: attendance.created,
      attendanceSkipped: attendance.skipped,
    });
  }

  const extras = await seedContractorsAndDispatches(agencies, report, passwordHash);
  return { agencies: agencies.length, report, platformOfficers, extras };
}

async function main() {
  if (process.env.SEED_DEMO !== 'YES') {
    console.error('Refusing to run. Re-run with SEED_DEMO=YES if you want to seed or reset demo data.');
    process.exit(1);
  }

  const reset = flagReset();
  try {
    if (reset) {
      const summary = await resetDemo();
      console.log('\nDemo data reset complete (protected users were not touched).');
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const demoPassword = readDemoPassword();
    const result = await seed(demoPassword);
    console.log('\nDemo seed complete.');
    console.log(`Agencies processed: ${result.agencies}`);
    if (result.platformOfficers) {
      console.log(`Platform officers created: ${result.platformOfficers.created.length}  reused: ${result.platformOfficers.reused.length}`);
    }
    if (result.extras) {
      console.log(`Contractors: ${result.extras.contractors}  contractor visits: ${result.extras.visits}  dispatches: ${result.extras.dispatches}`);
    }
    console.log('Demo staff password: taken from DEMO_PASSWORD (not stored in the script).');
    if (result.report) {
      for (const row of result.report) {
        console.log(`\n— ${row.organisation} (${row.code})`);
        console.log(`  Locations created: ${row.locationsCreated}  (used: ${row.locationsUsed})`);
        console.log(`  Gates created: ${row.gatesCreated}  (used: ${row.gatesUsed})`);
        console.log(`  Demo staff created: ${row.staffCreated}  reused: ${row.staffReused}`);
        if (row.staffEmails.length) console.log(`  Staff emails:\n    ${row.staffEmails.join('\n    ')}`);
        console.log(`  Invites: ${row.invites}  visitors: ${row.visitors}  gate visits: ${row.gateVisits}`);
        console.log(`  Ring calls: ${row.ringCalls}  notifications: ${row.notifications}`);
        console.log(`  Attendance rows: ${row.attendanceRows}  (skipped existing: ${row.attendanceSkipped})`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
