'use client';

import { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, UserPlus, X } from 'lucide-react';

export default function VisitorsPage() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    const u = getUser();
    setRole(u?.role ?? null);
    const load = u?.role === 'ADMIN' ? api.allInvites() : api.myInvites();
    load
      .then(setInvites)
      .catch(() => setInvites([]))
      .finally(() => setLoading(false));
  }, []);

  function statusLabel(status: string, inv: any) {
    if (status === 'EXPIRED' || (inv.expiresAt && new Date(inv.expiresAt) < new Date() && status !== 'USED')) {
      return 'Expired';
    }
    if (status === 'ACTIVE') return 'Active';
    if (status === 'USED') return 'Used';
    if (status === 'OFFLINE_PENDING') return 'Pending approval';
    return status;
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={role === 'GATE' ? '/gate' : '/dashboard'}
          className="rounded-full p-2 hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">
          {role === 'ADMIN' ? 'All Visitors' : 'My Visitors'}
        </h1>
      </div>

      {/* Gate / staff: quick new invite */}
      {(role === 'GATE' || role === 'STAFF' || role === 'ADMIN') && (
        <Link
          href="/invite/new"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 card-hover"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <UserPlus size={20} />
          </div>
          <div>
            <p className="font-semibold text-brand-900">Add new invite</p>
            <p className="text-xs text-brand-700">Create a visitor registration link</p>
          </div>
        </Link>
      )}

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
              onClick={() => setDetail(inv)}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm row-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{inv.purpose}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(inv.createdAt).toLocaleString()}
                    {inv.category ? ` · ${inv.category}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium">
                  {statusLabel(inv.status, inv)}
                </span>
              </div>
              <div className="mt-3 space-y-1">
                {inv.visitors?.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <span>{v.fullName}</span>
                    <span
                      className={
                        v.status === 'ARRIVED'
                          ? 'text-emerald-600'
                          : v.status === 'EXITED'
                            ? 'text-slate-400'
                            : v.status === 'DENIED'
                              ? 'text-red-600'
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

      {detail && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Visit details</h2>
              <button onClick={() => setDetail(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Purpose</dt>
                <dd className="font-medium">{detail.purpose}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd>{statusLabel(detail.status, detail)}</dd>
              </div>
              {detail.host?.fullName && (
                <div>
                  <dt className="text-xs text-slate-400">Host</dt>
                  <dd>{detail.host.fullName}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-400">Passphrase</dt>
                <dd className="font-mono">{detail.passphrase}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Expires</dt>
                <dd>
                  {detail.expiresAt
                    ? new Date(detail.expiresAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2">
              {(detail.visitors || []).map((v: any) => (
                <div key={v.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-semibold">{v.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {v.status}
                    {v.enteredAt ? ` · in ${new Date(v.enteredAt).toLocaleString()}` : ''}
                    {v.exitedAt ? ` · out ${new Date(v.exitedAt).toLocaleString()}` : ''}
                    {v.deniedReason ? ` · declined: ${v.deniedReason}` : ''}
                  </p>
                </div>
              ))}
            </div>
            {(detail.status === 'EXPIRED' ||
              (detail.expiresAt &&
                new Date(detail.expiresAt) < new Date() &&
                detail.status !== 'USED')) && (
              <button
                type="button"
                onClick={async () => {
                  await api.reviveInvite(detail.id);
                  const load = role === 'ADMIN' ? api.allInvites() : api.myInvites();
                  setInvites(await load);
                  setDetail(null);
                }}
                className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white"
              >
                Revive expired link
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
