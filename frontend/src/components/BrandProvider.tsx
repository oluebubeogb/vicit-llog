'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  applyBranding,
  brandCssVars,
  BRAND_CACHE_KEY,
  DEFAULT_BRANDING,
  identityScope,
  LOGIN_BRAND_CACHE_KEY,
  NEUTRAL_BRANDING,
  PublicBranding,
  readCachedBrand,
} from '@/lib/brand';
import { api, getToken, getUser } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Ctx = { brand: PublicBranding; refresh: () => Promise<void>; set: (b: Partial<PublicBranding>) => void; ready: boolean };
const BrandCtx = createContext<Ctx>({
  brand: NEUTRAL_BRANDING,
  refresh: async () => {},
  set: () => {},
  ready: false,
});

export const useBrand = () => useContext(BrandCtx);

function persist(b: PublicBranding, scope: string) {
  try {
    const packed = JSON.stringify({ data: b, vars: brandCssVars({ ...DEFAULT_BRANDING, ...b }), scope });
    if (scope === 'public') localStorage.setItem(LOGIN_BRAND_CACHE_KEY, packed);
    else localStorage.setItem(BRAND_CACHE_KEY, packed);
  } catch {
    /* private mode */
  }
}

function initialBrand(): PublicBranding {
  if (typeof window === 'undefined') return NEUTRAL_BRANDING;
  return readCachedBrand() || NEUTRAL_BRANDING;
}

/**
 * Applies Branding & Settings everywhere. Cached branding is applied before paint
 * and used as the first React state so the default Vicit logo/colours never flash.
 */
export default function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<PublicBranding>(initialBrand);
  const [ready, setReady] = useState(false);

  const commit = useCallback((b: PublicBranding, scope = identityScope()) => {
    setBrand(b);
    applyBranding({ ...DEFAULT_BRANDING, ...b, primaryColor: b.primaryColor || DEFAULT_BRANDING.primaryColor, secondaryColor: b.secondaryColor || DEFAULT_BRANDING.secondaryColor });
    persist(b, scope);
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    try {
      if (token) {
        const agency = await api.branding();
        commit({
          ...DEFAULT_BRANDING,
          ...agency,
          name: agency?.name || DEFAULT_BRANDING.name,
          appName: DEFAULT_BRANDING.appName,
          logoUrl: agency?.logoUrl || null,
          primaryColor: agency?.primaryColor || DEFAULT_BRANDING.primaryColor,
          secondaryColor: agency?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
          primaryTextColor: agency?.primaryTextColor ?? DEFAULT_BRANDING.primaryTextColor,
          emailIconBg: agency?.emailIconBg || DEFAULT_BRANDING.emailIconBg,
          footerCredit: agency?.footerCredit ?? DEFAULT_BRANDING.footerCredit,
          footerCreditEnabled: agency?.footerCreditEnabled !== false,
          assetVersion: agency?.assetVersion || DEFAULT_BRANDING.assetVersion,
        }, identityScope());
      } else {
        const res = await fetch(`${API_URL}/branding/public`, { cache: 'no-store' });
        if (res.ok) {
          const pub = await res.json();
          const login = pub.login || {};
          commit({
            ...DEFAULT_BRANDING,
            ...pub,
            name: login.headline || pub.name || DEFAULT_BRANDING.name,
            logoUrl: login.logoUrl || pub.logoUrl || null,
            primaryColor: login.primaryColor || pub.primaryColor || DEFAULT_BRANDING.primaryColor,
            secondaryColor: login.secondaryColor || pub.secondaryColor || DEFAULT_BRANDING.secondaryColor,
            login,
            footerCredit: pub.footerCredit ?? DEFAULT_BRANDING.footerCredit,
            footerCreditEnabled: pub.footerCreditEnabled !== false,
            assetVersion: pub.assetVersion || DEFAULT_BRANDING.assetVersion,
          }, 'public');
        }
      }
    } catch {
      const cached = readCachedBrand(identityScope());
      if (cached) commit(cached, identityScope());
    } finally {
      setReady(true);
    }
  }, [commit]);

  useEffect(() => {
    const cached = readCachedBrand();
    if (cached) {
      setBrand(cached);
      if (cached.primaryColor) applyBranding({ ...DEFAULT_BRANDING, ...cached });
    }
    refresh();
    const onBrandUpdate = () => refresh();
    const onAuthUpdate = () => {
      const scope = identityScope();
      const next = readCachedBrand(scope);
      if (next) commit(next, scope);
      else setBrand(NEUTRAL_BRANDING);
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

  return (
    <BrandCtx.Provider value={{ brand, refresh, set, ready }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </BrandCtx.Provider>
  );
}
