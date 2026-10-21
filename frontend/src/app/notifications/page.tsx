'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeft, Bell, X } from 'lucide-react';

/** Map known meta.type values to friendly labels */
const TYPE_LABELS: Record<string, string> = {
  ARRIVAL: 'Visitor arrival',
  EXIT: 'Visitor exit',
  ENTRY_DENIED: 'Entry denied',
  PHOTO_CAPTURED: 'Photo captured',
  profile_edit: 'Profile edit request',
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In-app',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

/** Keys we render explicitly; anything else is shown as a fallback row */
const KNOWN_KEYS = new Set([
  'type',
  'phone',
  'channels',
  'inviteId',
  'visitorId',
  'requestId',
  'status',
  'delivery',
]);

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-0 sm:flex-row sm:items-start sm:gap-3">
      <span className="w-28 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-sm text-slate-800">{value}</span>
    </div>
  );
}

function NotificationDetails({ meta }: { meta: Record<string, any> }) {
  if (!meta || typeof meta !== 'object') return null;

  const typeLabel = meta.type
    ? TYPE_LABELS[meta.type] || humanizeKey(String(meta.type))
    : null;

  const channels = Array.isArray(meta.channels)
    ? meta.channels
        .map((c: string) => CHANNEL_LABELS[c] || humanizeKey(c))
        .join(', ')
    : null;

  const statusLabel =
    meta.status != null
      ? String(meta.status)
          .replace(/_/g, ' ')
          .replace(/^\w/, (c) => c.toUpperCase())
      : null;

  // Delivery summary (from SMS / WhatsApp fan-out)
  let deliverySummary: string | null = null;
  if (meta.delivery && typeof meta.delivery === 'object') {
    const parts: string[] = [];
    for (const [ch, result] of Object.entries(meta.delivery)) {
      const r = result as any;
      if (r?.ok === true) parts.push(`${CHANNEL_LABELS[ch] || ch}: sent`);
      else if (r?.ok === false)
        parts.push(
          `${CHANNEL_LABELS[ch] || ch}: failed${r.error ? ` (${r.error})` : ''}`,
        );
      else parts.push(`${CHANNEL_LABELS[ch] || ch}: ${JSON.stringify(r)}`);
    }
    if (parts.length) deliverySummary = parts.join(' · ');
  }

  // Any extra keys not in the known set
  const extras = Object.entries(meta).filter(([k]) => !KNOWN_KEYS.has(k));

  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Details
      </p>
      <div>
        <DetailRow label="Event" value={typeLabel} />
        <DetailRow label="Phone" value={meta.phone} />
        <DetailRow label="Channels" value={channels} />
        <DetailRow label="Status" value={statusLabel} />
        <DetailRow
          label="Visitor"
          value={
            meta.visitorId ? (
              <span className="font-mono text-xs text-slate-600">
                {String(meta.visitorId).slice(0, 8)}…
              </span>
            ) : null
          }
        />
        <DetailRow
          label="Invite"
          value={
            meta.inviteId ? (
              <span className="font-mono text-xs text-slate-600">
                {String(meta.inviteId).slice(0, 8)}…
              </span>
            ) : null
          }
        />
        <DetailRow
          label="Request"
          value={
            meta.requestId ? (
              <span className="font-mono text-xs text-slate-600">
                {String(meta.requestId).slice(0, 8)}…
              </span>
            ) : null
          }
        />
        <DetailRow label="Delivery" value={deliverySummary} />
        {extras.map(([key, val]) => (
          <DetailRow
            key={key}
            label={humanizeKey(key)}
            value={
              typeof val === 'object' && val !== null
                ? JSON.stringify(val)
                : String(val)
            }
          />
        ))}
      </div>
    </div>
  );
}

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
              <NotificationDetails meta={selected.meta} />
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
