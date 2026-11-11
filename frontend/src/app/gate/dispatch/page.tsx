'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Package, Plus } from 'lucide-react';
import { api, getUser } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { Notice, SkeletonList } from '@/components/ui/Bits';
import SleekOverlay, { scrollIntoOverlay } from '@/components/ui/SleekOverlay';
import StatusPill from '@/components/ui/StatusPill';
import Collapse from '@/components/ui/Collapse';
import HostSuggest, { type HostPick } from '@/components/HostSuggest';
import CaptureThumbGrid from '@/components/CaptureThumbGrid';
import { InAppCallButton, PhoneCallLink } from '@/components/CallButtons';

const TONE: Record<string, 'emerald' | 'amber' | 'rose' | 'slate'> = {
  REGISTERED: 'slate',
  AWAITING_APPROVAL: 'amber',
  APPROVED: 'emerald',
  DECLINED: 'rose',
  DELIVERED: 'emerald',
  EXITED: 'slate',
};

export default function DispatchPage() {
  const user = getUser();
  const isGate = ['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(String(user?.role));
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  async function load() {
    setError('');
    const list = await api.dispatches(status || undefined);
    setRows(Array.isArray(list) ? list : list?.rows || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [status]);

  async function decide(id: string, organisationId: string, approve: boolean) {
    try { await api.decideDispatch(id, { organisationId, approve }); await load(); } catch (e: any) { setError(e.message); }
  }
  async function mark(id: string, s: string) {
    try { await api.markDispatch(id, s); await load(); } catch (e: any) { setError(e.message); }
  }
  async function ring(id: string, hostId: string) {
    try { const call = await api.startDispatchRing(id, hostId); window.dispatchEvent(new CustomEvent('vicit:ring-local', { detail: call })); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="page">
      <PageHeader icon={<Package size={20} />} title="Dispatch" subtitle="Uninvited couriers, letters and parcels" info="Register a courier, choose one or more agencies, and optionally ring a host for approval."
        actions={isGate ? <button type="button" className="btn-primary !px-3 !py-2 text-sm" onClick={() => setOpen(true)}><Plus size={15} /> New</button> : undefined}
      />
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {['', 'AWAITING_APPROVAL', 'REGISTERED', 'APPROVED', 'DELIVERED'].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`chip whitespace-nowrap ${status === s ? '!bg-brand-600 !text-on-brand' : ''}`}>{s ? s.replace(/_/g, ' ').toLowerCase() : 'All'}</button>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && <SkeletonList />}
      <ul className="space-y-3">
        {(rows || []).map((d) => (
          <li key={d.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{d.courierName}</p>
                <p className="text-xs text-slate-500">{[d.courierCompany, d.courierPhone].filter(Boolean).join(' · ')}</p>
              </div>
              <StatusPill tone={TONE[d.status] || 'slate'} label={String(d.status || '').replace(/_/g, ' ').toLowerCase()} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(d.items || []).map((it: any) => (
                <li key={it.id} className="chip !py-0.5">{it.description}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</li>
              ))}
            </ul>
            {!!(d.photoPaths?.length || d.photoPath) && (
              <div className="mt-3 space-y-1.5">
                <CaptureThumbGrid
                  photos={(d.photoPaths?.length ? d.photoPaths : [d.photoPath]).filter(Boolean).map((path: string, i: number) => ({
                    preview: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/dispatches/photo/${path}`,
                    alt: `Particulars ${i + 1}`,
                  }))}
                />
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              {(d.destinations || []).map((dest: any) => (
                <div key={dest.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                  <b className="text-slate-800">{dest.organisation?.name}</b>
                  <span className="text-slate-400">{dest.host?.fullName || 'No host yet'}</span>
                  <StatusPill tone={TONE[dest.status] || 'slate'} label={String(dest.status || '').replace(/_/g, ' ').toLowerCase()} />
                  {dest.acknowledgedAt && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                      Acknowledged {new Date(dest.acknowledgedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {dest.acknowledgeComment ? ` · “${dest.acknowledgeComment}”` : ''}
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    {dest.hostId && isGate && <InAppCallButton compact className="!px-2 !py-1" onClick={() => ring(d.id, dest.hostId)} />}{dest.host?.phone && <PhoneCallLink phone={dest.host.phone} compact />}
                    {dest.status === 'PENDING' && <button type="button" className="btn-success !px-2 !py-1" onClick={() => decide(d.id, dest.organisationId, true)}>Approve</button>}
                    {dest.status === 'PENDING' && <button type="button" className="btn-danger !px-2 !py-1" onClick={() => decide(d.id, dest.organisationId, false)}>Decline</button>}
                  </span>
                </div>
              ))}
            </div>
            {isGate && d.status !== 'EXITED' && d.status !== 'DECLINED' && (
              <div className="mt-3 flex gap-2">
                {d.status !== 'DELIVERED' && <button type="button" className="btn-quiet flex-1 !py-2 text-xs" onClick={() => mark(d.id, 'DELIVERED')}>Mark delivered</button>}
                <button type="button" className="btn-quiet flex-1 !py-2 text-xs" onClick={() => mark(d.id, 'EXITED')}>Courier left</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows && !rows.length && <p className="py-10 text-center text-sm text-slate-500">No dispatches yet.</p>}
      <NewDispatch open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); load(); }} />
    </div>
  );
}

function NewDispatch({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [form, setForm] = useState({ courierName: '', courierPhone: '', courierCompany: '', notes: '', items: 'Letter' });
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [pickedHosts, setPickedHosts] = useState<Record<string, HostPick | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<{ preview: string; path: string }[]>([]);
  const [camError, setCamError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camBox = useRef<HTMLDivElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => { if (open) api.directoryAgencies().then(setAgencies).catch(() => {}); }, [open]);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setCamError('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      } catch {
        setCamError('Could not open the camera. You can still register the dispatch without a photo.');
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  function toggleOrg(id: string) {
    setOrgIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const items = form.items.split(/\n|,/).map((s) => s.trim()).filter(Boolean).map((description) => ({ description, quantity: 1 }));
      const hosts: Record<string, string> = {};
      orgIds.forEach((id) => { if (pickedHosts[id]?.id) hosts[id] = pickedHosts[id]!.id; });
      const paths = photos.map((p) => p.path).filter(Boolean);
      await api.createDispatch({ ...form, items, organisationIds: orgIds, hosts, photoPath: paths[0] || undefined, photoPaths: paths });
      onCreated();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <SleekOverlay
      open={open}
      onClose={onClose}
      title="Register dispatch"
      subtitle="Courier with letters, parcels or physical mail"
      icon={<Package size={20} />}
      size="xl"
      placement="sheet"
      contentClassName="max-lg:overflow-y-auto lg:flex lg:flex-col lg:!overflow-hidden"
      footer={
        <>
          <button type="button" className="btn-ghost min-w-[7rem] flex-1" onClick={onClose}>Cancel</button>
          <button type="submit" form="new-dispatch-form" disabled={busy || !orgIds.length} className="btn-primary min-w-[7rem] flex-1">{busy ? 'Saving…' : 'Register dispatch'}</button>
        </>
      }
    >
      <form id="new-dispatch-form" onSubmit={submit} className="flex min-h-0 flex-col lg:h-full lg:flex-1">
        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:gap-6 lg:overflow-hidden">
          <div className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:pb-2" data-overlay-scroll>
            <label className="block"><span className="label">Courier name</span><input className="input" required value={form.courierName} onChange={(e) => setForm({ ...form, courierName: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="label">Phone</span><input className="input" value={form.courierPhone} onChange={(e) => setForm({ ...form, courierPhone: e.target.value })} /></label>
              <label className="block"><span className="label">Company</span><input className="input" value={form.courierCompany} onChange={(e) => setForm({ ...form, courierCompany: e.target.value })} /></label>
            </div>
            <div>
              <p className="label">Destination agencies</p>
              <div className="flex flex-col gap-1 rounded-xl border border-slate-200 p-2">
                {agencies.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={orgIds.includes(a.id)} onChange={() => toggleOrg(a.id)} />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <Collapse open={orgIds.length > 0}>
              <div className="space-y-2">
                {orgIds.map((id) => (
                  <HostSuggest
                    key={id}
                    organisationId={id}
                    label={`Host at ${agencies.find((a) => a.id === id)?.name || 'agency'}`}
                    placeholder="Search staff to notify or ring…"
                    value={pickedHosts[id] || null}
                    onChange={(h) => setPickedHosts((cur) => ({ ...cur, [id]: h }))}
                  />
                ))}
              </div>
            </Collapse>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
          <div className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:pb-2" data-overlay-scroll>
            <label className="block"><span className="label">Items (one per line)</span><textarea className="input min-h-[72px] lg:min-h-[120px]" required value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} /></label>
            <div ref={camBox} className="space-y-2">
              <p className="label">Particulars photo</p>
              <div className="overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} autoPlay muted playsInline className="aspect-video h-auto w-full max-h-56 bg-black object-cover lg:max-h-[min(240px,32dvh)]" />
              </div>
              {camError && <p className="text-[11px] text-rose-600">{camError}</p>}
              <button
                type="button"
                disabled={photos.length >= 10}
                className="btn-primary w-full !py-3.5"
                onClick={async () => {
                  const video = videoRef.current;
                  if (!video || video.readyState < 2 || !video.videoWidth) {
                    setCamError('Camera is still starting. Try again in a moment.');
                    return;
                  }
                  if (photos.length >= 10) {
                    setCamError('You can capture up to 10 photos.');
                    return;
                  }
                  const canvas = document.createElement('canvas');
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;
                  ctx.drawImage(video, 0, 0);
                  const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.9));
                  if (!blob) { setCamError('Could not capture the frame.'); return; }
                  const preview = URL.createObjectURL(blob);
                  try {
                    const up = await api.uploadDispatchPhoto(blob);
                    const path = up.photoPath || up.filename || up.path || '';
                    setPhotos((cur) => [...cur, { preview, path }]);
                    setCamError('');
                    setTimeout(() => scrollIntoOverlay(camBox.current), 80);
                  } catch (err: any) {
                    URL.revokeObjectURL(preview);
                    setCamError(err.message || 'Could not save the photo.');
                  }
                }}
              >
                <Camera size={16} /> Capture
              </button>
              <CaptureThumbGrid
                photos={photos.map((p, i) => ({ preview: p.preview, alt: `Particulars ${i + 1}` }))}
                onRemove={(index) => {
                  setPhotos((cur) => {
                    const item = cur[index];
                    if (item) URL.revokeObjectURL(item.preview);
                    return cur.filter((_, i) => i !== index);
                  });
                }}
              />
            </div>
          </div>
        </div>
      </form>
    </SleekOverlay>
  );
}
