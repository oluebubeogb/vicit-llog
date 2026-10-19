'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { ScanLine, LogIn, LogOut, Search } from 'lucide-react';

export default function GatePage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [entryMode, setEntryMode] = useState('PEDESTRIAN');

  async function lookup() {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.gateLookup(code.trim());
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Not found');
    } finally {
      setLoading(false);
    }
  }

  async function doEntry(visitorId: string) {
    setActionLoading(visitorId + '-in');
    try {
      await api.recordEntry({ visitorId, entryMode });
      await lookup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  async function doExit(visitorId: string) {
    setActionLoading(visitorId + '-out');
    try {
      await api.recordExit(visitorId);
      await lookup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 pt-6 pb-8 text-white">
      <div className="mb-6 flex items-center gap-3">
        <ScanLine size={28} className="text-brand-400" />
        <h1 className="text-xl font-bold">Gate Control</h1>
      </div>

      <div className="mb-6 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Passphrase or scan QR data"
          className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3.5 text-lg font-mono tracking-wide outline-none focus:border-brand-500"
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="rounded-xl bg-brand-600 px-5 py-3.5 font-semibold hover:bg-brand-700 disabled:opacity-60"
        >
          <Search size={22} />
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-800 p-4">
            <p className="text-sm text-slate-400">Host</p>
            <p className="font-semibold">{result.host?.fullName}</p>
            <p className="mt-2 text-sm text-slate-400">Purpose</p>
            <p>{result.purpose}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-slate-400">
              Entry mode
            </label>
            <select
              value={entryMode}
              onChange={(e) => setEntryMode(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
            >
              <option value="PEDESTRIAN">Pedestrian</option>
              <option value="MOTORCYCLE">Motorcycle</option>
              <option value="VEHICLE">Vehicle</option>
            </select>
          </div>

          {result.visitors?.map((v: any) => (
            <div
              key={v.id}
              className="rounded-2xl border border-slate-700 bg-slate-800 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold">{v.fullName}</p>
                  <p className="text-sm text-slate-400">
                    Status: <span className="text-white">{v.status}</span>
                  </p>
                  {v.enteredAt && (
                    <p className="text-xs text-slate-500">
                      In: {new Date(v.enteredAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {v.photoPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL}/visitors/photo/${v.photoPath}`}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                )}
              </div>

              <div className="mt-4 flex gap-2">
                {v.status === 'INVITED' && (
                  <button
                    onClick={() => doEntry(v.id)}
                    disabled={!!actionLoading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold disabled:opacity-50"
                  >
                    <LogIn size={18} />
                    {actionLoading === v.id + '-in' ? '…' : 'ENTRY'}
                  </button>
                )}
                {v.status === 'ARRIVED' && (
                  <button
                    onClick={() => doExit(v.id)}
                    disabled={!!actionLoading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 font-semibold disabled:opacity-50"
                  >
                    <LogOut size={18} />
                    {actionLoading === v.id + '-out' ? '…' : 'EXIT'}
                  </button>
                )}
                {v.status === 'EXITED' && (
                  <p className="w-full text-center text-sm text-slate-400">
                    Already exited
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!result && !error && (
        <p className="mt-12 text-center text-slate-500">
          Enter passphrase or paste QR payload to begin.
        </p>
      )}
    </div>
  );
}
