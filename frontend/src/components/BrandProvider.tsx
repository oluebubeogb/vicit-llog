'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  applyBranding,
  brandCssVars,
  BRAND_CACHE_KEY,
  DEFAULT_BRANDING,
  PublicBranding,
} from '@/lib/brand';
import { api, getToken, getUser } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Ctx = { brand: PublicBranding; refresh: () => Promise<void>; set: (b: Partial<PublicBranding>) => void; ready: boolean };
const BrandCtx = createContext<Ctx>({
  brand: DEFAULT_BRANDING,
  refresh: async () => {},
  set: () => {},
  ready: false,
});

export const useBrand = () => useContext(BrandCtx);

function identityScope() {
  const user = getUser();
  if (!getToken() || !user) return 'public';
  if (['ADMIN', 'STAFF', 'GATE'].includes(String(user.role))) return `agency:${user.organisationId || user.organisation?.id || 'unknown'}`;
  if (['SUPER_ADMIN','GLOBAL_ADMIN','GLOBAL_GATE'].includes(String(user.role))) return `platform:${user.organisationId || user.organisation?.id || 'default'}`;
  return 'platform';
}

function persist(b: PublicBranding, scope: string) {
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ data: b, vars: brandCssVars(b), scope }));
  } catch {
    /* private mode */
  }
}

/**
 * Applies Branding & Settings everywhere: brand/accent colour scales (CSS variables),
 * organisation name, logo, theme-color. Cached in localStorage and applied before paint.
 */
export default function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<PublicBranding>(DEFAULT_BRANDING);
  const [ready, setReady] = useState(false);

  const commit = useCallback((b: PublicBranding, scope = identityScope()) => {
    setBrand(b);
    applyBranding(b);
    persist(b, scope);
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    const user = getUser();
    const role = String(user?.role || '');
    try {
      if (token) {
        // The authenticated endpoint returns the user's agency identity, or the platform
        // owner's branding for platform operators. The server resolves the scope from JWT.
        const agency = await api.branding();
        commit({
          ...DEFAULT_BRANDING,
          ...agency,
          name: agency?.name || DEFAULT_BRANDING.name,
          appName: DEFAULT_BRANDING.appName,
          logoUrl: agency?.logoUrl || null,
          primaryColor: agency?.primaryColor || DEFAULT_BRANDING.primaryColor,
          secondaryColor: agency?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
          emailIconBg: agency?.emailIconBg || DEFAULT_BRANDING.emailIconBg,
        }, identityScope());
      } else {
        const res = await fetch(`${API_URL}/branding/public`, { cache: 'no-store' });
        if (res.ok) commit({ ...DEFAULT_BRANDING, ...(await res.json()) }, 'public');
      }
    } catch {
      // Do not leave a previous agency's branding visible after an account switch.
      if (token) commit({ ...DEFAULT_BRANDING }, identityScope());
      else commit({ ...DEFAULT_BRANDING }, 'public');
    } finally {
      setReady(true);
    }
  }, [commit]);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || 'null');
      // Scope the cache to the logged-in agency/platform to prevent cross-agency
      // branding flashes when different accounts use the same browser.
      if (cached?.data && cached.scope === identityScope()) {
        setBrand({ ...DEFAULT_BRANDING, ...cached.data });
        applyBranding({ ...DEFAULT_BRANDING, ...cached.data });
      }
    } catch {
      /* ignore */
    }
    refresh();
    const onBrandUpdate = () => refresh();
    const onAuthUpdate = () => {
      // Clear the previous identity immediately; a new agency must never briefly
      // inherit the branding cached for the account that was just signed out.
      const scope = identityScope();
      commit({ ...DEFAULT_BRANDING }, scope);
      refresh();
    };
    window.addEventListener('vicit-brand-updated', onBrandUpdate);
    window.addEventListener('vicit-auth-updated', onAuthUpdate);
    window.addEventListener('storage', onAuthUpdate);
    return () => {
      window.removeEventListener('vicit-brand-updated', onBrandUpdate);
      window.removeEventListener('vicit-auth-updated', onAuthUpdate);
      window.removeEventListener('storage', onAuthUpdate);
    };
  }, [refresh, commit]);

  const set = useCallback((p: Partial<PublicBranding>) => commit({ ...brand, ...p }), [brand, commit]);

  useEffect(() => {
    if (brand.name && typeof document !== 'undefined') {
      const base = brand.name;
      if (document.title !== 'Not found' && (!document.title || document.title === 'Vicit Llog' || !document.title.includes(base))) document.title = base;
    }
  }, [brand.name]);

  return (
    <BrandCtx.Provider value={{ brand, refresh, set, ready }}>
      {/* Every framer-motion animation follows the OS "reduce motion" setting */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </BrandCtx.Provider>
  );
}
