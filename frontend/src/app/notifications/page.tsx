'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeft, Bell, X } from 'lucide-react';

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.notifications();
        setItems(list);
        // Clear unread badge when alerts are opened
        const unread = (list || []).filter((n: any) => !n.isRead);
        if (unread.length) {
          await api.markAllRead().catch(() => {});
          setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Bell size={22} /> Notifications
        </h1>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-slate-100 py-12 text-center text-slate-500">
          No notifications yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              onClick={() => setSelected(n)}
              className={`cursor-pointer rounded-xl border p-4 transition hover:shadow-sm active:bg-slate-50 ${
                n.isRead ? 'border-slate-100 bg-white' : 'border-brand-100 bg-brand-50'
              }`}
            >
              <p className="font-semibold text-slate-800">{n.title}</p>
              <p className="line-clamp-2 text-sm text-slate-600">{n.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{selected.title}</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{selected.body}</p>
            {selected.meta && Object.keys(selected.meta).length > 0 && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Details
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                  {JSON.stringify(selected.meta, null, 2)}
                </pre>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-400">
              {new Date(selected.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
