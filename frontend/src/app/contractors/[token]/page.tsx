'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { Briefcase, Camera, Download, Mail, RefreshCw } from 'lucide-react';
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
    try { await api.renewContractor(row.id, {}); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
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
      <PageHeader back="/contractors" icon={<Briefcase size={20} />} title={row.fullName} subtitle={[row.company, row.organisation?.name].filter(Boolean).join(' · ')} />
      {error && <Notice tone="error">{error}</Notice>}
      <div ref={cardRef} className="surface mb-4 overflow-hidden p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusPill tone={row.status === 'valid' ? 'emerald' : 'rose'} label={`${row.status === 'valid' ? 'Valid through' : row.status} ${new Date(row.validThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`} />
        </div>
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-2">
          <div className="flex justify-center rounded-2xl bg-white p-3">
            <QRCodeCanvas id="contractor-qr" value={row.qrPayload || JSON.stringify({ c: row.qrToken })} size={200} includeMargin />
          </div>
          <div className="flex flex-col items-center text-center">
            {row.photoPath ? <img src={`${API}/contractors/photo/${row.photoPath}`} alt="" className="h-28 w-28 rounded-full object-cover ring-2 ring-brand-200" /> : <span className="flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Camera size={28} /></span>}
            <p className="mt-3 font-semibold text-slate-900">{row.fullName}</p>
            <p className="text-sm text-slate-500">{row.company || 'Contractor'}</p>
            <p className="text-xs text-slate-400">{row.organisation?.name}</p>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" className="btn-quiet !px-2 text-xs" onClick={cam ? stopCam : startCam}><Camera size={14} /> {cam ? 'Close' : 'Photo'}</button>
          <button type="button" className="btn-quiet !px-2 text-xs" disabled={!!busy} onClick={downloadBadge}><Download size={14} /> Badge</button>
          <button type="button" className="btn-quiet !px-2 text-xs" disabled={!!busy || !row.email} onClick={() => reprint(true)}><Mail size={14} /> Email</button>
          <button type="button" className="btn-quiet !px-2 text-xs" disabled={!!busy} onClick={renew}><RefreshCw size={14} /> Renew</button>
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
          {(row.history || []).map((h: any) => (
            <li key={h.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <b className="text-slate-800">{new Date(h.arrivedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
              {h.destination && <span> · {h.destination}</span>}
              <span className="block text-slate-400">{h.exitedAt ? 'Out ' + new Date(h.exitedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'On site'}</span>
            </li>
          ))}
          {!(row.history || []).length && <li className="text-xs text-slate-400">No gate visits yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
