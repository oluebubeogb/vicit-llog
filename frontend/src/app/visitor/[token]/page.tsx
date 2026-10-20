'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Camera, CheckCircle2 } from 'lucide-react';

export default function VisitorPage() {
  const params = useParams();
  const token = params.token as string;
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  // The video element only exists after cameraOn becomes true. Attach the stream
  // after React renders it; assigning srcObject inside startCamera races the render.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOn || !stream || !video) return;
    video.srcObject = stream;
    video.play().catch(() => {
      setError('The camera opened but the preview could not start. Please try again.');
    });
    return () => {
      video.srcObject = null;
    };
  }, [cameraOn, stream]);

  useEffect(() => {
    api
      .publicInvite(token)
      .then((data) => {
        setInvite(data);
        if (data.visitors?.length === 1) {
          setSelectedVisitor(data.visitors[0].id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot access the camera. Open this page in a supported browser over HTTPS.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setStream(s);
      setCameraOn(true);
    } catch (err: any) {
      const message = err?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
        : err?.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : err?.name === 'NotReadableError'
            ? 'The camera is already in use by another app. Close it and try again.'
            : 'Could not open the camera. Check browser permissions and try again.';
      setError(message);
    }
  }

  function stopCamera() {
    const activeStream = stream || (videoRef.current?.srcObject as MediaStream | null);
    activeStream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
    setCameraOn(false);
  }

  async function captureAndUpload() {
    if (!videoRef.current || !canvasRef.current || !selectedVisitor) return;
    setUploading(true);
    setError('');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready yet. Wait for your live image to appear, then try again.');
      setUploading(false);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError('Failed to capture image');
        setUploading(false);
        return;
      }
      try {
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        const res = await api.uploadPhoto(token, selectedVisitor, file);
        stopCamera();
        setDone(res);
      } catch (err: any) {
        setError(err.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    }, 'image/jpeg', 0.92);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold text-red-600">{error}</p>
        <p className="mt-2 text-sm text-slate-500">
          Contact your host for a new invite link.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 size={64} className="mb-4 text-emerald-500" />
        <h1 className="text-2xl font-bold">You&apos;re all set!</h1>
        <p className="mt-2 text-slate-600">{done.message}</p>

        <div className="mt-6 w-full max-w-xs space-y-4">
          {done.qrCodeData && (
            <div className="rounded-2xl border bg-white p-4 shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={done.qrCodeData} alt="QR Code" className="mx-auto w-48" />
              <p className="mt-2 text-xs text-slate-500">Show this QR at the gate</p>
            </div>
          )}
          <div className="rounded-2xl border bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Passphrase (backup)</p>
            <p className="font-mono text-xl font-bold tracking-widest">
              {done.passphrase}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">{invite?.organisation?.name}</h1>
        <p className="text-sm text-slate-500">Visitor Registration</p>
        <p className="mt-2 text-sm">
          Host: <strong>{invite?.host?.fullName}</strong>
        </p>
        <p className="text-sm text-slate-600">Purpose: {invite?.purpose}</p>
      </div>

      {invite?.visitors?.length > 1 && (
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium">Select your name</label>
          <select
            value={selectedVisitor || ''}
            onChange={(e) => setSelectedVisitor(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
          >
            <option value="">— Choose —</option>
            {invite.visitors.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.fullName}
              </option>
            ))}
          </select>
        </div>
      )}

      {!cameraOn ? (
        <button
          onClick={startCamera}
          disabled={!selectedVisitor}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 font-semibold text-white disabled:opacity-50"
        >
          <Camera size={22} />
          Take Passport Photo
        </button>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(event) => event.currentTarget.play().catch(() => {})}
              className="aspect-[3/4] w-full object-cover"
            />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-3">
            <button
              onClick={stopCamera}
              className="flex-1 rounded-xl border border-slate-300 py-3 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={captureAndUpload}
              disabled={uploading}
              className="flex-1 rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Capture & Submit'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        Look straight at the camera. Good lighting recommended.
      </p>
    </div>
  );
}
