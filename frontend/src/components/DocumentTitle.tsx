'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useBrand } from '@/components/BrandProvider';
import { documentTitle } from '@/lib/pageTitle';

export default function DocumentTitle() {
  const pathname = usePathname();
  const { brand } = useBrand();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.title === 'Not found') return;
    document.title = documentTitle(pathname, brand.name, brand.login?.title);
  }, [pathname, brand.name, brand.login?.title]);
  return null;
}
