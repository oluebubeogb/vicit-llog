/** Brand colour engine: turns one hex colour into a 50–950 scale of CSS variables. */

export type PublicBranding = {
  name: string;
  appName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  emailIconBg?: string | null;
  updatedAt?: string | null;
};

export const DEFAULT_BRANDING: PublicBranding = {
  name: 'Vicit Llog',
  appName: 'Vicit Llog',
  logoUrl: null,
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
};

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
  const p = scale(b.primaryColor || DEFAULT_BRANDING.primaryColor!);
  const a = scale(b.secondaryColor || DEFAULT_BRANDING.secondaryColor!);
  for (const s of STEPS) {
    vars[`--brand-${s}`] = p[s].join(' ');
    vars[`--accent-${s}`] = a[s].join(' ');
  }
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

export function logoSrc(logoUrl?: string | null): string {
  if (!logoUrl) return '/icon-192.png';
  return /^https?:\/\//.test(logoUrl) ? logoUrl : `${API_URL}${logoUrl}`;
}

export const BRAND_CACHE_KEY = 'vicit_brand';

/** Inline script run before paint so cached brand colours apply with no flash. */
export const BRAND_BOOT_SCRIPT = `(function(){try{var b=JSON.parse(localStorage.getItem('${BRAND_CACHE_KEY}')||'null');if(!b||!b.vars)return;var r=document.documentElement;for(var k in b.vars){r.style.setProperty(k,b.vars[k]);}}catch(e){}})();`;
