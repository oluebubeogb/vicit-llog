'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import Link from 'next/link';

export default function NewInvitePage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestNames, setGuestNames] = useState('');
  const [mode, setMode] = useState('PEDESTRIAN');
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const names = guestNames
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean);
      const data = await api.createInvite({
        purpose,
        guestCount: names.length || guestCount,
        guestNames: names.length ? names : undefined,
        expectedMode: mode,
        isOffline,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (result?.link) {
      navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (result) {
    return (
      <div className="px-4 pt-6">
        <h1 className="mb-4 text-xl font-bold">Invite Created</h1>
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-800">
            Share this link with the visitor. It expires in{' '}
            <strong>{result.expiresInMinutes} minutes</strong>.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-white p-3">
            <code className="flex-1 truncate text-xs text-slate-700">
              {result.link}
            </code>
            <button
              onClick={copyLink}
              className="rounded-lg bg-brand-600 p-2 text-white"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <div className="rounded-xl bg-white p-3">
            <p className="text-xs text-slate-500">Passphrase (backup)</p>
            <p className="font-mono text-lg font-bold tracking-wider text-slate-900">
              {result.passphrase}
            </p>
          </div>
          {result.isOffline && (
            <p className="text-sm text-amber-700">
              Offline request – awaiting admin approval.
            </p>
          )}
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-6 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">New Invite</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Purpose *</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Meeting with HR"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Number of guests
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={guestCount}
            onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Guest names (one per line, optional)
          </label>
          <textarea
            value={guestNames}
            onChange={(e) => setGuestNames(e.target.value)}
            rows={3}
            placeholder="John Doe&#10;Jane Smith"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Expected mode of entry
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
          >
            <option value="PEDESTRIAN">Pedestrian</option>
            <option value="MOTORCYCLE">Motorcycle</option>
            <option value="VEHICLE">Vehicle</option>
          </select>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={isOffline}
            onChange={(e) => setIsOffline(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-brand-600"
          />
          <div>
            <p className="text-sm font-medium">Offline / No-phone request</p>
            <p className="text-xs text-slate-400">Requires admin approval</p>
          </div>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create Invite Link'}
        </button>
      </form>
    </div>
  );
}
