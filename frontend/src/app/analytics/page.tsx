'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Users, LogIn, LogOut, Clock, X } from 'lucide-react';
import PersonLink from '@/components/PersonLink';

type Drill = {
  title: string;
  params: {
    metric?: string;
    purpose?: string;
    entryMode?: string;
    status?: string;
  };
};

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .analytics(days)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  async function openDrill(d: Drill) {
    setDrill(d);
    setListLoading(true);
    setDetail(null);
    try {
      const rows = await api.analyticsVisitors({ days, ...d.params });
      setList(Array.isArray(rows) ? rows : []);
    } catch {
      setList([]);
    } finally {
      setListLoading(false);
    }
  }

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
            <button
              type="button"
              onClick={() =>
                openDrill({ title: 'Total visits', params: { metric: 'total' } })
              }
              className="rounded-2xl bg-brand-600 p-4 text-left text-white card-hover"
            >
              <Users size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.totalVisits}</p>
              <p className="text-xs text-brand-100">Total visits · tap for list</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openDrill({ title: 'Entries', params: { metric: 'arrived' } })
              }
              className="rounded-2xl bg-emerald-600 p-4 text-left text-white card-hover"
            >
              <LogIn size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.arrived}</p>
              <p className="text-xs text-emerald-100">Entries · tap for list</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openDrill({ title: 'Exits', params: { metric: 'exited' } })
              }
              className="rounded-2xl bg-amber-500 p-4 text-left text-white card-hover"
            >
              <LogOut size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.exited}</p>
              <p className="text-xs text-amber-100">Exits · tap for list</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openDrill({ title: 'On site now', params: { metric: 'activeNow' } })
              }
              className="rounded-2xl bg-violet-600 p-4 text-left text-white card-hover"
            >
              <Clock size={20} className="mb-1 opacity-80" />
              <p className="text-2xl font-bold">{data.activeNow}</p>
              <p className="text-xs text-violet-100">On site · tap for list</p>
            </button>
            {data.denied != null && (
              <button
                type="button"
                onClick={() =>
                  openDrill({ title: 'Declined entries', params: { metric: 'denied' } })
                }
                className="rounded-2xl border bg-white p-4 text-left card-hover"
              >
                <p className="text-2xl font-bold text-red-600">{data.denied}</p>
                <p className="text-xs text-slate-500">Declined · tap for list</p>
              </button>
            )}
          </div>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-400">
              By purpose
            </h2>
            <ul className="space-y-1">
              {(data.byPurpose || []).map((p: any) => (
                <li key={p.purpose}>
                  <button
                    type="button"
                    onClick={() =>
                      openDrill({
                        title: `Purpose: ${p.purpose}`,
                        params: { purpose: p.purpose },
                      })
                    }
                    className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm shadow-sm row-hover"
                  >
                    <span className="truncate">{p.purpose}</span>
                    <span className="font-semibold text-brand-600">{p.count}</span>
                  </button>
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
                <li key={m.mode}>
                  <button
                    type="button"
                    onClick={() =>
                      openDrill({
                        title: `Mode: ${m.mode || 'Unknown'}`,
                        params: { entryMode: m.mode },
                      })
                    }
                    className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm shadow-sm row-hover"
                  >
                    <span>{m.mode || 'Unknown'}</span>
                    <span className="font-semibold">{m.count}</span>
                  </button>
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

      {/* Drill-down list */}
      {drill && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{drill.title}</h2>
              <button
                type="button"
                onClick={() => {
                  setDrill(null);
                  setDetail(null);
                }}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            {listLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-slate-400">No matching visitors</p>
            ) : (
              <ul className="space-y-2">
                {list.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setDetail(v)}
                      className="w-full rounded-xl border bg-white p-3 text-left text-sm row-hover"
                    >
                      <p className="font-semibold">{v.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {v.status}
                        {v.invite?.purpose ? ` · ${v.invite.purpose}` : ''}
                        {v.entryMode ? ` · ${v.entryMode}` : ''}
                      </p>
                      <p className="text-xs text-slate-400">
                        {v.enteredAt
                          ? `In ${new Date(v.enteredAt).toLocaleString()}`
                          : new Date(v.createdAt).toLocaleString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Full visitor detail */}
      {detail && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Visitor details</h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Name</dt>
                <dd className="font-medium">{detail.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd>{detail.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Purpose</dt>
                <dd>{detail.invite?.purpose || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Host</dt>
                <dd>
                  <PersonLink
                    id={detail.invite?.host?.id}
                    name={detail.invite?.host?.fullName}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Expected mode</dt>
                <dd>{detail.invite?.expectedMode || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Actual mode</dt>
                <dd>{detail.entryMode || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Entered</dt>
                <dd>
                  {detail.enteredAt
                    ? new Date(detail.enteredAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Exited</dt>
                <dd>
                  {detail.exitedAt
                    ? new Date(detail.exitedAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
              {detail.deniedReason && (
                <div>
                  <dt className="text-xs text-slate-400">Decline reason</dt>
                  <dd className="text-red-700">{detail.deniedReason}</dd>
                </div>
              )}
              {detail.email && (
                <div>
                  <dt className="text-xs text-slate-400">Email</dt>
                  <dd>{detail.email}</dd>
                </div>
              )}
              {detail.phone && (
                <div>
                  <dt className="text-xs text-slate-400">Phone</dt>
                  <dd>{detail.phone}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
