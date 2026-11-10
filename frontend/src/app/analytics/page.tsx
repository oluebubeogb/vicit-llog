'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, api } from '@/lib/api';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';

export default function AnalyticsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState(false);
  const [agencies, setAgencies] = useState<{ id: string; name: string; code?: string }[]>([]);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    const isPlatform = u.role === 'SUPER_ADMIN' || u.role === 'GLOBAL_ADMIN';
    if (!isPlatform && u.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    setPlatform(isPlatform);
    if (isPlatform) {
      api
        .platformAgencies()
        .then((rows: any) => setAgencies(Array.isArray(rows) ? rows : rows?.rows || []))
        .catch(() => setAgencies([]))
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;
  return (
    <AnalyticsDashboard
      platform={platform}
      back={platform ? '/platform/tools' : '/admin'}
      title={platform ? 'Platform analytics' : 'Analytics'}
      agencies={agencies}
    />
  );
}
