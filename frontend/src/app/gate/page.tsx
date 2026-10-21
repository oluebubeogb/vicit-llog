'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import {
  ScanLine,
  LogIn,
  LogOut,
  Search,
  Camera,
  X,
  Ban,
  ImagePlus,
  Flashlight,
  SwitchCamera,
} from 'lucide-react';
import PersonLink from '@/components/PersonLink';
import {
  cameraSupport,
  decodeFromSource,
  decodeImageFile,
  describeCameraError,
  displayCode,
  getNativeQrDetector,
  normalizeScannedCode,
  openRearCamera,
} from '@/lib/qrScan';

export default function GatePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [entryMode, setEntryMode] = useState('PEDESTRIAN');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null);
  const [denyFor, setDenyFor] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const [photoDecoding, setPhotoDecoding] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const scanSession = useRef(0);
  const cameraIdx = useRef(-1);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
  }, [router]);

  // Prefill from ?code= when coming from Visits table (no useSearchParams — avoids Suspense build error)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = normalizeScannedCode(new URLSearchParams(window.location.search).get('code'));
    if (q) {
      setCode(displayCode(q));
      (async () => {
        try {
          const data = await api.gateLookup(q);
          setResult(data);
          if (data?.expectedMode) setEntryMode(data.expectedMode);
        } catch (err: any) {
          setError(err.message || 'Not found');
        }
      })();
    }
  }, []);

  async function lookup(raw?: string) {
    const value = normalizeScannedCode(raw ?? code);
    if (!value) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.gateLookup(value);
      setResult(data);
      if (data?.expectedMode) setEntryMode(data.expectedMode);
    } catch (err: any) {
      setError(err.message || 'Not found');
    } finally {
      setLoading(false);
    }
  }

  async function doEntry(visitorId: string) {
    setActionLoading(visitorId + '-in');
    try {
      await api.recordEntry({ visitorId, entryMode });
      await lookup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  async function doExit(visitorId: string) {
    setActionLoading(visitorId + '-out');
    try {
      await api.recordExit(visitorId);
      await lookup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  async function doDeny(visitorId: string) {
    if (!denyReason.trim()) {
      setError('Please enter a comment explaining why entry is declined.');
      return;
    }
    setActionLoading(visitorId + '-deny');
    try {
      await api.denyEntry(visitorId, denyReason.trim());
      setDenyFor(null);
      setDenyReason('');
      await lookup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  function stopScanner() {
    scanSession.current++;
    if (scanTimer.current) {
      window.clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        /* ignore */
      }
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setTorchOn(false);
    setTorchSupported(false);
  }

  function onDecoded(raw: string) {
    const value = normalizeScannedCode(raw);
    if (!value) return;
    try {
      navigator.vibrate?.(60);
    } catch {
      /* iOS has no vibrate */
    }
    stopScanner();
    setScanError('');
    setCode(displayCode(value));
    lookup(value);
  }

  async function startScanner(deviceId?: string) {
    setScanError('');
    const support = cameraSupport();
    if (!support.ok) {
      setScanError(support.reason);
      return;
    }
    // Stop any previous stream first (camera switch)
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (scanTimer.current) window.clearTimeout(scanTimer.current);
    const session = ++scanSession.current;
    setScanning(true);

    let stream: MediaStream;
    try {
      // getUserMedia is the first await so iOS still treats this as a user gesture
      stream = await openRearCamera(deviceId);
    } catch (err: any) {
      setScanError(describeCameraError(err));
      setScanning(false);
      return;
    }
    if (session !== scanSession.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stopScanner();
      return;
    }
    // iOS Safari: must be muted + playsinline or play() is rejected / goes fullscreen
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // autoplay attribute will start it once metadata is ready
    }

    const track = stream.getVideoTracks()[0];
    try {
      const caps: any = track?.getCapabilities?.() || {};
      setTorchSupported(Boolean(caps.torch));
    } catch {
      setTorchSupported(false);
    }
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'videoinput',
      );
      setCameras(devices);
      const activeId = track?.getSettings?.().deviceId;
      const idx = devices.findIndex((d) => d.deviceId === activeId);
      if (idx >= 0) cameraIdx.current = idx;
    } catch {
      /* ignore */
    }

    const native = await getNativeQrDetector();
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    let frame = 0;

    const tick = async () => {
      if (session !== scanSession.current) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        let result: string | null = null;
        try {
          if (native) {
            const codes = await native.detect(v);
            result = codes?.[0]?.rawValue || null;
          }
          if (!result) {
            // Alternate full frame (downscaled) and a sharper centre crop so both
            // far-away and small on-screen codes are found.
            result =
              frame % 2 === 0
                ? decodeFromSource(v, v.videoWidth, v.videoHeight, canvas, 720, 1)
                : decodeFromSource(v, v.videoWidth, v.videoHeight, canvas, 720, 0.6);
          }
        } catch {
          /* keep scanning */
        }
        frame++;
        if (session !== scanSession.current) return;
        if (result) {
          onDecoded(result);
          return;
        }
      }
      scanTimer.current = window.setTimeout(tick, 120);
    };
    scanTimer.current = window.setTimeout(tick, 150);
  }

  function switchCamera() {
    if (cameras.length < 2) return;
    cameraIdx.current = (cameraIdx.current + 1) % cameras.length;
    startScanner(cameras[cameraIdx.current].deviceId);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch {
      setTorchSupported(false);
    }
  }

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    stopScanner();
    setScanError('');
    setPhotoDecoding(true);
    try {
      const raw = await decodeImageFile(file);
      if (raw) {
        onDecoded(raw);
      } else {
        setScanError(
          'No QR code found in that photo. Fill the frame with the QR, avoid glare, or type the passphrase.',
        );
      }
    } catch {
      setScanError('Could not read that image. Try again or type the passphrase.');
    } finally {
      setPhotoDecoding(false);
    }
  }

  useEffect(() => {
    // iOS freezes/kills the camera when the app is backgrounded — release it cleanly.
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopScanner();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stopScanner);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stopScanner);
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <ScanLine size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gate Control</h1>
          <p className="text-xs text-slate-500">Scan QR or enter passphrase</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Passphrase or QR data"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-base font-mono uppercase tracking-wide outline-none focus:border-brand-500 sm:px-4 sm:text-lg"
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <button
          onClick={() => lookup()}
          disabled={loading}
          className="shrink-0 rounded-xl bg-brand-600 px-3 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:px-4"
        >
          <Search size={22} />
        </button>
        <button
          type="button"
          onClick={() => (scanning ? stopScanner() : startScanner())}
          className={`shrink-0 rounded-xl px-3 py-3.5 font-semibold text-white sm:px-4 ${
            scanning
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
          title="Scan QR code"
        >
          {scanning ? <X size={22} /> : <Camera size={22} />}
        </button>
      </div>

      {/* Video stays mounted so the ref exists before getUserMedia resolves (iOS) */}
      <div
        className={`mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm ${
          scanning ? '' : 'hidden'
        }`}
      >
        <div className="relative">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            disablePictureInPicture
            className="aspect-square w-full max-h-80 object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[65%] w-[65%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute right-2 top-2 flex gap-2">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`rounded-full p-2 ${torchOn ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white'}`}
                aria-label="Toggle torch"
                title="Torch"
              >
                <Flashlight size={18} />
              </button>
            )}
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="rounded-full bg-white/20 p-2 text-white"
                aria-label="Switch camera"
                title="Switch camera"
              >
                <SwitchCamera size={18} />
              </button>
            )}
          </div>
        </div>
        <p className="bg-white py-2 text-center text-xs text-slate-500">
          Point camera at visitor QR code · ask visitor to raise screen brightness
        </p>
      </div>

      <div className="mb-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPhotoPicked}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photoDecoding}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <ImagePlus size={18} />
          {photoDecoding ? 'Reading QR…' : 'Scan from photo (take or choose a picture)'}
        </button>
      </div>
      {scanError && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {scanError}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-400">Host</p>
            <p className="font-semibold text-slate-900">
              <PersonLink id={result.host?.id} name={result.host?.fullName} className="font-semibold text-slate-900" />
            </p>
            <p className="mt-2 text-sm text-slate-400">Purpose</p>
            <p className="text-slate-800">{result.purpose}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Actual entry mode
              {result.expectedMode && (
                <span className="ml-2 font-normal text-slate-400">
                  (invite expected: {result.expectedMode.toLowerCase()})
                </span>
              )}
            </label>
            <select
              value={entryMode}
              onChange={(e) => setEntryMode(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 outline-none focus:border-brand-500"
            >
              <option value="PEDESTRIAN">Pedestrian</option>
              <option value="MOTORCYCLE">Motorcycle</option>
              <option value="VEHICLE">Vehicle</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Pre-filled from the invite; change if the visitor arrives differently.
            </p>
          </div>

          {result.visitors?.map((v: any) => (
            <div
              key={v.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                result.scannedVisitorId === v.id
                  ? 'border-brand-400 ring-2 ring-brand-200'
                  : 'border-slate-200'
              }`}
            >
              {result.scannedVisitorId === v.id && result.visitors?.length > 1 && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Scanned QR belongs to this guest
                </p>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{v.fullName}</p>
                  <p className="text-sm text-slate-500">
                    Status: <span className="font-medium text-slate-800">{v.status}</span>
                  </p>
                  {v.enteredAt && (
                    <p className="text-xs text-slate-400">
                      In: {new Date(v.enteredAt).toLocaleString()}
                    </p>
                  )}
                  {v.exitedAt && (
                    <p className="text-xs text-slate-400">
                      Out: {new Date(v.exitedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {v.photoPath && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPhoto({
                        url: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/visitors/photo/${v.photoPath}`,
                        name: v.fullName,
                      })
                    }
                    className="group relative shrink-0 overflow-hidden rounded-xl ring-2 ring-slate-200 transition hover:ring-brand-500 focus:outline-none focus:ring-brand-500"
                    title="Tap to enlarge photo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/visitors/photo/${v.photoPath}`}
                      alt={v.fullName}
                      className="h-20 w-20 object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                      View
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {v.status === 'INVITED' && !v.photoPath && (
                  <p className="text-center text-sm text-amber-600">
                    Photo not captured yet
                  </p>
                )}
                {v.status === 'INVITED' && (
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => doEntry(v.id)}
                        disabled={!!actionLoading || !v.photoPath}
                        title="Permit entry"
                        aria-label="Permit entry"
                        className="group relative flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
                      >
                        {actionLoading === v.id + '-in' ? (
                          <span className="text-sm">…</span>
                        ) : (
                          <LogIn size={22} />
                        )}
                        <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">
                          Permit entry
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDenyFor(denyFor === v.id ? null : v.id);
                          setDenyReason('');
                        }}
                        disabled={!!actionLoading}
                        title="Decline entry"
                        aria-label="Decline entry"
                        className="group relative flex h-12 w-12 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-40"
                      >
                        <Ban size={22} />
                        <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">
                          Decline
                        </span>
                      </button>
                    </div>
                    {denyFor === v.id && (
                      <div className="w-full rounded-xl border border-red-100 bg-red-50/50 p-3">
                        <label className="mb-1 block text-xs font-medium text-red-800">
                          Comment * (required)
                        </label>
                        <textarea
                          value={denyReason}
                          onChange={(e) => setDenyReason(e.target.value)}
                          rows={2}
                          placeholder="Reason for declining entry…"
                          className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-400"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDenyFor(null)}
                            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => doDeny(v.id)}
                            disabled={!!actionLoading || !denyReason.trim()}
                            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {actionLoading === v.id + '-deny' ? '…' : 'Confirm decline'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {v.status === 'DENIED' && (
                  <p className="w-full text-center text-sm text-red-600">
                    Entry declined{v.deniedReason ? `: ${v.deniedReason}` : ''}
                  </p>
                )}
                {v.status === 'ARRIVED' && (
                  <button
                    onClick={() => doExit(v.id)}
                    disabled={!!actionLoading}
                    title="Record exit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    <LogOut size={18} />
                    {actionLoading === v.id + '-out' ? '…' : 'EXIT'}
                  </button>
                )}
                {v.status === 'EXITED' && (
                  <p className="w-full text-center text-sm text-slate-400">Already exited</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!result && !error && !scanning && (
        <p className="mt-12 text-center text-slate-400">
          Enter passphrase, tap the camera to scan, or use “Scan from photo”.
        </p>
      )}

      {/* Full-screen photo preview for gate verification */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Visitor photo preview"
        >
          <button
            type="button"
            onClick={() => setPreviewPhoto(null)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            aria-label="Close preview"
          >
            <X size={24} />
          </button>
          <p className="mb-3 text-center text-sm font-medium text-white/90">
            {previewPhoto.name}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewPhoto.url}
            alt={previewPhoto.name}
            className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-4 text-xs text-white/60">Tap outside to close</p>
        </div>
      )}

    </div>
  );
}

