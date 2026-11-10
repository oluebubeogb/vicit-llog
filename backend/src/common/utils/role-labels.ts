/** User-facing role labels. DB enums stay GLOBAL_ADMIN / GLOBAL_GATE. */
export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  GLOBAL_ADMIN: 'Super Admin II',
  GLOBAL_GATE: 'Super Gate Officer',
  ADMIN: 'Agency Admin',
  STAFF: 'Staff',
  GATE: 'Gate Officer',
};

export function roleLabel(role?: string | null): string {
  if (!role) return 'Unknown';
  return ROLE_LABEL[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
