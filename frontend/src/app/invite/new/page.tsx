'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ArrowLeft, Copy, Check,
  Share2, Download, User, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { isValidEmail } from '@/lib/email';

type Guest = { fullName: string; email: string; phone: string; address: string };

function emptyGuest(): Guest {
  return { fullName: '', email: '', phone: '', address: '' };
}

/** Flexible bulk parser — tolerates minor formatting mistakes */
function parseBulkText(text: string): Guest[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: Guest[] = [];

  for (const line of lines) {
    // Skip header-ish lines
    if (/^name\s*,\s*email/i.test(line) || /^#+/.test(line) || /^=+/.test(line)) continue;

    // Comma or tab or pipe separated
    if (/[,|\t]/.test(line)) {
      const parts = line.split(/[,|\t]/).map((s) => s.trim()).filter((s, i, a) => s || i < a.length - 1);
      // Detect which field is email / phone
      let fullName = '';
      let email = '';
      let phone = '';
      let address = '';
      for (const part of parts) {
        if (!part) continue;
        if (!email && /@/.test(part) && /\./.test(part)) {
          email = part.toLowerCase();
        } else if (
          !phone &&
          /^[+]?[\d\s().-]{7,}$/.test(part.replace(/\s/g, ''))
        ) {
          phone = part;
        } else if (!fullName) {
          fullName = part;
        } else {
          // Remaining → address (join if multiple leftovers)
          address = address ? `${address}, ${part}` : part;
        }
      }
      if (fullName || email) {
        parsed.push({
          fullName: fullName || (email ? email.split('@')[0] : `Guest ${parsed.length + 1}`),
          email,
          phone,
          address,
        });
      }
    } else if (line.includes('@')) {
      if (parsed.length && !parsed[parsed.length - 1].email) {
        parsed[parsed.length - 1].email = line.toLowerCase();
      } else {
        parsed.push({
          fullName: `Guest ${parsed.length + 1}`,
          email: line.toLowerCase(),
          phone: '',
          address: '',
        });
      }
    } else if (/^[+]?[\d\s().-]{7,}$/.test(line.replace(/\s/g, ''))) {
      if (parsed.length && !parsed[parsed.length - 1].phone) {
        parsed[parsed.length - 1].phone = line;
      }
    } else {
      parsed.push({ fullName: line, email: '', phone: '', address: '' });
    }
  }

  return parsed;
}

export default function NewInvitePage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<'PERSONAL' | 'OFFICIAL'>('OFFICIAL');
  const [description, setDescription] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [expectedTime, setExpectedTime] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guests, setGuests] = useState<Guest[]>([emptyGuest()]);
  const [openGuests, setOpenGuests] = useState<Record<number, boolean>>({ 0: true });
  const [mode, setMode] = useState('PEDESTRIAN');
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const placeholders = [
    'Official: Meeting with Finance team to review Q3 budget',
    'Official: Vendor delivery of office supplies',
    'Personal: Family visit for birthday celebration',
    'Personal: Friend picking up documents',
  ];

  useEffect(() => {
    const t = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholders.length);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setGuests((prev) => {
      const n = Math.max(1, Math.min(20, guestCount || 1));
      if (prev.length === n) return prev;
      if (prev.length < n) {
        const next = [...prev, ...Array.from({ length: n - prev.length }, emptyGuest)];
        setOpenGuests((o) => {
          const copy = { ...o };
          for (let i = prev.length; i < n; i++) copy[i] = i === n - 1;
          return copy;
        });
        return next;
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

  function toggleGuest(i: number) {
    setOpenGuests((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function applyBulk() {
    if (!bulkText.trim()) return;
    const parsed = parseBulkText(bulkText);
    if (parsed.length) {
      setGuestCount(parsed.length);
      setGuests(parsed);
      setOpenGuests(Object.fromEntries(parsed.map((_, i) => [i, i === 0])));
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
          address: g.address.trim() || undefined,
        }))
        .filter((g) => g.fullName);
      for (const g of clean) {
        if (g.email && !isValidEmail(g.email)) {
          setError(`Invalid email for ${g.fullName}: "${g.email}". Please correct it.`);
          setLoading(false);
          return;
        }
      }
      let expectedAt: string | undefined;
      if (expectedDate) {
        const time = expectedTime || '09:00';
        expectedAt = new Date(`${expectedDate}T${time}:00`).toISOString();
      }
      const data = await api.createInvite({
        purpose: description.trim(),
        guestCount: clean.length || guestCount,
        guests: clean,
        guestNames: clean.map((g) => g.fullName),
        expectedMode: mode,
        category: purpose,
        isOffline,
        expectedAt,
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

  async function shareInvite() {
    if (!result?.link) return;
    const payload = {
      title: 'Visitor invite',
      text: `You are invited. Passphrase: ${result.passphrase || ''}`,
      url: result.link,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(
          `${result.link}\nPassphrase: ${result.passphrase || ''}`,
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // user cancelled share
    }
  }

  function downloadSampleTxt() {
    const sample = [
      'Name, Email, Phone number, Address',
      'Name, Email, Phone number, Address',
      '',
      'Jane Doe, jane@example.com, +2348012345678, 12 Admiralty Way Lagos',
      'John Smith, john@example.com, +2348098765432, 5 Marina Road Abuja',
      '',
      'You may also use tabs or pipes as separators. Minor formatting errors are tolerated.',
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
            <button
              type="button"
              onClick={copyLink}
              title="Copy link"
              className="rounded-lg bg-brand-600 p-2 text-white"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              type="button"
              onClick={shareInvite}
              title="Share"
              className="rounded-lg border border-brand-200 bg-brand-50 p-2 text-brand-700"
            >
              <Share2 size={16} />
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
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as 'PERSONAL' | 'OFFICIAL')}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 outline-none focus:border-brand-500"
            required
          >
            <option value="OFFICIAL">Official</option>
            <option value="PERSONAL">Personal</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Description *</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={placeholders[placeholderIndex]}
            className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Date *</label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Time *</label>
            <input
              type="time"
              value={expectedTime}
              onChange={(e) => setExpectedTime(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Number of guests</label>
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
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setBulkOpen((o) => !o)}
              className="flex items-center gap-1 text-sm font-medium text-slate-700"
            >
              {bulkOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Bulk paste (optional)
            </button>
            <button
              type="button"
              onClick={downloadSampleTxt}
              className="flex items-center gap-1 text-xs font-medium text-brand-600"
            >
              <Download size={14} /> Sample invite .txt
            </button>
          </div>
          {bulkOpen && (
            <>
              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                onBlur={applyBulk}
                placeholder={'Name, Email, Phone number, Address\nName, Email, Phone number, Address'}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                One guest per line. Leave the box to auto-fill the guest cards below.
              </p>
            </>
          )}
        </div>

        {/* Collapsible guest cards */}
        <div className="space-y-2">
          {guests.map((g, i) => {
            const open = openGuests[i] !== false;
            const summary =
              g.fullName || g.email
                ? [g.fullName, g.email].filter(Boolean).join(' · ')
                : `Guest ${i + 1}`;
            return (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleGuest(i)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                    {i + 1}
                  </span>
                  <User size={16} className="text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                    {summary}
                  </span>
                  {open ? (
                    <ChevronDown size={18} className="text-slate-400" />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400" />
                  )}
                </button>
                {open && (
                  <div className="space-y-2 border-t border-slate-100 px-4 pb-4 pt-2">
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
                      placeholder="Phone number"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      value={g.address}
                      onChange={(e) => updateGuest(i, 'address', e.target.value)}
                      placeholder="Address"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Expected mode of entry</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 outline-none focus:border-brand-500"
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
            <p className="text-xs text-slate-400">
              Requires admin approval (emails not sent until approved)
            </p>
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
