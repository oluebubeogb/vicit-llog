'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Mail,
  Minus,
  PhoneOff,
  Plus,
  Share2,
  Sparkles,
  UserPlus,
  UserX,
  PencilLine,
  Send,
} from 'lucide-react';
import SleekOverlay from '@/components/ui/SleekOverlay';
import VehicleFields from '@/components/VehicleFields';
import { isVehicleMode, useEntryModes } from '@/lib/entry-modes';
import PageHeader from '@/components/ui/PageHeader';
import Avatar from '@/components/ui/Avatar';
import Collapse from '@/components/ui/Collapse';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
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
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [missing, setMissing] = useState<{ i: number; name: string }[]>([]);
  const guestRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const MODES = useEntryModes();
  useEffect(() => {
    if (MODES.length && !MODES.some((m) => m.v === mode)) setMode(MODES[0].v);
  }, [MODES.map((m) => m.v).join(','), mode]);
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

  const guestName = (g: Guest, i: number) => g.fullName.trim() || `Guest ${i + 1}`;

  /** Guests with neither an email nor a phone — they get no link and are photographed at the gate. */
  function noContactGuests() {
    return guests.map((g, i) => ({ g, i })).filter(({ g }) => !g.email.trim() && !g.phone.trim()).map(({ g, i }) => ({ i, name: guestName(g, i) }));
  }

  function goBackAndFill() {
    const first = missing[0];
    setMissing([]);
    if (!first) return;
    setOpenGuests((o) => ({ ...o, [first.i]: true }));
    // Wait for the overlay to close and the card to expand, then scroll + focus its email.
    setTimeout(() => {
      const el = guestRefs.current[first.i];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-300');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-300'), 2200);
      const input = el.querySelector<HTMLInputElement>('input[type="email"]');
      setTimeout(() => input?.focus({ preventScroll: true }), 380);
    }, 320);
  }

  function expectedAtIso() {
    if (!expectedDate) return undefined;
    const time = expectedTime || '09:00';
    return new Date(`${expectedDate}T${time}:00`).toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const bad = guests.findIndex((g) => g.email.trim() && !isValidEmail(g.email.trim()));
    if (bad >= 0) {
      setError(`Invalid email for ${guestName(guests[bad], bad)}: "${guests[bad].email}". Please correct it.`);
      return;
    }
    const at = expectedAtIso();
    if (at && new Date(at).getTime() < Date.now() - 60_000) {
      setError('The visit date and time cannot be in the past. Choose a later time.');
      return;
    }
    const nc = noContactGuests();
    if (nc.length) {
      setMissing(nc);
      return;
    }
    await createNow();
  }

  async function createNow() {
    setMissing([]);
    setLoading(true);
    setError('');
    try {
      const clean = guests
        .map((g, i) => ({
          fullName: guestName(g, i),
          email: g.email.trim() || undefined,
          phone: g.phone.trim() || undefined,
          address: g.address.trim() || undefined,
        }))
        .filter((g) => g.fullName);
      const data = await api.createInvite({
        purpose: description.trim(),
        guestCount: clean.length || guestCount,
        guests: clean,
        guestNames: clean.map((g) => g.fullName),
        expectedMode: mode,
        category: purpose,
        expectedAt: expectedAtIso(),
        ...(isVehicleMode(mode) ? { vehiclePlate: vehiclePlate.trim() || undefined, vehicleDetails: vehicleDetails.trim() || undefined } : {}),
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
    const waiting = result.awaitingApproval;
    return (
      <div className="page">
        <div className="hero animate-in mb-4" style={waiting ? { backgroundImage: 'linear-gradient(135deg, #fbbf24, #f59e0b 50%, #ea580c)', boxShadow: '0 14px 34px -12px rgb(217 119 6 / 0.6)' } : undefined}>
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl backdrop-blur ${waiting ? 'bg-white/20 ring-1 ring-white/30' : 'bg-on-brand/20 ring-1 ring-on-brand/30'}`}>
            {waiting ? <Clock size={24} /> : <Check size={26} />}
          </span>
          <h1 className="mt-3 text-2xl font-bold">{waiting ? 'Request submitted' : 'Invite created'}</h1>
          <p className={`mt-1 text-sm ${waiting ? 'text-white/80' : 'text-on-brand/80'}`}>
            {result.awaitingApproval
              ? 'An administrator will review it. Guests are emailed as soon as it is approved.'
              : <>Share this link with your guests. It expires in <strong>{result.expiresInMinutes} minutes</strong>.</>}
          </p>
        </div>
        <div className="stagger space-y-3">
          {!waiting && result.link && (
            <div className="card card-art p-3">
              <p className="eyebrow mb-2 px-1">Registration link</p>
              <div className="tile flex items-center gap-2 !p-2">
                <code className="min-w-0 flex-1 truncate px-1 text-xs text-slate-700">{result.link}</code>
                <Tooltip content={copied ? 'Copied!' : 'Copy link'}>
                  <button type="button" onClick={copyLink} className="btn-primary !p-2.5" aria-label="Copy link">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </Tooltip>
                <Tooltip content="Share link and passphrase">
                  <button type="button" onClick={shareInvite} className="btn-soft !p-2.5" aria-label="Share">
                    <Share2 size={16} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
          <div className="card p-4">
            <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
              Passphrase <InfoTip text="Backup code the gate officer can type if the QR can’t be scanned." size={12} />
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-gradient">{result.passphrase}</p>
          </div>
          {result.noContactGuests?.length > 0 && (
            <Notice tone="brand">
              <span className="flex items-start gap-2">
                <PhoneOff size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  <strong>{result.noContactGuests.map((g: any) => g.fullName).join(', ')}</strong> {result.noContactGuests.length === 1 ? 'has' : 'have'} no email or phone. The gate will take {result.noContactGuests.length === 1 ? 'their' : 'each'} photo and send it to you to confirm.
                </span>
              </span>
            </Notice>
          )}
          {result.emailsSent?.length > 0 && (
            <Notice tone="success">
              <span className="flex items-start gap-2">
                <Mail size={16} className="mt-0.5 shrink-0" /> Invite emailed to {result.emailsSent.join(', ')}
              </span>
            </Notice>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => { setResult(null); setDescription(''); setGuestCount(1); setGuests([emptyGuest()]); setOpenGuests({ 0: true }); setVehiclePlate(''); setVehicleDetails(''); }} className="btn-ghost">
            <UserPlus size={16} /> Another
          </button>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  const todayMin = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const timeMin = expectedDate === todayMin ? (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })() : undefined;

  return (
    <div className="page">
      <PageHeader back="/dashboard" icon={<UserPlus size={20} />} title="New invite" subtitle="Guests get a secure link and QR pass" info="Each guest with an email receives a personal registration link. The passphrase is a backup for the gate." />

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="surface animate-in space-y-4">
          <p className="section-title">The visit</p>
          <div>
            <span className="label">Purpose</span>
            <div className="segmented w-full">
              {(['OFFICIAL', 'PERSONAL'] as const).map((c) => (
                <button key={c} type="button" data-active={purpose === c} onClick={() => setPurpose(c)} className="flex-1">
                  {c === 'OFFICIAL' ? 'Official' : 'Personal'}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="label">Description</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={placeholders[placeholderIndex]} className="input resize-none text-sm" required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label"><CalendarDays size={14} /> Date</span>
              <input type="date" min={todayMin} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="input" required />
            </label>
            <label className="block">
              <span className="label"><Clock size={14} /> Time</span>
              <input type="time" min={timeMin} value={expectedTime} onChange={(e) => setExpectedTime(e.target.value)} className="input" required />
            </label>
          </div>
          <div>
            <span className="label">
              Arriving by <InfoTip text="Pre-fills the gate. Officers can change it on arrival." size={12} />
            </span>
            <div className="segmented w-full" data-testid="invite-modes">
              {MODES.map((m) => (
                <button key={m.v} type="button" data-active={mode === m.v} onClick={() => setMode(m.v)} className="!flex flex-1 items-center justify-center gap-1.5 !px-1">
                  {m.icon} {m.l}
                </button>
              ))}
            </div>
          </div>
          <Collapse open={isVehicleMode(mode)}>
            <VehicleFields mode={mode} plate={vehiclePlate} details={vehicleDetails} onPlate={setVehiclePlate} onDetails={setVehicleDetails} />
          </Collapse>
        </section>

        <section className="surface animate-in space-y-3">
          <div className="flex items-center justify-between">
            <p className="section-title !mb-0 flex-1">Guests</p>
            <div className="ml-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button type="button" onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-brand-50 hover:text-brand-700" aria-label="Fewer guests">
                <Minus size={14} />
              </button>
              <input type="number" min={1} max={20} value={guestCount} onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)} className="w-8 bg-transparent text-center text-sm font-bold outline-none" aria-label="Number of guests" />
              <button type="button" onClick={() => setGuestCount(Math.min(20, guestCount + 1))} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-brand-50 hover:text-brand-700" aria-label="More guests">
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setBulkOpen((o) => !o)} className="flex items-center gap-1 text-sm font-medium text-slate-700 transition hover:text-brand-700">
              <ChevronRight size={16} className={`transition-transform duration-300 ${bulkOpen ? 'rotate-90' : ''}`} />
              Bulk paste
              <InfoTip text="One guest per line: Name, Email, Phone, Address. Leave the box to auto-fill the guest cards." size={12} />
            </button>
            <Tooltip content="Download a sample guest list">
              <button type="button" onClick={downloadSampleTxt} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50">
                <Download size={14} /> Sample
              </button>
            </Tooltip>
          </div>
          <Collapse open={bulkOpen}>
            <textarea rows={4} value={bulkText} onChange={(e) => setBulkText(e.target.value)} onBlur={applyBulk} placeholder={'Name, Email, Phone number, Address\nName, Email, Phone number, Address'} className="input text-sm" />
          </Collapse>

          <div className="space-y-2">
            {guests.map((g, i) => {
              const open = openGuests[i] !== false;
              const summary = g.fullName || g.email ? [g.fullName, g.email].filter(Boolean).join(' · ') : `Guest ${i + 1}`;
              return (
                <div key={i} id={`guest-card-${i}`} ref={(el) => { guestRefs.current[i] = el; }} className={`card scroll-mt-24 transition ${open ? '!border-brand-200 shadow-lift' : ''}`}>
                  <button type="button" onClick={() => toggleGuest(i)} className="group flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
                    {g.fullName ? <Avatar name={g.fullName} size={30} /> : (
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-700 text-xs font-bold text-on-brand on-brand-fill">{i + 1}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{summary}</span>
                    {g.email && <Mail size={14} className="text-emerald-500" />}
                    {!g.email.trim() && !g.phone.trim() && (g.fullName.trim() || i > 0) && (
                      <Tooltip content="No email or phone — gate will photograph this guest">
                        <span className="inline-flex" role="img" aria-label="No email or phone"><PhoneOff size={13} className="text-slate-400" /></span>
                      </Tooltip>
                    )}
                    <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 group-hover:text-brand-500 ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <Collapse open={open}>
                    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 bg-gradient-to-b from-brand-50/40 to-white px-3.5 pb-3.5 pt-3">
                      <input value={g.fullName} onChange={(e) => updateGuest(i, 'fullName', e.target.value)} placeholder="Full name" className="input !py-2.5 text-sm" />
                      <input type="email" value={g.email} onChange={(e) => updateGuest(i, 'email', e.target.value)} placeholder="Email (optional) — invite link is sent here" className="input !py-2.5 text-sm" />
                      <input type="tel" inputMode="tel" value={g.phone} onChange={(e) => updateGuest(i, 'phone', e.target.value)} placeholder="Phone (optional)" className="input !py-2.5 text-sm" />
                      <input value={g.address} onChange={(e) => updateGuest(i, 'address', e.target.value)} placeholder="Address" className="input !py-2.5 text-sm" />
                    </div>
                  </Collapse>
                </div>
              );
            })}
          </div>
        </section>

        <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
          <PhoneOff size={13} className="mt-0.5 shrink-0 text-slate-400" />
          Email and phone are optional. Guests without either are tagged automatically and photographed at the gate — no admin approval needed.
        </p>

        {error && <Notice tone="error">{error}</Notice>}

        <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-base">
          {loading ? 'Creating…' : <><Sparkles size={17} /> Create invite</>}
        </button>
      </form>

      <SleekOverlay
        open={missing.length > 0}
        onClose={() => setMissing([])}
        tone="amber"
        icon={<UserX size={20} />}
        title={missing.length === 1 ? `${missing[0].name} has no email or phone number set` : `${missing.length} guests have no email or phone number set`}
        subtitle={missing.length === 1 ? 'They will not receive an invite link.' : 'They will not receive an invite link.'}
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-ghost flex-1" onClick={goBackAndFill}>
              <PencilLine size={16} /> Go back and fill
            </button>
            <button type="button" className="btn-primary flex-1" onClick={createNow} disabled={loading}>
              <Send size={16} /> {guests.length - missing.length > 0 ? 'Invite those with contact details' : 'Create without contacts'}
            </button>
          </div>
        }
      >
        {missing.length > 1 && (
          <ul className="space-y-1.5 pt-1.5" data-testid="missing-contact-list">
            {missing.map((m) => (
              <li key={m.i} className="flex items-center gap-2.5 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm">
                <Avatar name={m.name} size={26} />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{m.name}</span>
                <PhoneOff size={13} className="text-slate-400" aria-label="No email or phone" />
              </li>
            ))}
          </ul>
        )}
        <p className={`text-sm text-slate-600 ${missing.length > 1 ? 'mt-3' : 'pt-1.5'}`}>
          {guests.length - missing.length > 0
            ? 'Guests with an email get their link now. '
            : ''}
          {missing.length === 1 ? 'This guest will be added as a no-contact guest' : 'These guests will be added as no-contact guests'}: the gate takes {missing.length === 1 ? 'their' : 'each'} photo on arrival and sends it to you to confirm.
        </p>
      </SleekOverlay>
    </div>
  );
}
