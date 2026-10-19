'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, MapPin, Plus } from 'lucide-react';

export default function LocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [showLoc, setShowLoc] = useState(false);
  const [showGate, setShowGate] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({ name: '', code: '', address: '' });
  const [gateForm, setGateForm] = useState({ name: '', code: '' });
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .locations()
      .then(setLocations)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function createLoc(e: React.FormEvent) {
    e.preventDefault();
    await api.createLocation(locForm);
    setShowLoc(false);
    setLocForm({ name: '', code: '', address: '' });
    load();
  }

  async function createGate(e: React.FormEvent, locId: string) {
    e.preventDefault();
    await api.addGate(locId, gateForm);
    setShowGate(null);
    setGateForm({ name: '', code: '' });
    load();
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <MapPin size={22} /> Locations & Gates
        </h1>
      </div>

      <button
        onClick={() => setShowLoc(!showLoc)}
        className="mb-4 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
      >
        <Plus size={16} /> Add Location
      </button>

      {showLoc && (
        <form onSubmit={createLoc} className="mb-4 space-y-2 rounded-xl border p-4">
          <input
            placeholder="Name"
            value={locForm.name}
            onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
            required
          />
          <input
            placeholder="Code (e.g. HQ)"
            value={locForm.code}
            onChange={(e) => setLocForm({ ...locForm, code: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
            required
          />
          <input
            placeholder="Address (optional)"
            value={locForm.address}
            onChange={(e) => setLocForm({ ...locForm, address: e.target.value })}
            className="w-full rounded-lg border px-3 py-2"
          />
          <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-white">
            Create Location
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="rounded-xl bg-slate-100 py-12 text-center text-slate-500">
          No locations yet
        </p>
      ) : (
        <ul className="space-y-3">
          {locations.map((loc) => (
            <li key={loc.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="font-semibold">{loc.name}</p>
              <p className="text-xs text-slate-400">
                {loc.code} {loc.address ? `· ${loc.address}` : ''}
              </p>
              <div className="mt-2 space-y-1">
                {(loc.gates || []).map((g: any) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                  >
                    <span>{g.name}</span>
                    <span className="text-xs text-slate-400">{g.code}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowGate(showGate === loc.id ? null : loc.id)}
                className="mt-2 text-xs font-medium text-brand-600"
              >
                + Add Gate
              </button>
              {showGate === loc.id && (
                <form
                  onSubmit={(e) => createGate(e, loc.id)}
                  className="mt-2 space-y-2 rounded-lg border p-3"
                >
                  <input
                    placeholder="Gate name"
                    value={gateForm.name}
                    onChange={(e) => setGateForm({ ...gateForm, name: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    required
                  />
                  <input
                    placeholder="Gate code"
                    value={gateForm.code}
                    onChange={(e) => setGateForm({ ...gateForm, code: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full rounded bg-brand-600 py-1.5 text-sm text-white"
                  >
                    Save Gate
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
