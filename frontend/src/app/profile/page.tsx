'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser, setUser, clearToken } from '@/lib/api';
import { isValidEmail } from '@/lib/email';
import { detectHumanInVideo } from '@/lib/detectHuman';
import { LogOut, User, Camera, Loader2, Send } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Sheet from '@/components/ui/Sheet';
import Avatar from '@/components/ui/Avatar';
import StatusPill from '@/components/ui/StatusPill';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
import { titleCase } from '@/lib/format';
import InstallBanner from '@/components/InstallBanner';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setLocal] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', portfolio: '', email: '' });
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [camError, setCamError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setLocal(u);
    setForm({
      fullName: u.fullName || '',
      phone: u.phone || '',
      portfolio: u.portfolio || '',
      email: u.email || '',
    });
    api
      .me()
      .then((me) => {
        setLocal({ ...u, ...me });
        setUser({ ...u, ...me });
        setForm({
          fullName: me.fullName || '',
          phone: me.phone || '',
          portfolio: me.portfolio || '',
          email: me.email || '',
        });
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // The video element only exists after cameraOn becomes true. Attach the stream
  // after React mounts that element; assigning it before then leaves a black preview.
  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {
      setCamError(
        'The camera opened, but the preview could not start. Close other apps using the camera and try again.',
      );
    });
  }, [cameraOn]);

  function logout() {
    clearToken();
    router.replace('/login');
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setCamError('');
    if (!window.isSecureContext) {
      setCamError(
        'Camera access requires a secure HTTPS connection (or localhost). Open Vicit using its HTTPS address, then allow camera access in your browser.',
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('This browser does not support camera access. Update your browser and try again.');
      return;
    }

    try {
      // Stop any previous stream before requesting a fresh one.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err: any) {
      const name = err?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCamError(
          'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCamError('No camera was found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCamError(
          'The camera is busy or unavailable. Close other apps or browser tabs using it, then try again.',
        );
      } else {
        setCamError(err?.message || 'Could not open the camera. Check browser permissions.');
      }
    }
  }

  async function captureAndUpload() {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    setCamError('');
    try {
      const ok = await detectHumanInVideo(videoRef.current);
      if (!ok) {
        setCamError(
          'No person detected. Centre your face in the frame and try again — empty scenes cannot be used.',
        );
        setCapturing(false);
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const size = Math.min(video.videoWidth, video.videoHeight) || 480;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // Centre-crop square (same as visitor verification)
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Could not capture image');
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const { avatarPath } = await api.uploadAvatar(file);
      await api.requestProfileEdit({ avatarPath });
      setPending(true);
      setMsg('Profile photo submitted — pending admin approval.');
      stopCamera();
      setPhotoOpen(false);
    } catch (err: any) {
      setCamError(err.message || 'Capture failed');
    } finally {
      setCapturing(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (form.email && !isValidEmail(form.email)) {
      setMsg('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      await api.requestProfileEdit({
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        portfolio: form.portfolio.trim() || null,
        email: form.email.trim().toLowerCase(),
      });
      setPending(true);
      setMsg('Changes submitted — pending admin approval.');
    } catch (err: any) {
      setMsg(err.message || 'Could not submit changes');
    } finally {
      setSaving(false);
    }
  }

  const avatarUrl = user?.avatarPath ? `${API}/users/avatar/${user.avatarPath}` : null;

  const closePhoto = () => {
    stopCamera();
    setPhotoOpen(false);
  };
  const isError = msg && !(pending || msg.includes('pending') || msg.includes('updated'));

  return (
    <div className="page">
      <PageHeader back={user?.role === 'GATE' ? '/gate' : '/dashboard'} icon={<User size={20} />} title="Profile" subtitle="Your account and app" />

      <div className="hero animate-in mb-5">
        <div className="flex items-center gap-4">
          <Tooltip content="Take a new profile photo">
            <button
              type="button"
              onClick={() => {
                setPhotoOpen(true);
                setCamError('');
                setCameraOn(false);
              }}
              className="group relative shrink-0 rounded-full ring-4 ring-white/25 transition hover:ring-white/50"
            >
              <Avatar name={user?.fullName} src={avatarUrl} size={72} ring={false} className="!text-xl" />
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-1.5 text-brand-600 shadow-lg transition group-hover:scale-110">
                <Camera size={13} />
              </span>
            </button>
          </Tooltip>
          <div className="min-w-0">
            <p className="truncate text-xl font-bold">{user?.fullName}</p>
            <p className="truncate text-sm text-white/75">{user?.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {user?.role && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold ring-1 ring-white/25">{user.role === 'GATE' ? 'Gate officer' : titleCase(user.role)}</span>}
              {user?.organisation?.name && <span className="truncate text-[11px] text-white/70">{user.organisation.name}</span>}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={submitEdit} className="surface animate-in mb-5 space-y-3">
        <p className="flex items-center gap-1.5 font-semibold text-slate-800">
          Edit details
          <InfoTip text="Changes require admin approval before they apply." />
          {pending && <StatusPill className="ml-auto" status="PENDING" label="Pending approval" />}
        </p>
        <label className="block">
          <span className="label">Full name</span>
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" required />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="label">Portfolio</span>
            <input value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} placeholder="Department" className="input" />
          </label>
        </div>
        {msg && <Notice tone={isError ? 'error' : 'warn'}>{msg}</Notice>}
        <button type="submit" disabled={saving} className="btn-primary w-full">
          <Send size={15} /> {saving ? 'Submitting…' : 'Submit for approval'}
        </button>
      </form>

      {(user?.role === 'ADMIN' || user?.role === 'STAFF' || user?.role === 'GATE') && (
        <div className="mb-4">
          <InstallBanner variant="profile" />
        </div>
      )}

      <button onClick={logout} className="btn w-full border border-rose-200 bg-gradient-to-r from-rose-50 to-white !py-3.5 text-rose-600 hover:border-rose-300 hover:from-rose-100">
        <LogOut size={18} />
        Sign out
      </button>

      {/* Camera-only profile photo — same flow as visitor verification */}
      <Sheet open={photoOpen} onClose={closePhoto} icon={<Camera size={20} />} title="Profile photo" subtitle={<span className="flex items-center gap-1">Camera only <InfoTip text="Face the camera in good light. Empty frames are rejected automatically. No file upload." size={12} /></span>}>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-950 shadow-lift">
          {cameraOn ? (
            <>
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full scale-x-[-1] object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[70%] w-[55%] rounded-full border-2 border-dashed border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
              </div>
            </>
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-900 to-slate-950">
              <User size={64} className="text-white/30" />
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="mt-4 space-y-3">
          {camError && <Notice tone="error">{camError}</Notice>}
          {!cameraOn ? (
            <button type="button" onClick={startCamera} className="btn-primary w-full !py-3.5">
              <Camera size={20} />
              Open camera
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={stopCamera} className="btn-ghost flex-1">
                Cancel
              </button>
              <button type="button" onClick={captureAndUpload} disabled={capturing} className="btn-success flex-[2] !py-3">
                {capturing ? (
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
          )}
        </div>
      </Sheet>
    </div>
  );
}
