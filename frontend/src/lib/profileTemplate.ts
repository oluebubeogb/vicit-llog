/**
 * v25 profile header templates — one platform-wide set, edited by the Super Admin.
 * Pure (no imports) so it can be unit-tested with plain Node and reused anywhere.
 *
 * A template is text with [placeholders], e.g. "[rank] [fullname]" or "[fullname] - [rank]".
 * Rendering substitutes values, then cleans up after empty ones: an empty placeholder is
 * dropped together with an adjacent separator (" - ", " · ", " | ", ",", "/"), spaces are
 * collapsed, empty brackets removed, and a line that ends up empty renders as "" (hidden).
 * Raw [tokens] and dangling separators never reach the screen.
 */

export type ProfileTemplates = {
  /** 2 = v29 token names ([portfolio] is the system field; [department] is free for a custom field). */
  tokens?: number;
  dashboard: { title: string; subtitle: string; chips: string[] };
  hostCard: { title: string; subtitle: string };
  myProfile: { title: string; subtitle: string; badges: string[]; meta: string };
};

/** Defaults reproduce the pre-v25 layout exactly. */
export const PROFILE_TOKENS_VERSION = 2;

export const DEFAULT_PROFILE_TEMPLATES: ProfileTemplates = {
  tokens: PROFILE_TOKENS_VERSION,
  dashboard: { title: '[fullname]', subtitle: '[agency] · [role]', chips: [] },
  hostCard: { title: '[fullname]', subtitle: '[agency]' },
  myProfile: { title: '[fullname]', subtitle: '[email]', badges: ['[role]'], meta: '[agency]' },
};

export const SYSTEM_PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: 'fullname', label: 'Full name' },
  { token: 'firstname', label: 'First name' },
  { token: 'lastname', label: 'Last name' },
  { token: 'email', label: 'Email' },
  { token: 'phone', label: 'Phone' },
  { token: 'role', label: 'Role' },
  { token: 'agency', label: 'Agency' },
  { token: 'agencycode', label: 'Agency code' },
  { token: 'portfolio', label: 'Portfolio' },
];

/** "Rank" → "rank", "Service No." → "serviceno" (same rule as the backend). */
export function placeholderSlug(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function mergeTemplates(raw: any): ProfileTemplates {
  const D = DEFAULT_PROFILE_TEMPLATES;
  const r = raw && typeof raw === 'object' ? raw : {};
  // Templates saved before v29 used [department] for the system portfolio field. Rename it once,
  // so [department] can belong to a custom field from then on.
  const legacy = Object.keys(r).length > 0 && r.tokens !== PROFILE_TOKENS_VERSION;
  const up = (t: string) => (legacy ? migrateLegacyTokens(t) : t);
  const str = (v: any, d: string) => (typeof v === 'string' ? up(v) : d);
  const arr = (v: any, d: string[]) => (Array.isArray(v) ? v.map((x) => up(String(x))) : d);
  return {
    tokens: PROFILE_TOKENS_VERSION,
    dashboard: { title: str(r.dashboard?.title, D.dashboard.title), subtitle: str(r.dashboard?.subtitle, D.dashboard.subtitle), chips: arr(r.dashboard?.chips, D.dashboard.chips) },
    hostCard: { title: str(r.hostCard?.title, D.hostCard.title), subtitle: str(r.hostCard?.subtitle, D.hostCard.subtitle) },
    myProfile: { title: str(r.myProfile?.title, D.myProfile.title), subtitle: str(r.myProfile?.subtitle, D.myProfile.subtitle), badges: arr(r.myProfile?.badges, D.myProfile.badges), meta: str(r.myProfile?.meta, D.myProfile.meta) },
  };
}

/** Pre-v29 templates: the system [department] placeholder (any spacing / case) becomes [portfolio]. */
export function migrateLegacyTokens(t: string): string {
  return String(t).replace(/\[([^\[\]]*)\]/g, (m, name) => (placeholderSlug(name) === 'department' ? '[portfolio]' : m));
}

function fieldText(v: any): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(', ');
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return String(v).trim();
}

/**
 * Placeholder values for a person. Accepts the shapes the app already has:
 * /users/me (organisation{name,code}, customFieldsList), /users/public/:id
 * (organisationName, organisationCode, customFields as a labelled list) and the stored user.
 */
export function profileVars(u: any, opts: { roleText?: (role?: string | null) => string } = {}): Record<string, string> {
  if (!u) return {};
  const full = String(u.fullName || '').trim();
  const parts = full.split(/\s+/).filter(Boolean);
  const vars: Record<string, string> = {
    fullname: full,
    firstname: parts[0] || '',
    lastname: parts.length > 1 ? parts[parts.length - 1] : '',
    email: String(u.email || '').trim(),
    phone: String(u.phone || '').trim(),
    role: u.role ? (opts.roleText ? opts.roleText(u.role) : String(u.role)) : '',
    agency: String(u.organisation?.name || u.organisationName || u.orgName || '').trim(),
    agencycode: String(u.organisation?.code || u.organisationCode || u.orgCode || '').trim(),
    portfolio: String(u.portfolio || '').trim(),
  };
  const list = Array.isArray(u.customFieldsList) ? u.customFieldsList : Array.isArray(u.customFields) ? u.customFields : null;
  if (list) {
    for (const f of list) {
      const val = fieldText(f?.value);
      for (const k of [placeholderSlug(f?.key), placeholderSlug(f?.label)]) if (k && !(k in vars)) vars[k] = val;
    }
  } else if (u.customFields && typeof u.customFields === 'object') {
    for (const [k, v] of Object.entries(u.customFields)) { const s = placeholderSlug(k); if (s && !(s in vars)) vars[s] = fieldText(v); }
  }
  return vars;
}

const SEP = String.raw`(?:\s*(?:-|–|—|·|\||,|/)\s*)`;
const EMPTY = '\u0000';

/** Substitute placeholders and clean up after empty ones. Returns "" when nothing is left. */
export function renderTemplate(template: string | null | undefined, vars: Record<string, string>): string {
  if (!template) return '';
  let s = String(template).replace(/\[([^\[\]]*)\]/g, (_m, name) => {
    const v = vars[placeholderSlug(name)];
    return v && String(v).trim() ? String(v).trim().replace(/\u0000/g, '') : EMPTY;
  });
  // Empty placeholder between two separators keeps one separator; next to one separator drops it.
  const both = new RegExp(`(${SEP})${EMPTY}${SEP}`, 'g');
  const before = new RegExp(`${SEP}${EMPTY}`, 'g');
  const after = new RegExp(`${EMPTY}${SEP}`, 'g');
  let prev;
  do {
    prev = s;
    s = s.replace(both, '$1').replace(before, '').replace(after, '');
  } while (s !== prev);
  s = s.split(EMPTY).join('');
  // Empty brackets left behind, e.g. "Amino ( )"
  s = s.replace(/\(\s*\)|\{\s*\}/g, '');
  // Separators stranded at either end, or doubled up
  const lead = new RegExp(`^${SEP}+`);
  const trail = new RegExp(`${SEP}+$`);
  s = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(lead, '').replace(trail, '').trim();
  return s;
}

export function renderList(templates: string[] | null | undefined, vars: Record<string, string>): string[] {
  return (templates || []).map((t) => renderTemplate(t, vars)).filter(Boolean);
}
