'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Camera,
  Check,
  QrCode,
  KeyRound,
  LogIn,
  LogOut,
  User,
  Building2,
  Calendar,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Download,
  Mail,
} from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import StatusPill from '@/components/ui/StatusPill';
import { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
import { useBrand } from '@/components/BrandProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
/** Hosted PNG of the gate QR (works for "save image", sharing, offline screenshots). */
function qrPngUrl(token: string, visitorId: string) {
  return `${API_URL}/visitors/qr/${encodeURIComponent(token)}/${encodeURIComponent(visitorId)}.png`;
}

type Visitor = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  photoPath?: string | null;
  qrCodeData?: string | null;
  /** Descriptive download name from the API, e.g. vicit-pass_ibe-okafor_2026-10-21.png */
  qrFileName?: string | null;
  status: string;
  enteredAt?: string | null;
  exitedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Invite = {
  id: string;
  token: string;
  purpose: string;
  passphrase: string;
  status: string;
  expectedAt?: string | null;
  expiresAt: string;
  host?: { fullName: string; email?: string };
  organisation?: { name: string };
  visitors: Visitor[];
};

function fmt(ts?: string | null) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function StatusBadge({
  done,
  label,
  time,
  active,
  last,
}: {
  done: boolean;
  label: string;
  time?: string | null;
  active?: boolean;
  last?: boolean;
}) {
  return (
    <div className="relative flex items-start gap-3 pb-3 last:pb-0">
      {!last && (
        <span className={`absolute left-[13px] top-8 h-[calc(100%-1.5rem)] w-0.5 rounded-full ${done ? 'bg-gradient-to-b from-emerald-400 to-emerald-200' : 'bg-slate-200'}`} />
      )}
      <div
        className={`relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition duration-500 ${
          done
            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_6px_14px_-4px_rgb(16_185_129/0.6)]'
            : active
              ? 'bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow'
              : 'bg-slate-100 text-slate-300 ring-1 ring-slate-200'
        }`}
      >
        {active && !done && <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/40" />}
        {done ? <Check size={15} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-current" />}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className={`text-sm font-semibold ${done ? 'text-slate-800' : active ? 'text-brand-800' : 'text-slate-400'}`}>{label}</p>
        {time && <p className="text-xs text-slate-500">{time}</p>}
      </div>
    </div>
  );
}

/** Detect a likely human face / non-empty scene in a video frame */
async function detectHumanInVideo(video: HTMLVideoElement): Promise<boolean> {
  try {
    // Prefer native FaceDetector when available
    const FD = (window as any).FaceDetector;
    if (typeof FD === 'function') {
      const detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(video);
      if (faces && faces.length > 0) return true;
    }
  } catch {
    // fall through
  }

  // Fallback: sample canvas variance — reject nearly blank frames
  try {
    const canvas = document.createElement('canvas');
    const w = 160;
    const h = 120;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true; // can't check — allow
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let sumSq = 0;
    let skinish = 0;
    const n = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += gray;
      sumSq += gray * gray;
      // rough skin-tone heuristic
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
        skinish++;
      }
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    // Blank wall / black frame has very low variance
    if (variance < 180) return false;
    // Prefer some skin-like pixels, but don't hard-require (lighting varies)
    if (skinish / n < 0.01 && variance < 800) return false;
    return true;
  } catch {
    return true;
  }
}

export default function VisitorPage() {
  const params = useParams();
  const token = params?.token as string;
  const { brand } = useBrand();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [localQr, setLocalQr] = useState<Record<string, string>>({});
  const [localPass, setLocalPass] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.publicInvite(token);
      setInvite(data);
      // Auto-select first visitor without photo, else first visitor
      const needPhoto = data.visitors?.find((v: Visitor) => !v.photoPath);
      const first = needPhoto || data.visitors?.[0];
      if (first) setSelectedId(first.id);
      // Cache existing QR codes
      const qrs: Record<string, string> = {};
      for (const v of data.visitors || []) {
        if (v.qrCodeData) qrs[v.id] = v.qrCodeData;
      }
      setLocalQr(qrs);
      if (data.passphrase) setLocalPass(data.passphrase);
    } catch (err: any) {
      setError(err.message || 'Invite not found');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  async function startCamera() {
    setCaptureError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(s);
      setCapturing(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      setCaptureError('Camera access denied. Please allow camera permission and try again.');
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCapturing(false);
  }

  async function takePhoto() {
    if (!videoRef.current || !canvasRef.current || !selectedId || !token) return;
    setCaptureError('');
    setUploading(true);

    try {
      const ok = await detectHumanInVideo(videoRef.current);
      if (!ok) {
        setCaptureError(
          'No person detected. Centre your face in the frame and try again — empty scenes cannot be registered.',
        );
        setUploading(false);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const size = Math.min(video.videoWidth, video.videoHeight) || 480;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // Centre-crop square
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Could not capture image');

      const file = new File([blob], 'passport.jpg', { type: 'image/jpeg' });
      const result = await api.uploadPhoto(token, selectedId, file);

      setLocalQr((prev) => ({
        ...prev,
        [selectedId]: result.qrCodeData,
      }));
      if (result.passphrase) setLocalPass(result.passphrase);

      stopCamera();
      await load();
    } catch (err: any) {
      setCaptureError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <BrandMark size={60} className="animate-float" />
        <Loader2 className="animate-spin text-brand-500" size={24} />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="page flex min-h-screen items-center justify-center">
        <div className="surface animate-in w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100 text-rose-500 shadow-inner">
            <AlertCircle size={30} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Unable to open invite</h1>
          <p className="mt-1 text-sm text-slate-500">{error || 'Not found'}</p>
          <p className="mt-4 text-xs text-slate-400">Please contact your host for a new link.</p>
        </div>
      </div>
    );
  }

  const selected = invite.visitors.find((v) => v.id === selectedId) || invite.visitors[0];
  const hasPhoto = Boolean(selected?.photoPath);
  const qr = selected ? localQr[selected.id] || selected.qrCodeData : null;
  const passphrase = localPass || invite.passphrase;
  const isArrived = selected?.status === 'ARRIVED';
  const isExited = selected?.status === 'EXITED';
  const photoTime = hasPhoto ? fmt(selected?.updatedAt || selected?.createdAt) : null;
  const stateLabel = isExited ? 'EXITED' : isArrived ? 'ARRIVED' : hasPhoto ? 'USED' : 'PENDING';
  const stepsDone = [hasPhoto, hasPhoto && !!qr, hasPhoto, isArrived || isExited, isExited].filter(Boolean).length;

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="hero !rounded-none !rounded-b-[32px] px-5 pb-12 pt-[max(1.75rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center gap-2.5">
          <BrandMark size={38} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{invite.organisation?.name || brand.name}</p>
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/70">
              <ShieldCheck size={12} /> Visitor registration
            </p>
          </div>
        </div>
        <h1 className="text-2xl font-bold leading-tight">{invite.purpose}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {invite.host?.fullName && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur">
              <User size={12} /> Host: {invite.host.fullName}
            </span>
          )}
          {invite.expectedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur">
              <Calendar size={12} /> {fmt(invite.expectedAt)}
            </span>
          )}
        </div>
      </div>

      <div className="relative z-10 mx-auto -mt-7 max-w-lg space-y-4 px-4">
        {/* Guest selector */}
        {invite.visitors.length > 1 && (
          <div className="card animate-in p-3">
            <p className="eyebrow mb-2">Who are you?</p>
            <div className="flex flex-wrap gap-2">
              {invite.visitors.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(v.id);
                    stopCamera();
                    setCaptureError('');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition duration-200 hover:-translate-y-0.5 ${
                    selectedId === v.id
                      ? 'border-transparent bg-gradient-to-r from-brand-500 to-brand-700 text-white shadow-glow'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50'
                  }`}
                >
                  {v.fullName}
                  {v.photoPath && <Check size={13} className={selectedId === v.id ? 'text-emerald-200' : 'text-emerald-500'} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status timeline */}
        {selected && (
          <div className="card card-art animate-in p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-accent-700 text-sm font-bold text-white shadow-glow">
                {selected.fullName.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-slate-900">{selected.fullName}</h2>
                <p className="text-xs text-slate-500">{stepsDone} of 5 steps complete</p>
              </div>
              <StatusPill status={stateLabel} label={isExited ? 'Exited' : isArrived ? 'On site' : hasPhoto ? 'Registered' : 'Awaiting photo'} tone={isExited ? 'slate' : isArrived ? 'emerald' : hasPhoto ? 'brand' : 'amber'} />
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-brand-500 to-accent-600 transition-all duration-700" style={{ width: `${(stepsDone / 5) * 100}%` }} />
            </div>
            <div>
              <StatusBadge done={hasPhoto} active={!hasPhoto} label="Photo captured" time={photoTime} />
              <StatusBadge done={hasPhoto && Boolean(qr)} active={hasPhoto && !qr} label="QR pass ready" time={hasPhoto ? photoTime : null} />
              <StatusBadge done={hasPhoto} label="Passphrase issued" time={hasPhoto ? photoTime : null} />
              <StatusBadge done={isArrived || isExited} active={hasPhoto && !isArrived && !isExited} label="Arrived for visit" time={fmt(selected.enteredAt)} />
              <StatusBadge done={isExited} active={isArrived} label="Visit completed" time={fmt(selected.exitedAt)} last />
            </div>
          </div>
        )}

        {/* Photo capture — only if not yet taken and not arrived/exited */}
        {selected && !hasPhoto && !isArrived && !isExited && (
          <div className="card animate-in p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600">
                <Camera size={16} />
              </span>
              Passport-style photo
              <InfoTip text="Face the camera in good light. Empty frames are rejected automatically." />
            </h3>

            {!capturing ? (
              <button type="button" onClick={startCamera} className="btn-primary w-full !py-3.5">
                <Camera size={20} />
                Open camera
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-950 shadow-lift">
                  <video ref={videoRef} playsInline muted autoPlay className="h-full w-full scale-x-[-1] object-cover" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-[70%] w-[55%] rounded-full border-2 border-dashed border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
                  </div>
                  <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/85">Centre your face in the oval</p>
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex gap-2">
                  <button type="button" onClick={stopCamera} className="btn-ghost flex-1">
                    Cancel
                  </button>
                  <button type="button" onClick={takePhoto} disabled={uploading} className="btn-success flex-[2] !py-3">
                    {uploading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> Checking…
                      </>
                    ) : (
                      <>
                        <Camera size={18} /> Capture
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            {captureError && <div className="mt-3"><Notice tone="error">{captureError}</Notice></div>}
          </div>
        )}

        {/* QR + passphrase after capture */}
        {hasPhoto && (
          <div className="card animate-in overflow-hidden">
            <div className="flex items-center gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-3.5">
              {selected?.photoPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/visitors/photo/${selected.photoPath}`}
                  alt={selected.fullName}
                  className="h-12 w-12 rounded-xl object-cover shadow-soft ring-2 ring-white"
                />
              )}
              <div className="flex-1">
                <h3 className="flex items-center gap-1.5 font-bold text-emerald-800">
                  <Check size={17} strokeWidth={3} className="rounded-full bg-emerald-500 p-0.5 text-white" /> Ready for the gate
                </h3>
                <p className="text-xs text-emerald-700/70">Show this pass on arrival</p>
              </div>
            </div>
            <div className="p-5">
              {qr && (
                <div className="mb-4 flex flex-col items-center">
                  {/* Always black-on-white, never inverted by dark mode, crisp pixels, big
                      enough for older phone cameras to lock on from arm's length. */}
                  <div className="rounded-[26px] bg-gradient-to-br from-brand-400 via-brand-600 to-accent-700 p-[3px] shadow-glow">
                    <div className="rounded-[23px] p-3" style={{ colorScheme: 'light', backgroundColor: '#ffffff' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qr}
                        alt="Gate QR code"
                        width={512}
                        draggable={false}
                        className="block h-auto w-[min(72vw,288px)] bg-white"
                        style={{ imageRendering: 'pixelated', filter: 'none' }}
                      />
                    </div>
                  </div>
                  <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                    <QrCode size={12} /> Turn your screen brightness up at the gate
                  </p>
                  <a
                    href={selected ? `${qrPngUrl(token, selected.id)}?download=1` : qr}
                    download={selected?.qrFileName || 'vicit-pass.png'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost mt-3 !py-2 !text-xs"
                  >
                    <Download size={14} /> Save QR image
                  </a>
                </div>
              )}
              {passphrase && (
                <div className="tile text-center">
                  <p className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <KeyRound size={12} /> Backup passphrase
                    <InfoTip text="If the QR will not scan, tell the gate officer this passphrase." size={12} />
                  </p>
                  <p className="select-all font-mono text-2xl font-bold tracking-[0.25em] text-gradient">{passphrase}</p>
                </div>
              )}
              {selected?.email && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
                  <Mail size={12} /> A copy was sent to {selected.email}
                </p>
              )}
              {isArrived && (
                <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100/60 py-2.5 text-sm font-semibold text-emerald-700">
                  <LogIn size={16} /> You are checked in
                  {selected.enteredAt ? ` · ${fmt(selected.enteredAt)}` : ''}
                </p>
              )}
              {isExited && (
                <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600">
                  <LogOut size={16} /> Visit completed
                  {selected.exitedAt ? ` · ${fmt(selected.exitedAt)}` : ''}
                </p>
              )}
            </div>
          </div>
        )}
        <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-400">
          <ShieldCheck size={12} /> Your details are only shared with {invite.organisation?.name || brand.name}
        </p>
      </div>
    </div>
  );
}
