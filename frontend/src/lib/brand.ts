/** Brand colour engine: turns one hex colour into a 50–950 scale of CSS variables. */

export const APP_VERSION = '1.0.1-v20';

export type LoginBranding = {
  logoUrl?: string | null;
  logoWidth?: string | null;
  watermarkUrl?: string | null;
  watermarkWidth?: string | null;
  watermarkHeight?: string | null;
  watermarkOpacity?: number | null;
  headline?: string | null;
  title?: string | null;
  showLogo?: boolean;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type PublicBranding = {
  name: string;
  appName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** Text on primary/brand surfaces. Null/unset = auto (white or dark for contrast). */
  primaryTextColor?: string | null;
  emailIconBg?: string | null;
  updatedAt?: string | null;
  footerCredit?: string | null;
  footerCreditEnabled?: boolean;
  footerCreditMobileMode?: 'FLOATING' | 'STATIC' | null;
  assetVersion?: string | null;
  login?: LoginBranding | null;
  agencies?: Array<{
    id: string;
    name: string;
    shortName?: string | null;
    code?: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    loginOrder?: number;
    loginVisible?: boolean;
    loginTileColor?: string | null;
  }>;
};

export const DEFAULT_BRANDING: PublicBranding = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog',
  logoUrl: null,
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  primaryTextColor: null,
  emailIconBg: '#ffffff',
  footerCredit: "Powered by CISTECH's Vicit 1.0.1",
  footerCreditEnabled: true,
  footerCreditMobileMode: 'FLOATING',
  assetVersion: APP_VERSION,
  login: null,
};

/** Used while branding is unknown so the default Vicit mark/colours never flash. */
export const NEUTRAL_BRANDING: PublicBranding = {
  name: '',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog',
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  primaryTextColor: null,
  emailIconBg: '#ffffff',
  footerCredit: "Powered by CISTECH's Vicit 1.0.1",
  footerCreditEnabled: true,
  footerCreditMobileMode: 'FLOATING',
  assetVersion: APP_VERSION,
  login: null,
};

export const AUTO_ON_PRIMARY_LIGHT = '#ffffff';
export const AUTO_ON_PRIMARY_DARK = '#0f172a';
export const CONTRAST_MIN = 4.5;
export const LIGHT_BRAND_LUMA = 0.82;

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// mix ratios relative to the base colour (which sits at 600)
const MIX: Record<number, [string, number]> = {
  50: ['w', 0.95],
  100: ['w', 0.89],
  200: ['w', 0.77],
  300: ['w', 0.6],
  400: ['w', 0.36],
  500: ['w', 0.16],
  600: ['w', 0],
  700: ['b', 0.16],
  800: ['b', 0.3],
  900: ['b', 0.44],
  950: ['b', 0.62],
};

export function hexToRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function channelLin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex?: string | null): number {
  const rgb = hexToRgb(hex) || [37, 99, 235];
  return 0.2126 * channelLin(rgb[0]) + 0.7152 * channelLin(rgb[1]) + 0.0722 * channelLin(rgb[2]);
}

export function contrastRatio(a?: string | null, b?: string | null): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or slate-900, whichever contrasts better against the brand background. */
export function autoOnPrimaryColor(bg?: string | null): string {
  const white = contrastRatio(bg, AUTO_ON_PRIMARY_LIGHT);
  const dark = contrastRatio(bg, AUTO_ON_PRIMARY_DARK);
  return white >= dark ? AUTO_ON_PRIMARY_LIGHT : AUTO_ON_PRIMARY_DARK;
}

export function resolveOnPrimaryColor(bg?: string | null, explicit?: string | null): string {
  const rgb = hexToRgb(explicit);
  if (rgb) return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  return autoOnPrimaryColor(bg);
}

export function isLightBrand(hex?: string | null): boolean {
  return relativeLuminance(hex) >= LIGHT_BRAND_LUMA;
}

export function scale(hex: string): Record<number, [number, number, number]> {
  const base = hexToRgb(hex) || [37, 99, 235];
  const out: Record<number, [number, number, number]> = {};
  for (const s of STEPS) {
    const [mode, amt] = MIX[s];
    out[s] = base.map((c) =>
      Math.round(mode === 'w' ? c + (255 - c) * amt : c * (1 - amt)),
    ) as [number, number, number];
  }
  return out;
}

export function brandCssVars(b: PublicBranding): Record<string, string> {
  const vars: Record<string, string> = {};
  const primary = b.primaryColor || DEFAULT_BRANDING.primaryColor!;
  const p = scale(primary);
  const a = scale(b.secondaryColor || DEFAULT_BRANDING.secondaryColor!);
  for (const s of STEPS) {
    vars[`--brand-${s}`] = p[s].join(' ');
    vars[`--accent-${s}`] = a[s].join(' ');
  }
  const on = resolveOnPrimaryColor(primary, b.primaryTextColor);
  const onRgb = hexToRgb(on) || [255, 255, 255];
  vars['--brand-on-primary'] = onRgb.join(' ');
  const light = isLightBrand(primary) || relativeLuminance('#' + p[600].map((v) => v.toString(16).padStart(2, '0')).join('')) >= LIGHT_BRAND_LUMA;
  vars['--brand-surface-shadow'] = light
    ? '0 0 0 1px rgb(15 23 42 / 0.16), 0 8px 24px -10px rgb(15 23 42 / 0.18)'
    : '0 10px 30px -8px rgb(var(--brand-600) / 0.45)';
  vars['--brand-surface-shadow-hover'] = light
    ? '0 0 0 1px rgb(15 23 42 / 0.2), 0 14px 34px -10px rgb(15 23 42 / 0.22)'
    : '0 14px 34px -10px rgb(var(--brand-600) / 0.6)';
  return vars;
}

export function applyBranding(b: PublicBranding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(brandCssVars(b))) root.style.setProperty(k, v);
  const theme = b.primaryColor || DEFAULT_BRANDING.primaryColor!;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme;
  const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
  if (apple && b.name) apple.content = b.name;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function assetVersion(b?: PublicBranding | null): string {
  return b?.assetVersion || APP_VERSION;
}

export function versionedAsset(path: string, version?: string | null): string {
  const v = version || APP_VERSION;
  if (!path) return path;
  return path + (path.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(v);
}

export function logoSrc(logoUrl?: string | null, opts?: { fallback?: boolean; version?: string | null }): string | null {
  if (!logoUrl) return opts?.fallback === false ? null : versionedAsset('/icon-192.png', opts?.version);
  const src = /^https?:\/\//.test(logoUrl) ? logoUrl : `${API_URL}${logoUrl}`;
  return versionedAsset(src, opts?.version);
}

export const BRAND_CACHE_KEY = 'vicit_brand';
export const LOGIN_BRAND_CACHE_KEY = 'vicit_login_brand';

export function identityScope() {
  if (typeof window === 'undefined') return 'public';
  try {
    const user = JSON.parse(localStorage.getItem('vicit_user') || 'null');
    const token = localStorage.getItem('vicit_token');
    if (!token || !user) return 'public';
    const role = String(user.role || '');
    const org = user.organisationId || (user.organisation && user.organisation.id) || 'unknown';
    if (['ADMIN', 'STAFF', 'GATE'].includes(role)) return 'agency:' + org;
    if (['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'].includes(role)) return 'platform:' + org;
    return 'platform';
  } catch {
    return 'public';
  }
}

export function readCachedBrand(scope?: string): PublicBranding | null {
  if (typeof window === 'undefined') return null;
  try {
    const target = scope || identityScope();
    const key = target === 'public' ? LOGIN_BRAND_CACHE_KEY : BRAND_CACHE_KEY;
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached?.data && (target === 'public' || cached.scope === target)) {
      return { ...NEUTRAL_BRANDING, ...cached.data };
    }
    // Authenticated users may still have a previous org cache with matching scope in BRAND_CACHE_KEY
    if (target !== 'public') {
      const org = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || 'null');
      if (org?.data && org.scope === target) return { ...NEUTRAL_BRANDING, ...org.data };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Inline script run before paint so cached brand colours apply with no flash of the default logo. */
export const BRAND_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('vicit_token');var u=JSON.parse(localStorage.getItem('vicit_user')||'null');var role=u&&u.role;var org=u&&(u.organisationId||(u.organisation&&u.organisation.id)||'unknown');var scope=!t||!u?'public':(['ADMIN','STAFF','GATE'].indexOf(role)>=0?'agency:'+org:(['SUPER_ADMIN','GLOBAL_ADMIN','GLOBAL_GATE'].indexOf(role)>=0?'platform:'+org:'platform'));var key=scope==='public'?'${LOGIN_BRAND_CACHE_KEY}':'${BRAND_CACHE_KEY}';var b=JSON.parse(localStorage.getItem(key)||'null');if(!b||!b.vars)return;if(scope!=='public'&&b.scope!==scope)return;var r=document.documentElement;for(var k in b.vars){r.style.setProperty(k,b.vars[k]);}r.setAttribute('data-brand-ready','1');}catch(e){}})();`;
