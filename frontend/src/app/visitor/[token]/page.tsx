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
} from 'lucide-react';

type Visitor = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  photoPath?: string | null;
  qrCodeData?: string | null;
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
}: {
  done: boolean;
  label: string;
  time?: string | null;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
        done
          ? 'border-emerald-200 bg-emerald-50'
          : active
            ? 'border-brand-200 bg-brand-50'
            : 'border-slate-100 bg-slate-50'
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          done
            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
            : active
              ? 'bg-brand-500 text-white'
              : 'bg-slate-200 text-slate-400'
        }`}
      >
        {done ? <Check size={16} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-current" />}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            done ? 'text-emerald-800' : active ? 'text-brand-800' : 'text-slate-500'
          }`}
        >
          {label}
        </p>
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <AlertCircle className="text-red-500" size={40} />
        <h1 className="text-lg font-bold text-slate-900">Unable to open invite</h1>
        <p className="text-sm text-slate-500">{error || 'Not found'}</p>
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

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-800 to-brand-600 px-5 pb-8 pt-8 text-white">
        <div className="mb-1 flex items-center gap-2 text-brand-100">
          <ShieldCheck size={18} />
          <span className="text-xs font-medium uppercase tracking-wider">Visitor registration</span>
        </div>
        <h1 className="text-xl font-bold leading-tight">{invite.purpose}</h1>
        <div className="mt-3 space-y-1 text-sm text-brand-100">
          {invite.host?.fullName && (
            <p className="flex items-center gap-2">
              <User size={14} /> Host: {invite.host.fullName}
            </p>
          )}
          {invite.organisation?.name && (
            <p className="flex items-center gap-2">
              <Building2 size={14} /> {invite.organisation.name}
            </p>
          )}
          {invite.expectedAt && (
            <p className="flex items-center gap-2">
              <Calendar size={14} /> {fmt(invite.expectedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 -mt-4 space-y-4 px-4">
        {/* Guest selector */}
        {invite.visitors.length > 1 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Select guest
            </p>
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
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    selectedId === v.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {v.fullName}
                  {v.photoPath && (
                    <Check size={12} className="ml-1 inline text-emerald-300" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status timeline */}
        {selected && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{selected.fullName}</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isExited
                    ? 'bg-slate-100 text-slate-600'
                    : isArrived
                      ? 'bg-emerald-100 text-emerald-700'
                      : hasPhoto
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isExited
                  ? 'Exited'
                  : isArrived
                    ? 'On site'
                    : hasPhoto
                      ? 'Registered'
                      : 'Awaiting photo'}
              </span>
            </div>
            <div className="space-y-2">
              <StatusBadge
                done={hasPhoto}
                active={!hasPhoto}
                label="Image capture"
                time={photoTime}
              />
              <StatusBadge
                done={hasPhoto && Boolean(qr)}
                active={hasPhoto && !qr}
                label="QR code ready"
                time={hasPhoto ? photoTime : null}
              />
              <StatusBadge
                done={hasPhoto}
                label="Passphrase issued"
                time={hasPhoto ? photoTime : null}
              />
              <StatusBadge
                done={isArrived || isExited}
                active={hasPhoto && !isArrived && !isExited}
                label="Arrived for visit"
                time={fmt(selected.enteredAt)}
              />
              <StatusBadge
                done={isExited}
                active={isArrived}
                label="Exited"
                time={fmt(selected.exitedAt)}
              />
            </div>
          </div>
        )}

        {/* Photo capture — only if not yet taken and not arrived/exited */}
        {selected && !hasPhoto && !isArrived && !isExited && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Camera size={16} className="text-brand-600" />
              Passport-style photo
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Face the camera in good light. Empty frames are rejected automatically.
            </p>

            {!capturing ? (
              <button
                type="button"
                onClick={startCamera}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white hover:bg-brand-700"
              >
                <Camera size={20} />
                Open camera
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl bg-black aspect-square">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="h-full w-full object-cover scale-x-[-1]"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-[70%] w-[55%] rounded-full border-2 border-white/50 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
                  </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={takePhoto}
                    disabled={uploading}
                    className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
                  >
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
            {captureError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {captureError}
              </p>
            )}
          </div>
        )}

        {/* Photo preview when already captured */}
        {selected?.photoPath && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Your photo
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/visitors/photo/${selected.photoPath}`}
              alt={selected.fullName}
              className="mx-auto h-36 w-36 rounded-2xl object-cover shadow-md"
            />
          </div>
        )}

        {/* QR + passphrase after capture */}
        {hasPhoto && (
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-emerald-700">
              <Check size={20} strokeWidth={2.5} className="rounded-full bg-emerald-500 p-0.5 text-white" />
              <h3 className="font-bold">Ready for the gate</h3>
            </div>
            {qr && (
              <div className="mb-4 flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt="Gate QR code"
                  className="h-52 w-52 rounded-xl border border-slate-100 bg-white p-2 shadow-sm"
                />
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <QrCode size={12} /> Show this QR at the gate
                </p>
              </div>
            )}
            {passphrase && (
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="mb-1 flex items-center justify-center gap-1 text-xs uppercase tracking-wide text-slate-400">
                  <KeyRound size={12} /> Passphrase (backup)
                </p>
                <p className="font-mono text-xl font-bold tracking-wider text-slate-900">
                  {passphrase}
                </p>
              </div>
            )}
            {selected?.email && (
              <p className="mt-3 text-center text-xs text-slate-500">
                A copy of your QR code was sent to {selected.email}
              </p>
            )}
            {isArrived && (
              <p className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 py-2 text-sm font-medium text-emerald-700">
                <LogIn size={16} /> You are checked in
                {selected.enteredAt ? ` · ${fmt(selected.enteredAt)}` : ''}
              </p>
            )}
            {isExited && (
              <p className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600">
                <LogOut size={16} /> Visit completed
                {selected.exitedAt ? ` · ${fmt(selected.exitedAt)}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
