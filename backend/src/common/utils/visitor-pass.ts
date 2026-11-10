import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { localDayKey } from './attendance-day';
import { normalizeEmail, normalizePhone } from './access';

export function newPassToken() {
  return 'p_' + randomBytes(20).toString('hex');
}

function dayBounds(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end = new Date(`${dayKey}T23:59:59.999Z`);
  // expectedAt is stored as absolute Date; also compare createdAt
  return { start, end, key: dayKey };
}

/** Calendar day of an invite/visit in the app timezone. */
export function visitDayKey(visitor: { createdAt?: Date; invite?: { expectedAt?: Date | null; createdAt?: Date } }) {
  const when = visitor.invite?.expectedAt || visitor.invite?.createdAt || visitor.createdAt || new Date();
  return localDayKey(when);
}

/**
 * Share one pass token across every same-day invite for the same person (email or phone).
 * Returns the token and every linked visitor id.
 */
export async function linkSameDayVisits(prisma: PrismaService, visitorId: string) {
  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    include: { invite: { select: { id: true, expectedAt: true, createdAt: true, passphrase: true, token: true } } },
  });
  if (!visitor) return { passToken: null as string | null, visitorIds: [] as string[], visitors: [] as any[] };

  const email = normalizeEmail(visitor.email);
  const phone = normalizePhone(visitor.phone);
  const day = visitDayKey(visitor);
  const { start, end } = dayBounds(day);

  const or: any[] = [];
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
  if (phone) {
    or.push({ phone });
    // loose match on last 10 digits
    const tail = phone.replace(/\D/g, '').slice(-10);
    if (tail.length >= 10) or.push({ phone: { contains: tail } });
  }

  let candidates: any[] = [];
  if (or.length) {
    candidates = await prisma.visitor.findMany({
      where: {
        OR: or,
        invite: {
          OR: [
            { expectedAt: { gte: start, lte: end } },
            { expectedAt: null, createdAt: { gte: start, lte: end } },
          ],
        },
      },
      include: { invite: { select: { id: true, expectedAt: true, createdAt: true, passphrase: true, token: true, purpose: true, organisationId: true, locationId: true, hostId: true } } },
    });
    candidates = candidates.filter((v) => visitDayKey(v) === day);
  }
  if (!candidates.some((v) => v.id === visitor.id)) {
    candidates = [visitor, ...candidates];
  }

  const existing = candidates.find((v) => v.passToken)?.passToken || visitor.passToken || newPassToken();
  const ids = [...new Set(candidates.map((v) => v.id))];
  await prisma.visitor.updateMany({ where: { id: { in: ids }, OR: [{ passToken: null }, { passToken: { not: existing } }] }, data: { passToken: existing } });

  const visitors = await prisma.visitor.findMany({
    where: { OR: [{ passToken: existing }, { id: { in: ids } }] },
    include: {
      invite: {
        include: {
          host: { select: { id: true, fullName: true, email: true, phone: true } },
          organisation: { select: { id: true, name: true, code: true } },
        },
      },
      gateVisits: {
        include: { gate: { select: { name: true, sequence: true, locationId: true } }, officer: { select: { fullName: true } }, particulars: true },
        orderBy: { occurredAt: 'asc' },
      },
    },
  });
  const sameDay = visitors.filter((v) => visitDayKey(v) === day);
  return { passToken: existing, visitorIds: sameDay.map((v) => v.id), visitors: sameDay, day };
}

export async function visitorsForPassToken(prisma: PrismaService, passToken: string) {
  const visitors = await prisma.visitor.findMany({
    where: { passToken },
    include: {
      invite: {
        include: {
          host: { select: { id: true, fullName: true, email: true, phone: true } },
          organisation: { select: { id: true, name: true, code: true } },
        },
      },
      gateVisits: {
        include: { gate: { select: { name: true, sequence: true, locationId: true } }, officer: { select: { fullName: true } }, particulars: true },
        orderBy: { occurredAt: 'asc' },
      },
    },
  });
  if (!visitors.length) return { passToken, visitorIds: [], visitors: [], day: null as string | null };
  const day = visitDayKey(visitors[0]);
  const sameDay = visitors.filter((v) => visitDayKey(v) === day);
  return { passToken, visitorIds: sameDay.map((v) => v.id), visitors: sameDay, day };
}
