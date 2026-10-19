'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Ban, Plus } from 'lucide-react';

export default function BlacklistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', idNumber: '', phone: '', reason: '' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .blacklist()
      .then(setItems)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addBlacklist(form);
      setMsg('Added to blacklist');
      setShowForm(false);
      setForm({ fullName: '', idNumber: '', phone: '', reason: '' });
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function deactivate(id: string) {
    await api.deactivateBlacklist(id);
    load();
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Ban size={22} /> Blacklist
        </h1>
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="mb-4 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
      >
        <Plus size={16} /> Add Entry
      </button>

      {msg && (
        <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">{msg}</p>
      )}

      {showForm && (
        <form onSubmit={add} className="mb-4 space-y-3 rounded-xl border p-4">
          <input
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
          />
          <input
            placeholder="ID number"
            value={form.idNumber}
            onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
          />
          <input
            placeholder="Reason *"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
            required
          />
          <button type="submit" className="w-full rounded-lg bg-red-600 py-2 text-white">
            Add to Blacklist
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-slate-100 py-12 text-center text-slate-500">
          No blacklist entries
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border p-3 ${
                item.isActive ? 'bg-white' : 'bg-slate-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{item.fullName || item.idNumber || item.phone}</p>
                  <p className="text-xs text-slate-500">{item.reason}</p>
                  {item.idNumber && (
                    <p className="text-xs text-slate-400">ID: {item.idNumber}</p>
                  )}
                </div>
                {item.isActive && (
                  <button
                    onClick={() => deactivate(item.id)}
                    className="rounded-lg bg-slate-200 px-2 py-1 text-xs"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
