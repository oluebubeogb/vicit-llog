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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Ctx = { brand: PublicBranding; refresh: () => Promise<void>; set: (b: Partial<PublicBranding>) => void; ready: boolean };
const BrandCtx = createContext<Ctx>({
  brand: DEFAULT_BRANDING,
  refresh: async () => {},
  set: () => {},
  ready: false,
});

export const useBrand = () => useContext(BrandCtx);

function persist(b: PublicBranding) {
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ data: b, vars: brandCssVars(b) }));
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

  const commit = useCallback((b: PublicBranding) => {
    setBrand(b);
    applyBranding(b);
    persist(b);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/branding/public`, { cache: 'no-store' });
      if (res.ok) commit({ ...DEFAULT_BRANDING, ...(await res.json()) });
    } catch {
      /* offline — keep cached */
    } finally {
      setReady(true);
    }
  }, [commit]);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || 'null');
      if (cached?.data) {
        setBrand({ ...DEFAULT_BRANDING, ...cached.data });
        applyBranding({ ...DEFAULT_BRANDING, ...cached.data });
      }
    } catch {
      /* ignore */
    }
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('vicit-brand-updated', onUpdate);
    return () => window.removeEventListener('vicit-brand-updated', onUpdate);
  }, [refresh]);

  const set = useCallback((p: Partial<PublicBranding>) => commit({ ...brand, ...p }), [brand, commit]);

  useEffect(() => {
    if (brand.name && typeof document !== 'undefined') {
      const base = brand.name;
      if (!document.title || document.title === 'Vicit Llog' || !document.title.includes(base)) document.title = base;
    }
  }, [brand.name]);

  return (
    <BrandCtx.Provider value={{ brand, refresh, set, ready }}>
      {/* Every framer-motion animation follows the OS "reduce motion" setting */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </BrandCtx.Provider>
  );
}
