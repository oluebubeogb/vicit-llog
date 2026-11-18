'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Download, IdCard, Loader2, Printer, Tag, TriangleAlert, X } from 'lucide-react';
import { api } from '@/lib/api';
import Sheet from '@/components/ui/Sheet';

export type GatePassProtocol = 'PLAIN_TAGS' | 'PRINTED_PASS' | 'NONE';

export const PROTOCOL_OPTIONS: Array<{ v: GatePassProtocol; title: string; short: string; body: string }> = [
  { v: 'PLAIN_TAGS', title: 'Plain tags', short: 'Plain tags', body: 'Tags issued at each gate, returned at exit.' },
  { v: 'PRINTED_PASS', title: 'Printed pass', short: 'Printed pass', body: 'Vicit prints a photo pass with the QR, returned at exit.' },
  { v: 'NONE', title: 'No cards', short: 'No cards', body: 'Guests use their registration QR only.' },
];

export const kindLabel = (k: string) => (k === 'PASS' ? 'Pass' : 'Tag');

export function hostDestination(host: any, purpose?: string) {
  return [host?.fullName, host?.portfolio].filter(Boolean).join(' · ') || purpose || '';
}

/** Print a PDF blob through a hidden iframe (falls back to a new tab). */
export function printPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
  };
  document.body.appendChild(frame);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Print + Download icon pair for one or many guests (one multi-page PDF, never a zip). */
export function PassPdfButtons({ visitorIds, destination, onDone, onError, compact, disabled, label }: { visitorIds: string[]; destination?: string; onDone?: () => void; onError?: (m: string) => void; compact?: boolean; disabled?: boolean; label?: boolean }) {
  const [busy, setBusy] = useState<'' | 'print' | 'download'>('');
  const run = async (mode: 'print' | 'download') => {
    if (!visitorIds.length) return;
    setBusy(mode);
    try {
      const { blob, filename } = await api.passesPdf(visitorIds, mode, destination);
      if (mode === 'print') printPdfBlob(blob);
      else downloadBlob(blob, filename);
      onDone?.();
    } catch (e: any) {
      onError?.(e?.message || 'Could not build the pass');
    } finally {
      setBusy('');
    }
  };
  const cls = compact ? 'btn-ghost !px-2.5 !py-2' : 'btn-ghost !px-3 !py-2 text-xs';
  const many = visitorIds.length > 1;
  return (
    <div className="flex items-center gap-1.5" data-testid="pass-pdf-buttons">
      <button type="button" className={cls} disabled={disabled || !!busy || !visitorIds.length} onClick={() => run('print')} title={many ? `Print ${visitorIds.length} passes` : 'Print pass'} aria-label={many ? `Print ${visitorIds.length} passes` : 'Print pass'}>
        {busy === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
        {label && <span>{many ? `Print ${visitorIds.length}` : 'Print'}</span>}
      </button>
      <button type="button" className={cls} disabled={disabled || !!busy || !visitorIds.length} onClick={() => run('download')} title={many ? `Download ${visitorIds.length} passes (one PDF)` : 'Download pass (PDF)'} aria-label={many ? `Download ${visitorIds.length} passes` : 'Download pass'}>
        {busy === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {label && <span>{many ? `Download ${visitorIds.length}` : 'Download'}</span>}
      </button>
    </div>
  );
}

function tint(hex: string, t: number) {
  const ok = /^#[0-9a-f]{6}$/i.test(hex || '');
  const n = parseInt((ok ? hex : '#1e3a8a').slice(1), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * t).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Width of `text` in px for a CSS font size/weight in Helvetica (falls back to an estimate on the server). */
function textWidth(text: string, font: string) {
  if (measureCtx === undefined) measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!measureCtx) return text.length * parseFloat(font.replace(/^bold /, '')) * (font.startsWith('bold') ? 0.6 : 0.53);
  measureCtx.font = `${font} Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}
function fitText(text: string, font: string, max: number) {
  if (textWidth(text, font) <= max) return text;
  let t = text;
  while (t.length > 1 && textWidth(t + '…', font) > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
/** Mirrors the PDF: shrink the name from 9.2 to 6.6 until it wraps into two lines. */
function fitName(name: string, max: number) {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const wrap = (size: number) => {
    const font = `bold ${size}px`; const lines: string[] = [];
    for (const w of words) {
      const last = lines[lines.length - 1];
      if (last !== undefined && textWidth(`${last} ${w}`, font) <= max) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    return { lines, fits: lines.length <= 2 && lines.every((l) => textWidth(l, font) <= max) };
  };
  for (let size = 9.2; size > 6.6; size = Math.round((size - 0.4) * 10) / 10) { const r = wrap(size); if (r.fits) return { size, lines: r.lines }; }
  const r = wrap(6.6);
  const lines = r.lines.slice(0, 2);
  if (r.lines.length > 2) lines[1] = r.lines.slice(1).join(' ');
  return { size: 6.6, lines: lines.map((l) => fitText(l, 'bold 6.6px', max)) };
}

/**
 * On-screen CR80 card — the same v23 layout as the printed PDF, drawn in PDF points
 * (242.65 × 153.07) so preview and print line up: agency logo + name, large “Visitor”, rule,
 * photo / name / portfolio, divider, Host · Destination chip · Valid until, registration QR.
 */
export function PassCardPreview({ card }: { card: any }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const logo = card.logoUrl ? (card.logoUrl.startsWith('http') ? card.logoUrl : `${apiBase}${card.logoUrl}`) : null;
  const W = 242.65, H = 153.07;
  const accent = /^#[0-9a-f]{6}$/i.test(card.agencyColor || '') ? card.agencyColor : '#1e3a8a';
  const NAVY = '#0f1f3d', MUTED = '#64748b';
  const [vDate, vTime] = String(card.validUntilLabel || '').split(', ');
  const initials = String(card.fullName || '').split(/\s+/).filter(Boolean).slice(0, 2).map((x: string) => x[0]).join('').toUpperCase();
  const tx = logo ? 34 : 10;
  const qrSize = 64, qx = W - qrSize - 8, qy = H - 13 - qrSize - 6;
  const rx = 104;
  const fo = { fontFamily: 'Helvetica, Arial, sans-serif' } as const;
  const clip = `pc-${card.visitorId}`;
  const rw = W - rx - 10;
  const nameFit = fitName(card.fullName, 82);
  const subY = 96 + nameFit.size * (0.9 + (nameFit.lines.length - 1) * 1.08) + 8.4;
  const destText = fitText(card.destination || '—', 'bold 6.4px', rw - 14);
  const chipW = Math.min(rw, textWidth(destText, 'bold 6.4px') + 17);
  return (
    <div className="mx-auto w-full max-w-[460px]" data-testid="pass-card-preview">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-hidden rounded-[10px] shadow-lift ring-1 ring-slate-200" role="img" aria-label={`Visitor pass for ${card.fullName}`}>
        <defs><clipPath id={clip}><rect x={10} y={40} width={44} height={52} rx={5} /></clipPath></defs>
        <rect width={W} height={H} fill="#fff" />
        <path d={`M ${W - 78} 0 C ${W - 46} 10 ${W - 18} 30 ${W} 58 L ${W} 0 Z`} fill={tint(accent, 0.07)} />
        <path d={`M ${W - 46} 0 C ${W - 26} 8 ${W - 10} 20 ${W} 34 L ${W} 0 Z`} fill={tint(accent, 0.13)} />
        <path d={`M 0 ${H - 52} C 18 ${H - 34} 40 ${H - 18} 74 ${H - 11} L 0 ${H - 11} Z`} fill={tint(accent, 0.07)} />
        {logo && <image href={logo} x={10} y={8} width={20} height={20} preserveAspectRatio="xMidYMid meet" />}
        <text x={tx} y={17.4} fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: 7.6, letterSpacing: 0.3 }}>{String(card.agency || '').toUpperCase()}</text>
        <text x={tx} y={24.5} fill={MUTED} style={{ ...fo, fontSize: 4.8 }}>Visitor Access &amp; Exit Control</text>
        <text x={W - 10} y={24} textAnchor="end" fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: 19 }}>Visitor</text>
        <line x1={10} y1={34} x2={W - 10} y2={34} stroke={tint(accent, 0.45)} strokeWidth={0.6} />
        <rect x={10} y={40} width={44} height={52} rx={5} fill={tint(accent, 0.1)} />
        {card.photoPath
          ? <image href={`${apiBase}/visitors/photo/${card.photoPath}`} x={10} y={40} width={44} height={52} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
          : <text x={32} y={70} textAnchor="middle" fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: 15 }}>{initials}</text>}
        <rect x={10} y={40} width={44} height={52} rx={5} fill="none" stroke="#d6dde8" strokeWidth={0.5} />
        {nameFit.lines.map((ln, i) => (
          <text key={i} x={10} y={96 + nameFit.size * (0.9 + i * 1.08)} fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: nameFit.size }}>{ln}</text>
        ))}
        <rect x={10} y={subY - 4.1} width={5.2} height={4.6} rx={0.6} fill={tint(accent, 0.75)} />
        <rect x={11.9} y={subY - 5} width={1.4} height={1.2} rx={0.3} fill="none" stroke={tint(accent, 0.75)} strokeWidth={0.5} />
        <text x={17.6} y={subY} fill={MUTED} style={{ ...fo, fontSize: 5.6 }}>{fitText(card.subline || card.agency || '', '5.6px', 82 - 7.6)}</text>
        <line x1={96} y1={40} x2={96} y2={H - 17} stroke={tint(accent, 0.35)} strokeWidth={0.5} />
        <text x={rx} y={44} fill={MUTED} style={{ ...fo, fontWeight: 700, fontSize: 4.7, letterSpacing: 0.5 }}>HOST</text>
        <text x={rx} y={52.6} fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: 7.4 }}>{fitText(card.hostName || '—', 'bold 7.4px', rw)}</text>
        <text x={rx} y={63} fill={MUTED} style={{ ...fo, fontWeight: 700, fontSize: 4.7, letterSpacing: 0.5 }}>DESTINATION</text>
        <g data-testid="pass-destination-chip">
          <rect x={rx} y={65} width={chipW} height={11} rx={5.5} fill={tint(accent, 0.1)} />
          <rect x={rx + 4.5} y={67.5} width={4.4} height={6} rx={0.4} fill={accent} />
          {[0, 1].map((cx) => [0, 1, 2].map((cy) => <rect key={`${cx}${cy}`} x={rx + 5.3 + cx * 1.6} y={68.3 + cy * 1.6} width={0.9} height={0.9} fill={tint(accent, 0.1)} />))}
          <text x={rx + 11.5} y={72.8} fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: 6.4 }}>{destText}</text>
        </g>
        <text x={rx} y={87} fill={MUTED} style={{ ...fo, fontWeight: 700, fontSize: 4.7, letterSpacing: 0.5 }}>VALID UNTIL</text>
        <text x={rx} y={95.4} fill={NAVY} style={{ ...fo, fontWeight: 700, fontSize: 7 }}>{vDate || card.validUntilLabel}</text>
        {vTime && <text x={rx} y={104} fill={MUTED} style={{ ...fo, fontSize: 6 }}>{vTime}</text>}
        <image href={card.qrDataUrl} x={qx} y={qy} width={qrSize} height={qrSize} />
        <text x={rx} y={qy + qrSize - 1.5} fill={MUTED} style={{ fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: 5.2 }}>{card.passphrase}</text>
        <rect x={0} y={H - 11} width={W} height={11} fill="#f3f5f9" />
        <rect x={0} y={H - 11} width={W} height={0.6} fill={tint(accent, 0.3)} />
        <text x={10} y={H - 4} fill="#475569" style={{ ...fo, fontSize: 4.6 }}>Return this pass at exit · Scan at every gate</text>
        <text x={W - 10} y={H - 4} textAnchor="end" fill="#94a3b8" style={{ ...fo, fontSize: 4.4 }}>Powered by CISTECH&apos;s Vicit 1.0.1</text>
      </svg>
    </div>
  );
}

/** Preview sheet: one or many CR80 passes with Print / Download icons. */
export function PassPreviewSheet({ open, visitorIds, onClose, onPrinted }: { open: boolean; visitorIds: string[]; onClose: () => void; onPrinted?: () => void }) {
  const [cards, setCards] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState('');
  const key = visitorIds.join(',');
  useEffect(() => {
    if (!open || !visitorIds.length) return;
    setLoading(true);
    setError('');
    api.previewPasses(visitorIds)
      .then((rows: any[]) => { setCards(rows || []); setDestination(rows?.length === 1 ? rows[0].destination || '' : ''); })
      .catch((e: any) => setError(e?.message || 'Could not load the pass'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  const single = cards.length === 1;
  const blocked = cards.filter((c) => !c.canPrint);
  const printable = cards.filter((c) => c.canPrint).map((c) => c.visitorId);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      icon={<IdCard size={18} />}
      title={single ? 'Visitor pass' : `${cards.length || visitorIds.length} visitor passes`}
      subtitle="CR80 card · 85.6 × 54 mm · same QR as registration"
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">{printable.length > 1 ? 'One PDF, one pass per page' : 'Printing records the pass as issued at the Main Gate'}</p>
          <PassPdfButtons visitorIds={printable} destination={single ? destination : undefined} label onDone={onPrinted} onError={setError} />
        </div>
      }
    >
      {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>}
      {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
      {!loading && single && cards[0].canPrint && (
        <label className="mb-3 block">
          <span className="label">Destination on the pass</span>
          <input className="input !py-2 text-sm" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Office / floor / host" />
        </label>
      )}
      {!loading && blocked.length > 0 && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{blocked.map((c) => c.fullName).join(', ')} {blocked.length === 1 ? 'needs' : 'need'} a photo (or the visit is closed) — left out of the PDF.</p>
      )}
      <div className="space-y-4">
        {cards.map((c) => (
          <div key={c.visitorId} className={c.canPrint ? '' : 'opacity-50'}>
            <PassCardPreview card={single ? { ...c, destination } : c} />
            {c.item && <p className="mt-1.5 text-center text-[11px] text-slate-500">{c.item.status === 'ISSUED' ? `Issued · printed ${c.item.printCount}×` : `Closed · ${c.item.status.toLowerCase()}`}</p>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** History of every tag / pass issued to a guest (open and closed). */
export function PassItemHistory({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3" data-testid="pass-item-history">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tags &amp; passes</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-xs text-slate-700">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${i.status === 'ISSUED' ? 'bg-amber-100 text-amber-700' : i.status === 'LOST' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {i.kind === 'PASS' ? <IdCard size={12} /> : <Tag size={12} />}
            </span>
            <span className="min-w-0 flex-1">
              <b>{kindLabel(i.kind)}{i.tagNumber ? ` ${i.tagNumber}` : ''}</b> · {i.gate?.name || 'Gate'} · issued {fmt(i.issuedAt)}{i.issuedByName ? ` by ${i.issuedByName}` : ''}
              {i.destination && <span className="block text-slate-500">To: {i.destination}</span>}
              {i.status !== 'ISSUED' && <span className={`block ${i.status === 'LOST' ? 'text-rose-700' : 'text-emerald-700'}`}>{i.status === 'LOST' ? `Lost — ${i.lostReason}` : 'Returned'} {fmt(i.closedAt)}{i.closedByName ? ` · ${i.closedByName}` : ''}</span>}
              {i.kind === 'PASS' && i.printCount > 0 && <span className="block text-slate-400">Printed / downloaded {i.printCount}×</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Returned / Lost (with reason) for one open item. */
export function CloseItemRow({ item, onChanged, onError, here = true }: { item: any; onChanged: () => void; onError: (m: string) => void; here?: boolean }) {
  const [lost, setLost] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const close = async (status: 'RETURNED' | 'LOST') => {
    setBusy(status);
    try { await api.closePassItem(item.id, status, status === 'LOST' ? reason : undefined); onChanged(); }
    catch (e: any) { onError(e?.message || 'Could not update'); }
    finally { setBusy(''); }
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5" data-testid="pass-item-open">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">{item.kind === 'PASS' ? <IdCard size={15} /> : <Tag size={15} />}</span>
        <div className="min-w-0 flex-1 text-xs leading-snug">
          <p className="truncate font-semibold text-amber-950">{kindLabel(item.kind)}{item.tagNumber ? ` ${item.tagNumber}` : ''} out · {item.gate?.name || 'gate'}</p>
          <p className="truncate text-amber-800">{here ? 'Collect it before the guest exits here' : 'Must be collected at that gate'}</p>
        </div>
      </div>
      {here && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="btn-success !py-2 text-xs" disabled={!!busy} onClick={() => close('RETURNED')}>{busy === 'RETURNED' ? '…' : <><CheckCircle2 size={14} /> Returned</>}</button>
          <button type="button" className={`btn-ghost !py-2 text-xs !text-rose-700 ${lost ? 'ring-2 ring-rose-200' : ''}`} disabled={!!busy} onClick={() => setLost(!lost)}><TriangleAlert size={14} /> Lost</button>
        </div>
      )}
      {here && lost && (
        <div className="mt-2 flex gap-2">
          <input className="input min-w-0 flex-1 !py-1.5 text-xs" placeholder="Reason it was lost (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn-danger shrink-0 !px-3 !py-1.5 text-xs" disabled={!!busy || reason.trim().length < 3} onClick={() => close('LOST')}>Confirm</button>
        </div>
      )}
    </div>
  );
}

/**
 * Per-guest gate pass block on the gate page / mobile checkpoints.
 * Option 1: “Tag issued” (+ optional number, destination at the agency gate). Option 2: pass preview + print/download at Gate 1.
 * Any open item at this gate is closed here (returned / lost) — the backend blocks exit until then.
 */
export function GatePassPanel({ guest, protocol, gate, gateNumber, isFirstGate, passGateId, defaultDestination, onChanged, onError, onPreview }: { guest: any; protocol: GatePassProtocol; gate: any; gateNumber?: number; isFirstGate: boolean; passGateId?: string | null; defaultDestination: string; onChanged: () => void; onError: (m: string) => void; onPreview: (ids: string[]) => void }) {
  const [tagNo, setTagNo] = useState('');
  const [dest, setDest] = useState(defaultDestination);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDest(defaultDestination), [defaultDestination, gate?.id]);
  const items: any[] = guest.passItems || [];
  const open = items.filter((i) => i.status === 'ISSUED');
  const openHere = open.filter((i) => i.gateId === gate?.id);
  const openElsewhere = open.filter((i) => i.gateId !== gate?.id);
  const live = guest.status === 'INVITED' || guest.status === 'ARRIVED';
  const tagHere = openHere.find((i) => i.kind === 'TAG');
  const passOut = open.find((i) => i.kind === 'PASS');
  // Option 2 prints at Gate 1 only. A super gate officer whose screen has moved on to Gate 2 after the
  // Main Gate check-in can still print it, as long as no pass is out yet (never a second card).
  const mainId = guest.passGateId ?? passGateId;
  const passedMain = !!mainId && (guest.gateVisits || []).some((e: any) => e.gateId === mainId && e.decision === 'PASSED' && e.direction !== 'EXIT');
  const canPrintHere = isFirstGate || (!passOut && passedMain && guest.status !== 'ARRIVED');
  if (protocol === 'NONE' && !open.length) return null;
  if (!gate) return null;

  const issueTag = async () => {
    setBusy(true);
    try {
      await api.issuePassItem({ visitorId: guest.id, gateId: gate.id, tagNumber: tagNo.trim() || undefined, destination: isFirstGate ? undefined : dest.trim() || undefined });
      setTagNo('');
      onChanged();
    } catch (e: any) { onError(e?.message || 'Could not record the tag'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="gate-pass-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">{protocol === 'PRINTED_PASS' ? <IdCard size={14} /> : <Tag size={14} />}{protocol === 'PRINTED_PASS' ? 'Printed pass' : protocol === 'PLAIN_TAGS' ? 'Gate tag' : 'Outstanding items'}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{isFirstGate ? 'Gate 1 · Main' : `Gate ${gateNumber || 2}`}</span>
      </div>

      {openHere.map((i) => <CloseItemRow key={i.id} item={i} onChanged={onChanged} onError={onError} />)}
      {openElsewhere.map((i) => <CloseItemRow key={i.id} item={i} here={false} onChanged={onChanged} onError={onError} />)}

      {protocol === 'PLAIN_TAGS' && live && !tagHere && (
        <div className="space-y-2" data-testid="tag-issue-form">
          {!isFirstGate && (
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">Exact destination</span>
              <input className="input !py-2 text-sm" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Office, floor, room…" />
            </label>
          )}
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1 !py-2 text-sm" value={tagNo} onChange={(e) => setTagNo(e.target.value)} placeholder="Tag no." aria-label="Tag number (optional)" />
            <button type="button" className="btn-primary shrink-0 !px-3.5 !py-2 text-sm" disabled={busy} onClick={issueTag}><Tag size={15} /> {busy ? '…' : 'Tag issued'}</button>
          </div>
          <p className="text-[10.5px] text-slate-400">Number optional</p>
        </div>
      )}
      {protocol === 'PLAIN_TAGS' && tagHere && !isFirstGate && tagHere.destination && <p className="text-[11px] text-slate-500">Destination: {tagHere.destination}</p>}

      {protocol === 'PRINTED_PASS' && live && (
        canPrintHere ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary !px-3 !py-2 text-xs" disabled={!guest.photoPath} onClick={() => onPreview([guest.id])}><IdCard size={15} /> {passOut ? 'View pass' : 'Generate pass'}</button>
            <PassPdfButtons visitorIds={[guest.id]} compact disabled={!guest.photoPath} onDone={onChanged} onError={onError} />
            {!guest.photoPath && <span className="text-[11px] text-amber-700">Photo needed first</span>}
            {!isFirstGate && <span className="w-full text-[11px] text-slate-500">Printed at Main Gate. Scan its QR here.</span>}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">{passOut ? `Issued at ${passOut.gate?.name || 'Main Gate'}. Scan its QR here.` : 'No pass printed yet.'}</p>
        )
      )}
    </div>
  );
}

/** “Tags / passes out” list (dashboard + Visits). */
export function OutstandingPassList({ data, onOpen }: { data: any; onOpen?: (passphrase: string) => void }) {
  const items: any[] = data?.items || [];
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">Every tag and pass is back.</p>;
  return (
    <ul className="divide-y divide-slate-100" data-testid="outstanding-pass-list">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => onOpen?.(i.visitor?.invite?.passphrase)}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">{i.kind === 'PASS' ? <IdCard size={15} /> : <Tag size={15} />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{i.visitor?.fullName}</span>
              <span className="block truncate text-[11px] text-slate-500">{kindLabel(i.kind)}{i.tagNumber ? ` ${i.tagNumber}` : ''} · {i.gate?.name}{i.gate?.location?.organisation?.name ? ` · ${i.gate.location.organisation.name}` : ''} · since {fmt(i.issuedAt)}</span>
            </span>
            <span className="text-[10px] font-semibold text-slate-400">{i.visitor?.status === 'ARRIVED' ? 'On site' : i.visitor?.status === 'EXITED' ? 'Exited' : 'At gate'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function OutstandingPassSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen?: (p: string) => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { if (open) api.outstandingPassItems().then(setData).catch(() => setData({ items: [] })); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} icon={<Tag size={18} />} tone="amber" title="Tags / passes out" subtitle={data ? `${data.count} not yet returned` : 'Loading…'}>
      {data ? <OutstandingPassList data={data} onOpen={onOpen} /> : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>}
    </Sheet>
  );
}

export function useOutstandingPassItems(enabled = true) {
  const [data, setData] = useState<any>(null);
  const reload = () => api.outstandingPassItems().then(setData).catch(() => setData(null));
  useEffect(() => { if (enabled) reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [enabled]);
  return { data, reload };
}

export function XClose({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={16} /></button>;
}

/** Dashboard card: “Tags / passes out” count + the first unreturned items, with View all. */
export function TagsOutPanel({ gateId, onOpen, className = '' }: { gateId?: string; onOpen?: (passphrase: string) => void; className?: string }) {
  const [data, setData] = useState<any>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { api.outstandingPassItems(gateId).then(setData).catch(() => setData(null)); }, [gateId]);
  if (!data || (data.protocol === 'NONE' && !data.count)) return null;
  const preview = { ...data, items: (data.items || []).slice(0, 4) };
  return (
    <section className={`surface animate-in !p-3 ${className}`} data-testid="tags-out-panel">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">{data.protocol === 'PRINTED_PASS' ? <IdCard size={18} /> : <Tag size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Tags / passes out</p>
          <p className="truncate text-[11px] text-slate-500">{data.tags} tag{data.tags === 1 ? '' : 's'} · {data.passes} pass{data.passes === 1 ? '' : 'es'} not yet returned</p>
        </div>
        <span className="text-2xl font-bold text-amber-700">{data.count}</span>
      </div>
      {data.count > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-1">
          <OutstandingPassList data={preview} onOpen={onOpen} />
          {data.count > preview.items.length && <button type="button" className="mt-1 w-full rounded-xl py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setAll(true)}>View all {data.count}</button>}
        </div>
      )}
      <OutstandingPassSheet open={all} onClose={() => setAll(false)} onOpen={onOpen} />
    </section>
  );
}
