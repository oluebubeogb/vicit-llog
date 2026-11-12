'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import IdentityReview from '@/components/IdentityReview';
import { getUser } from '@/lib/api';

export default function IdentityPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getUser()) router.replace('/login');
  }, [router]);
  return (
    <div className="page">
      <PageHeader back="/notifications" icon={<ShieldCheck size={20} />} title="Confirm guests" subtitle="Tick the people you are expecting" info="These guests had no email or phone. The gate took their photo — confirm each one with the green tick, or decline with the red X. Each guest is decided on their own." />
      <section className="surface animate-in">
        <IdentityReview />
      </section>
    </div>
  );
}
