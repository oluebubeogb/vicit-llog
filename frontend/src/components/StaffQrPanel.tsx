'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { staffBadgeUrl } from '@/lib/format';
import SleekOverlay from '@/components/ui/SleekOverlay';
import { QrCode, Shield, Camera, Download, KeyRound, RefreshCw, Loader2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import PasswordInput from '@/components/ui/PasswordInput';

type Status = { hasStaffPin: boolean; hasBadgePhoto: boolean; hasStaffQr: boolean; lockedUntil?: string | null; organisationName?: string };

export default function StaffQrPanel({ fullName, organisationName }: { fullName: string; organisationName?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'closed' | 'setup' | 'unlock' | 'camera' | 'view' | 'reset'>('closed');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [password, setPassword] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [badgePath, setBadgePath] = useState<string | null>(null);
  const [orgName, setOrgName] = useState(organisationName || '');
  const [name, setName] = useState(fullName);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const s = await api.staffQrStatus();
      setStatus(s);
      if (s.organisationName) setOrgName(s.organisationName);
    } catch (e: any) {
      setError(e.message || 'Could not load staff QR status');
    }
  }

  useEffect(() => {
    refreshStatus();
    return () => stopCam();
  }, []);

  function openAccess() {
    setError('');
    setPin('');
    setPin2('');
    if (!status?.hasStaffPin) setMode('setup');
    else setMode('unlock');
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCam() {
    setError('');
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (e: any) {
      setError(e?.message || 'Camera access is required to capture your badge photo');
    }
  }

  async function captureSnap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.92));
    if (!blob) return;
    setBusy(true);
    try {
      const r = await api.uploadStaffBadgePhoto(blob, 'badge.jpg');
      setBadgePath(r.staffBadgePhotoPath);
      setSnapUrl(URL.createObjectURL(blob));
      stopCam();
      setStatus((s) => (s ? { ...s, hasBadgePhoto: true } : s));
      setMode('view');
    } catch (e: any) {
      setError(e.message || 'Could not save badge photo');
    } finally {
      setBusy(false);
    }
  }

  async function submitSetup() {
    setBusy(true);
    setError('');
    try {
      await api.setStaffPin(pin, pin2);
      const unlocked = await api.unlockStaffQr(pin);
      setQrPayload(unlocked.qrPayload);
      setBadgePath(unlocked.staffBadgePhotoPath || null);
      setName(unlocked.fullName || fullName);
      setOrgName(unlocked.organisation?.name || organisationName || '');
      setStatus((s) => ({ ...(s || { hasBadgePhoto: false, hasStaffQr: true, hasStaffPin: true }), hasStaffPin: true, hasStaffQr: true }));
      setPin('');
      setPin2('');
      if (!unlocked.staffBadgePhotoPath) {
        setMode('camera');
        await startCam();
      } else setMode('view');
    } catch (e: any) {
      setError(e.message || 'Could not set PIN');
    } finally {
      setBusy(false);
    }
  }

  async function submitUnlock() {
    setBusy(true);
    setError('');
    try {
      const unlocked = await api.unlockStaffQr(pin);
      setQrPayload(unlocked.qrPayload);
      setBadgePath(unlocked.staffBadgePhotoPath || null);
      setName(unlocked.fullName || fullName);
      setOrgName(unlocked.organisation?.name || organisationName || '');
      setPin('');
      if (!unlocked.staffBadgePhotoPath) {
        setMode('camera');
        await startCam();
      } else setMode('view');
    } catch (e: any) {
      setError(e.message || 'Incorrect PIN');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    setBusy(true);
    setError('');
    try {
      await api.resetStaffPin(password, pin || undefined, pin2 || undefined);
      setPassword('');
      setPin('');
      setPin2('');
      await refreshStatus();
      setMode(pin ? 'unlock' : 'setup');
    } catch (e: any) {
      setError(e.message || 'Could not reset PIN');
    } finally {
      setBusy(false);
    }
  }

  async function downloadBadge() {
    if (!qrPayload) return;
    setBusy(true);
    try {
      const width = 1600;
      const height = 800;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      // background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // left panel soft card
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 48, 48, width / 2 - 72, height - 96, 32);
      ctx.fill();

      // draw QR from existing canvas in DOM
      const qrEl = document.getElementById('staff-qr-canvas') as HTMLCanvasElement | null;
      if (qrEl) {
        const size = 520;
        ctx.drawImage(qrEl, 48 + ((width / 2 - 72) - size) / 2, (height - size) / 2, size, size);
      }

      // right panel
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, width / 2 + 24, 48, width / 2 - 72, height - 96, 32);
      ctx.fill();

      // photo
      const photoSrc = snapUrl || staffBadgeUrl(badgePath);
      if (photoSrc) {
        const img = await loadImage(photoSrc);
        const size = 280;
        const x = width / 2 + 24 + ((width / 2 - 72) - size) / 2;
        const y = 120;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name || 'Staff', width * 0.75, 460);
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(orgName || 'Agency', width * 0.75, 510);
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('Staff attendance pass', width * 0.75, 560);

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-qr-${(name || 'badge').replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
    } catch (e: any) {
      setError(e.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  function closeAll() {
    stopCam();
    setMode('closed');
    setQrPayload('');
    setPin('');
    setPin2('');
    setPassword('');
    setError('');
  }

  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 text-on-brand on-brand-fill">
          <QrCode size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">My Staff QR</p>
          <p className="text-xs text-slate-500">Permanent attendance pass. Protected by a 4-digit PIN every time you open it.</p>
        </div>
      </div>
      <button type="button" onClick={openAccess} className="btn-primary w-full">
        <Shield size={16} /> {status?.hasStaffPin ? 'Unlock Staff QR' : 'Set up Staff QR'}
      </button>
      {status?.hasStaffPin && (
        <button type="button" className="btn-quiet w-full text-xs" onClick={() => { setMode('reset'); setError(''); }}>
          <KeyRound size={14} /> Reset PIN with password
        </button>
      )}

      <SleekOverlay
        open={mode === 'setup'}
        onClose={closeAll}
        title="Create your Staff QR PIN"
        subtitle="Choose a 4-digit PIN. You will need it every time you view or download your QR."
        icon={<Shield size={20} />}
        footer={
          <>
            <button type="button" className="btn-quiet flex-1" onClick={closeAll}>Cancel</button>
            <button type="button" className="btn-primary flex-1" disabled={busy || pin.length !== 4 || pin !== pin2} onClick={submitSetup}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : 'Save PIN'}
            </button>
          </>
        }
      >
        <PinInputs pin={pin} setPin={setPin} pin2={pin2} setPin2={setPin2} confirm />
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </SleekOverlay>

      <SleekOverlay
        open={mode === 'unlock'}
        onClose={closeAll}
        title="Enter your PIN"
        subtitle="Required each time to protect your attendance QR if your device is shared or lost."
        icon={<KeyRound size={20} />}
        footer={
          <>
            <button type="button" className="btn-quiet flex-1" onClick={closeAll}>Cancel</button>
            <button type="button" className="btn-primary flex-1" disabled={busy || pin.length !== 4} onClick={submitUnlock}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : 'Unlock'}
            </button>
          </>
        }
      >
        <PinInputs pin={pin} setPin={setPin} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </SleekOverlay>

      <SleekOverlay
        open={mode === 'reset'}
        onClose={closeAll}
        title="Reset Staff QR PIN"
        subtitle="Confirm your account password. Leave the new PIN blank to clear it, or enter a new 4-digit PIN."
        icon={<RefreshCw size={20} />}
        tone="amber"
        footer={
          <>
            <button type="button" className="btn-quiet flex-1" onClick={closeAll}>Cancel</button>
            <button type="button" className="btn-primary flex-1" disabled={busy || !password} onClick={submitReset}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : 'Reset'}
            </button>
          </>
        }
      >
        <label className="block text-xs font-semibold text-slate-600">Account password
          <PasswordInput wrapperClassName="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <PinInputs pin={pin} setPin={setPin} pin2={pin2} setPin2={setPin2} confirm optional />
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </SleekOverlay>

      <SleekOverlay
        open={mode === 'camera'}
        onClose={() => { stopCam(); closeAll(); }}
        title="Badge photo"
        subtitle="Take a live photo with your camera. File uploads are not allowed."
        icon={<Camera size={20} />}
        tone="violet"
        size="lg"
        footer={
          <>
            <button type="button" className="btn-quiet flex-1" onClick={() => { stopCam(); startCam(); }}>Retake</button>
            <button type="button" className="btn-primary flex-1" disabled={busy || !cameraOn} onClick={captureSnap}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : 'Capture'}
            </button>
          </>
        }
      >
        <div className="overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </SleekOverlay>

      <SleekOverlay
        open={mode === 'view'}
        onClose={closeAll}
        title="Your Staff QR"
        subtitle="Scan at the gate for daily arrival / exit. Download creates a landscape badge."
        icon={<QrCode size={20} />}
        tone="emerald"
        size="lg"
        footer={
          <>
            <button type="button" className="btn-quiet flex-1" onClick={() => { setMode('camera'); startCam(); }}>
              <Camera size={14} /> Retake photo
            </button>
            <button type="button" className="btn-primary flex-1" disabled={busy || !badgePath} onClick={downloadBadge}>
              <Download size={14} /> {busy ? 'Preparing…' : 'Download badge'}
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3">
          {qrPayload && <QRCodeCanvas id="staff-qr-canvas" value={qrPayload} size={220} includeMargin level="M" />}
          <div className="text-center">
            <p className="font-semibold text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">{orgName}</p>
          </div>
          {(snapUrl || badgePath) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapUrl || staffBadgeUrl(badgePath) || ''} alt="Badge photo" className="h-24 w-24 rounded-full object-cover ring-2 ring-brand-200" />
          )}
          {!badgePath && <p className="text-xs text-amber-700">Capture a camera photo before downloading.</p>}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </SleekOverlay>
    </div>
  );
}

function PinInputs({
  pin,
  setPin,
  pin2,
  setPin2,
  confirm,
  optional,
}: {
  pin: string;
  setPin: (v: string) => void;
  pin2?: string;
  setPin2?: (v: string) => void;
  confirm?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-600">
        {optional ? 'New PIN (optional)' : '4-digit PIN'}
        <input
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          className="input mt-1 tracking-[0.5em] text-center text-lg font-bold"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          autoComplete="one-time-code"
        />
      </label>
      {confirm && setPin2 && (
        <label className="block text-xs font-semibold text-slate-600">
          Confirm PIN
          <input
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            className="input mt-1 tracking-[0.5em] text-center text-lg font-bold"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))}
            autoComplete="one-time-code"
          />
        </label>
      )}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
