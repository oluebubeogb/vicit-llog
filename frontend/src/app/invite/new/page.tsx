'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Copy, Check, Download, User } from 'lucide-react';
import Link from 'next/link';

type Guest = { fullName: string; email: string; phone: string };

function emptyGuest(): Guest {
  return { fullName: '', email: '', phone: '' };
}

export default function NewInvitePage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guests, setGuests] = useState<Guest[]>([emptyGuest()]);
  const [mode, setMode] = useState('PEDESTRIAN');
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Keep guests array length in sync with guestCount
  useEffect(() => {
    setGuests((prev) => {
      const n = Math.max(1, Math.min(20, guestCount || 1));
      if (prev.length === n) return prev;
      if (prev.length < n) {
        return [...prev, ...Array.from({ length: n - prev.length }, emptyGuest)];
      }
      return prev.slice(0, n);
    });
  }, [guestCount]);

  function updateGuest(i: number, field: keyof Guest, value: string) {
    setGuests((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  /** Parse free-text: "Name" / "email" alternating lines, or "Name, email, phone" */
  function parseBulkText(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: Guest[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(',')) {
        const [fullName, email, phone] = line.split(',').map((s) => s.trim());
        parsed.push({ fullName: fullName || '', email: email || '', phone: phone || '' });
      } else if (line.includes('@')) {
        // email line — attach to previous guest or start new
        if (parsed.length && !parsed[parsed.length - 1].email) {
          parsed[parsed.length - 1].email = line;
        } else {
          parsed.push({ fullName: `Guest ${parsed.length + 1}`, email: line, phone: '' });
        }
      } else {
        parsed.push({ fullName: line, email: '', phone: '' });
      }
    }
    if (parsed.length) {
      setGuestCount(parsed.length);
      setGuests(parsed);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const clean = guests
        .map((g) => ({
          fullName: g.fullName.trim() || 'Guest',
          email: g.email.trim() || undefined,
          phone: g.phone.trim() || undefined,
        }))
        .filter((g) => g.fullName);
      const data = await api.createInvite({
        purpose,
        guestCount: clean.length || guestCount,
        guests: clean,
        guestNames: clean.map((g) => g.fullName),
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

  function downloadSampleTxt() {
    const sample = [
      'Vicit Llog — Sample invite guest list',
      '=====================================',
      'One guest per block. You can also paste into the bulk box:',
      '',
      'Format A — comma separated:',
      'Jane Doe, jane@example.com, +2348012345678',
      'John Smith, john@example.com, +2348098765432',
      '',
      'Format B — name then email on next line:',
      'Jane Doe',
      'jane@example.com',
      'John Smith',
      'john@example.com',
      '',
      'After creating the invite, each guest with an email receives the registration link.',
      'Share the same link or passphrase at the gate if email is not available.',
      '',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vicit-invite-sample.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (result) {
    return (
      <div className="px-4 pt-6 pb-28">
        <h1 className="mb-4 text-xl font-bold">Invite Created</h1>
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-800">
            Share this link with visitors. Expires in{' '}
            <strong>{result.expiresInMinutes} minutes</strong>.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-white p-3">
            <code className="flex-1 truncate text-xs text-slate-700">{result.link}</code>
            <button onClick={copyLink} className="rounded-lg bg-brand-600 p-2 text-white">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <div className="rounded-xl bg-white p-3">
            <p className="text-xs text-slate-500">Passphrase (gate backup)</p>
            <p className="font-mono text-lg font-bold tracking-wider">{result.passphrase}</p>
          </div>
          {result.emailsSent?.length > 0 && (
            <p className="text-sm text-emerald-800">
              Invite emailed to: {result.emailsSent.join(', ')}
            </p>
          )}
          {result.isOffline && (
            <p className="text-sm text-amber-700">Offline request — awaiting admin approval.</p>
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
    <div className="px-4 pt-6 pb-28">
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
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium">Number of guests</label>
            <button
              type="button"
              onClick={downloadSampleTxt}
              className="flex items-center gap-1 text-xs font-medium text-brand-600"
            >
              <Download size={14} /> Sample invite .txt
            </button>
          </div>
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
            Bulk paste (optional)
          </label>
          <textarea
            rows={3}
            placeholder={'Jane Doe, jane@email.com, +234...\nJohn Smith\njohn@email.com'}
            onBlur={(e) => {
              if (e.target.value.trim()) parseBulkText(e.target.value);
            }}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            Paste names/emails then leave the box — guests update automatically.
          </p>
        </div>

        {/* Stacked numbered guest cards */}
        <div className="space-y-3">
          {guests.map((g, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                  {i + 1}
                </span>
                <User size={16} /> Guest {i + 1}
              </div>
              <div className="space-y-2">
                <input
                  value={g.fullName}
                  onChange={(e) => updateGuest(i, 'fullName', e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  value={g.email}
                  onChange={(e) => updateGuest(i, 'email', e.target.value)}
                  placeholder="Email (invite link sent here)"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <input
                  value={g.phone}
                  onChange={(e) => updateGuest(i, 'phone', e.target.value)}
                  placeholder="Phone (optional)"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Expected mode of entry</label>
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
            <p className="text-xs text-slate-400">Requires admin approval (emails not sent until approved)</p>
          </div>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
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
