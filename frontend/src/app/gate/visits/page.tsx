'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import {
  Users,
  Clock,
  CheckCircle2,
  ArrowUpDown,
  LayoutDashboard,
} from 'lucide-react';

export default function GateVisitsPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.gateVisits(filter || undefined);
      setVisits(Array.isArray(data) ? data : []);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    loadVisits();
  }, [router, loadVisits]);

  const sortedVisits = [...visits].sort((a, b) => {
    const da = new Date(a.enteredAt || a.createdAt || 0).getTime();
    const db = new Date(b.enteredAt || b.createdAt || 0).getTime();
    return sortDesc ? db - da : da - db;
  });

  const onSite = visits.filter((v) => v.status === 'ARRIVED').length;
  const exited = visits.filter((v) => v.status === 'EXITED').length;
  const pending = visits.filter((v) => v.status === 'INVITED').length;

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <LayoutDashboard size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Visits</h1>
          <p className="text-xs text-slate-500">Invite and entry overview</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <Users size={18} className="mx-auto mb-1 text-brand-600" />
          <p className="text-xl font-bold text-slate-900">{pending}</p>
          <p className="text-[10px] text-slate-400">Registered</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <Clock size={18} className="mx-auto mb-1 text-emerald-600" />
          <p className="text-xl font-bold text-slate-900">{onSite}</p>
          <p className="text-[10px] text-slate-400">On site</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <CheckCircle2 size={18} className="mx-auto mb-1 text-slate-500" />
          <p className="text-xl font-bold text-slate-900">{exited}</p>
          <p className="text-[10px] text-slate-400">Exited</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { id: '', label: 'All' },
          { id: 'pending', label: 'Registered' },
          { id: 'on_site', label: 'On site' },
          { id: 'exited', label: 'Exited' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f.id
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setSortDesc((s) => !s)}
          className="ml-auto flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600"
        >
          <ArrowUpDown size={12} />
          {sortDesc ? 'Newest' : 'Oldest'}
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-400">Loading…</p>
      ) : sortedVisits.length === 0 ? (
        <p className="py-8 text-center text-slate-400">No visits found</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Visitor</th>
                  <th className="px-3 py-2.5 font-semibold">Host</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedVisits.map((v) => (
                  <tr
                    key={v.visitorId}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => {
                      if (v.passphrase) {
                        router.push(`/gate?code=${encodeURIComponent(v.passphrase)}`);
                      } else {
                        router.push('/gate');
                      }
                    }}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">{v.fullName}</p>
                      <p className="max-w-[120px] truncate text-xs text-slate-400">
                        {v.purpose}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{v.hostName}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          v.status === 'ARRIVED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : v.status === 'EXITED'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-brand-50 text-brand-700'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {v.enteredAt
                        ? new Date(v.enteredAt).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : v.createdAt
                          ? new Date(v.createdAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      {v.exitedAt && (
                        <span className="block text-slate-400">
                          out{' '}
                          {new Date(v.exitedAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
