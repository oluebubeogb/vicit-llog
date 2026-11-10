export const CONTRACTOR_VIEW_ROLES = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'ADMIN', 'GLOBAL_GATE', 'GATE'] as const;
export const CONTRACTOR_MANAGE_ROLES = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'ADMIN'] as const;
export const PLATFORM_ROLES = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'] as const;

export function isPlatformRole(role?: string) {
  return !!role && (PLATFORM_ROLES as readonly string[]).includes(role);
}

export function canViewContractors(role?: string) {
  return !!role && (CONTRACTOR_VIEW_ROLES as readonly string[]).includes(role);
}

export function canManageContractors(role?: string) {
  return !!role && (CONTRACTOR_MANAGE_ROLES as readonly string[]).includes(role);
}

export function normalizeEmail(v?: string | null) {
  const s = String(v || '').trim().toLowerCase();
  return s && s.includes('@') ? s : null;
}

export function normalizePhone(v?: string | null) {
  const s = String(v || '').replace(/[^\d+]/g, '');
  return s.length >= 7 ? s : null;
}
