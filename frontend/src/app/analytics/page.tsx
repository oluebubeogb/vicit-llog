'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Users, LogIn, LogOut, Clock } from 'lucide-react';

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .analytics(days)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <BarChart3 size={22} /> Analytics
        </h1>
      </div>

      <div className="mb-4 flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              days === d ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {loading || !data ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-brand-600 p-4 text-white">
              <Users size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.totalVisits}</p>
              <p className="text-xs text-brand-100">Total visits</p>
            </div>
            <div className="rounded-2xl bg-emerald-600 p-4 text-white">
              <LogIn size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.arrived}</p>
              <p className="text-xs text-emerald-100">Entries</p>
            </div>
            <div className="rounded-2xl bg-amber-500 p-4 text-white">
              <LogOut size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.exited}</p>
              <p className="text-xs text-amber-100">Exits</p>
            </div>
            <div className="rounded-2xl bg-violet-600 p-4 text-white">
              <Clock size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.activeNow}</p>
              <p className="text-xs text-violet-100">On site now</p>
            </div>
          </div>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">
              By purpose
            </h2>
            <ul className="space-y-1">
              {(data.byPurpose || []).map((p: any) => (
                <li
                  key={p.purpose}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <span className="truncate">{p.purpose}</span>
                  <span className="font-semibold text-brand-600">{p.count}</span>
                </li>
              ))}
              {!data.byPurpose?.length && (
                <p className="text-sm text-slate-400">No data yet</p>
              )}
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">
              Entry mode
            </h2>
            <ul className="space-y-1">
              {(data.byMode || []).map((m: any) => (
                <li
                  key={m.mode}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <span>{m.mode || 'Unknown'}</span>
                  <span className="font-semibold">{m.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">
              Peak hours
            </h2>
            <ul className="space-y-1">
              {(data.peakHours || []).map((h: any) => (
                <li
                  key={h.hour}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <span>{String(h.hour).padStart(2, '0')}:00</span>
                  <span className="font-semibold">{h.count}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
