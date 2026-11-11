'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { Ban, Briefcase, Camera, Download, Mail, RefreshCw } from 'lucide-react';
import SleekOverlay from '@/components/ui/SleekOverlay';
import { api, getUser } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { Notice } from '@/components/ui/Bits';
import StatusPill from '@/components/ui/StatusPill';
import { useBrand } from '@/components/BrandProvider';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ContractorCardPage() {
  const { token } = useParams<{ token: string }>();
  const { brand } = useBrand();
  const user = getUser();
  const canManage = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'ADMIN'].includes(String(user?.role));
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [cam, setCam] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [renewMode, setRenewMode] = useState<'auto' | 'date'>('auto');
  const [renewDate, setRenewDate] = useState('');
  const [renewCycle, setRenewCycle] = useState('monthly');
  const [termReason, setTermReason] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  async function load() {
    const data = await api.contractor(String(token));
    setRow(data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [token]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function startCam() {
    setCam(true);
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    streamRef.current = s;
    setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); } }, 40);
    requestAnimationFrame(() => videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCam(false);
  }
  async function snap() {
    if (!videoRef.current || !row) return;
    const canvas = document.createElement('canvas');
    const size = Math.min(videoRef.current.videoWidth, videoRef.current.videoHeight) || 480;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sx = (videoRef.current.videoWidth - size) / 2;
    const sy = (videoRef.current.videoHeight - size) / 2;
    ctx.drawImage(videoRef.current, sx, sy, size, size, 0, 0, size, size);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92));
    setBusy('photo');
    try { await api.uploadContractorPhoto(row.id, blob); stopCam(); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }

  async function reprint(email = false) {
    setBusy('reprint');
    try { await api.reprintContractor(row.id, email); setError(''); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }
  async function renew() {
    setBusy('renew');
    try {
      const payload = renewMode === 'auto'
        ? { mode: 'auto', cycle: renewCycle || row.cycle }
        : { validThrough: renewDate, cycle: renewCycle || row.cycle };
      await api.renewContractor(row.id, payload);
      setRenewOpen(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }
  async function terminate() {
    if (termReason.trim().length < 3) { setError('Give a short reason (at least 3 characters).'); return; }
    setBusy('term');
    try {
      await api.terminateContractor(row.id, { reason: termReason.trim() });
      setTermOpen(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }

  async function downloadBadge() {
    if (!row) return;
    const width = 1200, height = 700;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const p = brand.primaryColor || '#2563eb';
    const s = brand.secondaryColor || '#1e40af';
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, p); g.addColorStop(1, s);
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    const qr = document.getElementById('contractor-qr') as HTMLCanvasElement | null;
    if (qr) ctx.drawImage(qr, 80, 90, 520, 520);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    round(ctx, 640, 90, 480, 520, 32); ctx.fill();
    if (row.photoPath) {
      try {
        const img = await loadImg(`${API}/contractors/photo/${row.photoPath}`);
        ctx.save(); ctx.beginPath(); ctx.arc(880, 230, 90, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, 790, 140, 180, 180); ctx.restore();
      } catch { /* skip */ }
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = 'bold 36px system-ui, sans-serif'; ctx.fillText(row.fullName, 880, 360);
    ctx.font = '22px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(row.company || 'Contractor', 880, 400);
    ctx.fillText(row.organisation?.name || '', 880, 436);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText('Valid through  ' + new Date(row.validThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), 880, 500);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `contractor-${row.fullName.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  if (error && !row) return <div className="page"><Notice tone="error">{error}</Notice></div>;
  if (!row) return <div className="page"><p className="text-sm text-slate-500">Loading…</p></div>;

  return (
    <div className="page">
      <PageHeader back="/contractors" icon={<Briefcase size={20} />} title={row.fullName} subtitle={[row.company, (row.agencies || []).map((a: any) => a.shortName || a.name).join(', ') || row.organisation?.name].filter(Boolean).join(' · ')} />
      {error && <Notice tone="error">{error}</Notice>}
      <div ref={cardRef} className="surface mb-4 overflow-hidden p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusPill tone={row.status === 'valid' ? 'emerald' : row.status === 'terminated' || row.status === 'expired' ? 'rose' : 'slate'} label={`${row.status === 'valid' ? 'Valid through' : row.status} ${row.validThrough ? new Date(row.validThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`} />
        </div>
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-2">
          <div className="flex justify-center rounded-2xl bg-white p-3">
            <QRCodeCanvas id="contractor-qr" value={row.qrPayload || JSON.stringify({ c: row.qrToken })} size={200} includeMargin />
          </div>
          <div className="flex flex-col items-center text-center">
            {row.photoPath ? <img src={`${API}/contractors/photo/${row.photoPath}`} alt="" className="h-28 w-28 rounded-full object-cover ring-2 ring-brand-200" /> : <span className="flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Camera size={28} /></span>}
            <p className="mt-3 font-semibold text-slate-900">{row.fullName}</p>
            <p className="text-sm text-slate-500">{row.company || 'Contractor'}</p>
            <p className="text-xs text-slate-400">{(row.agencies || []).map((a: any) => a.shortName || a.name).join(' · ') || row.organisation?.name}</p>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn-quiet inline-flex items-center gap-1 !px-2.5 !py-2" onClick={cam ? stopCam : startCam}><Camera size={14} strokeWidth={2.25} /><b className="text-xs">{cam ? 'Close' : 'Photo'}</b></button>
          <button type="button" className="btn-quiet inline-flex items-center gap-1 !px-2.5 !py-2" disabled={!!busy} onClick={downloadBadge}><Download size={14} strokeWidth={2.25} /><b className="text-xs">Badge</b></button>
          <button type="button" className="btn-quiet inline-flex items-center gap-1 !px-2.5 !py-2" disabled={!!busy || !row.email} onClick={() => reprint(true)}><Mail size={14} strokeWidth={2.25} /><b className="text-xs">Email</b></button>
          <button type="button" className="btn-quiet inline-flex items-center gap-1 !px-2.5 !py-2" disabled={!!busy} onClick={() => { setRenewCycle(row.cycle || 'monthly'); setRenewDate(row.validThrough ? String(row.validThrough).slice(0, 10) : ''); setRenewMode('auto'); setRenewOpen(true); }}><RefreshCw size={14} strokeWidth={2.25} /><b className="text-xs">Renew</b></button>
          {row.status !== 'terminated' && (
            <button type="button" className="btn-quiet inline-flex items-center gap-1 !px-2.5 !py-2 text-rose-700" onClick={() => setTermOpen(true)}><Ban size={14} strokeWidth={2.25} /><b className="text-xs">Terminate</b></button>
          )}
        </div>
      )}
      {cam && (
        <div className="surface mb-4 overflow-hidden p-3">
          <video ref={videoRef} autoPlay muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" />
          <button type="button" className="btn-primary mt-3 w-full" disabled={busy === 'photo'} onClick={snap}>{busy === 'photo' ? 'Saving…' : 'Capture photo'}</button>
        </div>
      )}

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">History</h2>
        <ul className="space-y-2">
          {(row.history || []).map((h: any) => {
            const inn = h.signedInAt || h.arrivedAt;
            const out = h.signedOutAt || h.exitedAt;
            const fmt = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return (
              <li key={h.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-1.5">
                  {inn && <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">In {fmt(inn)}</span>}
                  {out ? <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">Out {fmt(out)}</span> : <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">On site</span>}
                </div>
                <p className="mt-1 text-slate-500">{[h.destination, h.host?.fullName && `see ${h.host.fullName}`, h.organisation?.name || h.gate?.name].filter(Boolean).join(' · ')}</p>
              </li>
            );
          })}
          {!(row.history || []).length && <li className="text-xs text-slate-400">No gate visits yet.</li>}
        </ul>
      </section>

      <SleekOverlay open={renewOpen} onClose={() => setRenewOpen(false)} title="Renew pass" subtitle="Extend by the contract cycle, or pick an end date.">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Cycle</span>
            <select className="input" value={renewCycle} onChange={(e) => setRenewCycle(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <div className="segmented">
            <button type="button" data-active={renewMode === 'auto'} onClick={() => setRenewMode('auto')}>Auto</button>
            <button type="button" data-active={renewMode === 'date'} onClick={() => setRenewMode('date')}>End date</button>
          </div>
          {renewMode === 'auto' ? (
            <p className="text-sm text-slate-600">Adds one {renewCycle} period from the later of today and the current end date. Monthly adds one calendar month.</p>
          ) : (
            <label className="block"><span className="label">Valid through</span><input type="date" className="input" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} required /></label>
          )}
          <button type="button" className="btn-primary w-full" disabled={!!busy} onClick={renew}>{busy === 'renew' ? 'Saving…' : 'Renew pass'}</button>
        </div>
      </SleekOverlay>

      <SleekOverlay open={termOpen} onClose={() => setTermOpen(false)} title="Terminate pass" subtitle="The card will no longer be valid at any gate.">
        <div className="space-y-3">
          <label className="block">
            <span className="label">Reason</span>
            <textarea className="input min-h-[80px]" value={termReason} onChange={(e) => setTermReason(e.target.value)} placeholder="Why is this pass ending?" />
          </label>
          <button type="button" className="btn-danger w-full" disabled={!!busy} onClick={terminate}>{busy === 'term' ? 'Saving…' : 'Terminate pass'}</button>
        </div>
      </SleekOverlay>
    </div>
  );
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
