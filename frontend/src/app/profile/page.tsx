'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getUser, setUser, clearToken } from '@/lib/api';
import { isValidEmail } from '@/lib/email';
import { detectHumanInVideo } from '@/lib/detectHuman';
import { LogOut, User, ArrowLeft, Camera, X } from 'lucide-react';

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
    return () => stopCamera();
  }, []);

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
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCamError('Camera access denied. Allow camera to capture a live photo.');
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
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Could not capture image');
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const updated = await api.uploadAvatar(file);
      const merged = { ...user, ...updated };
      setLocal(merged);
      setUser(merged);
      setMsg('Profile photo updated');
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

  const avatarUrl = user?.avatarPath
    ? `${API}/users/avatar/${user.avatarPath}`
    : null;

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={user?.role === 'GATE' ? '/gate' : '/dashboard'}
          className="rounded-full p-2 hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm card-hover">
        <button
          type="button"
          onClick={() => {
            setPhotoOpen(true);
            setCamError('');
            setCameraOn(false);
          }}
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700 ring-2 ring-transparent transition hover:ring-brand-300"
          title="View or change photo"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User size={28} />
          )}
          <span className="absolute bottom-0 right-0 rounded-full bg-white p-1 shadow">
            <Camera size={12} className="text-slate-500" />
          </span>
        </button>
        <div>
          <p className="text-lg font-semibold">{user?.fullName}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <p className="text-xs text-slate-400">
            {user?.role} · {user?.organisation?.name}
          </p>
        </div>
      </div>

      <form onSubmit={submitEdit} className="mb-6 space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Edit details</p>
        <p className="text-xs text-slate-400">
          Changes require admin approval before they apply.
        </p>
        <input
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          placeholder="Full name"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
          required
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Email"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
          required
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Phone"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
        />
        <input
          value={form.portfolio}
          onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
          placeholder="Portfolio / department"
          className="w-full rounded-xl border px-3 py-2.5 text-sm"
        />
        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              pending || msg.includes('updated')
                ? 'bg-amber-50 text-amber-800'
                : 'bg-red-50 text-red-600'
            }`}
          >
            {msg}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Submitting…' : 'Submit for approval'}
        </button>
      </form>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 font-semibold text-red-600"
      >
        <LogOut size={18} />
        Sign Out
      </button>

      {photoOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 p-4">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setPhotoOpen(false);
            }}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white"
            aria-label="Close"
          >
            <X size={24} />
          </button>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="relative flex aspect-square items-center justify-center bg-slate-900">
              {cameraOn ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover"
                />
              ) : avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User size={64} className="text-slate-500" />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="space-y-2 p-4">
              <p className="text-center text-sm font-semibold text-slate-900">
                {user?.fullName}
              </p>
              <p className="text-center text-xs text-slate-400">
                Live camera only — a person must be visible in the frame
              </p>
              {camError && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
                  {camError}
                </p>
              )}
              {!cameraOn ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white"
                >
                  <Camera size={18} /> Open camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={captureAndUpload}
                  disabled={capturing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
                >
                  <Camera size={18} />
                  {capturing ? 'Checking…' : 'Capture photo'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setPhotoOpen(false);
                }}
                className="w-full rounded-xl border py-2.5 text-sm font-medium text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
