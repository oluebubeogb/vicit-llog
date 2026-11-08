'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/api';
import BrandMark from '@/components/BrandMark';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (token && user) {
      if (user.role === 'GATE') router.replace('/gate');
      else router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5">
      <BrandMark size={64} className="animate-float" />
      <div className="h-1 w-28 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-brand-400 to-accent-600" />
      </div>
    </div>
  );
}
