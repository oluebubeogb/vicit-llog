'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function VisitorsPage() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .myInvites()
      .then(setInvites)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">My Visitors</h1>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="rounded-xl bg-slate-100 py-12 text-center text-slate-500">
          No visitors yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{inv.purpose}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(inv.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium">
                  {inv.status}
                </span>
              </div>
              <div className="mt-3 space-y-1">
                {inv.visitors?.map((v: any) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{v.fullName}</span>
                    <span
                      className={
                        v.status === 'ARRIVED'
                          ? 'text-emerald-600'
                          : v.status === 'EXITED'
                            ? 'text-slate-400'
                            : 'text-amber-600'
                      }
                    >
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
