'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, clearToken } from '@/lib/api';
import { LogOut, User } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="mb-6 text-xl font-bold">Profile</h1>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <User size={28} />
        </div>
        <div>
          <p className="text-lg font-semibold">{user?.fullName}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <p className="text-xs text-slate-400">
            {user?.role} · {user?.organisation?.name}
          </p>
        </div>
      </div>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 font-semibold text-red-600"
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </div>
  );
}
