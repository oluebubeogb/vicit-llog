'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import {
  UserPlus,
  Users,
  Bell,
  Shield,
  Clock,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUserState] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (u.mustChangePassword) {
      router.replace('/change-password');
      return;
    }
    setUserState(u);
    api
      .myInvites()
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const active = invites.filter((i) => i.status === 'ACTIVE' || i.status === 'USED').length;
  const pending = invites.filter((i) => i.status === 'OFFLINE_PENDING').length;

  return (
    <div className="px-4 pt-6 pb-4">
      <header className="mb-6">
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-200/40 card-hover">
          <p className="text-sm text-brand-100">Welcome back</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight">
            {user?.fullName || '…'}
          </h1>
          <p className="mt-1 text-xs text-brand-100/90">{user?.organisation?.name}</p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand-600 p-4 text-white shadow-lg shadow-brand-200">
          <Users size={22} className="mb-2 opacity-80" />
          <p className="text-2xl font-bold">{active}</p>
          <p className="text-xs text-brand-100">Active / Used</p>
        </div>
        <div className="rounded-2xl bg-amber-500 p-4 text-white shadow-lg shadow-amber-200">
          <Clock size={22} className="mb-2 opacity-80" />
          <p className="text-2xl font-bold">{pending}</p>
          <p className="text-xs text-amber-100">Pending Approval</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/invite/new"
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition card-hover active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <UserPlus size={24} />
          </div>
          <span className="text-sm font-semibold">New Invite</span>
        </Link>
        <Link
          href="/visitors"
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition card-hover active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Users size={24} />
          </div>
          <span className="text-sm font-semibold">My Visitors</span>
        </Link>
        <Link
          href="/notifications"
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition card-hover active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Bell size={24} />
          </div>
          <span className="text-sm font-semibold">Notifications</span>
        </Link>
        {user?.role === 'ADMIN' && (
          <Link
            href="/admin"
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition card-hover active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Shield size={24} />
            </div>
            <span className="text-sm font-semibold">Admin</span>
          </Link>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Recent Invites
        </h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="rounded-xl bg-slate-100 py-8 text-center text-sm text-slate-500">
            No invites yet. Create your first one.
          </p>
        ) : (
          <ul className="space-y-2">
            {invites.slice(0, 5).map((inv) => (
              <li
                key={inv.id}
                className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{inv.purpose}</p>
                    <p className="text-xs text-slate-400">
                      {inv.guestCount} guest(s) · {inv.status}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      inv.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : inv.status === 'USED'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
