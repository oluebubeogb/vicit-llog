'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeft, Bell } from 'lucide-react';

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
              className={`rounded-xl border p-4 ${
                n.isRead ? 'border-slate-100 bg-white' : 'border-brand-100 bg-brand-50'
              }`}
            >
              <p className="font-semibold text-slate-800">{n.title}</p>
              <p className="text-sm text-slate-600">{n.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
