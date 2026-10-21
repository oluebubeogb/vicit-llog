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
} from 'lucide-react';
import PersonLink from '@/components/PersonLink';

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);

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
    const q = new URLSearchParams(window.location.search).get('code');
    if (q) {
      setCode(q);
      (async () => {
        try {
          const data = await api.gateLookup(q.trim());
          setResult(data);
          if (data?.expectedMode) setEntryMode(data.expectedMode);
        } catch (err: any) {
          setError(err.message || 'Not found');
        }
      })();
    }
  }, []);

  async function lookup(raw?: string) {
    const value = (raw ?? code).trim();
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
    if (scanTimer.current) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScanner() {
    setScanError('');
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const BD = (window as any).BarcodeDetector;
      if (typeof BD === 'function') {
        const detector = new BD({ formats: ['qr_code'] });
        scanTimer.current = window.setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) {
              const raw = codes[0].rawValue;
              stopScanner();
              setCode(raw);
              lookup(raw);
            }
          } catch {
            // keep scanning
          }
        }, 500);
      } else {
        setScanError(
          'QR scanner not supported in this browser (common on iOS). Paste the QR data or type the passphrase instead.',
        );
      }
    } catch {
      setScanError('Camera permission denied.');
      setScanning(false);
    }
  }

  useEffect(() => {
    return () => stopScanner();
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
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Passphrase or QR data"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-base font-mono tracking-wide outline-none focus:border-brand-500 sm:px-4 sm:text-lg"
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

      {scanning && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
          <video ref={videoRef} playsInline muted className="w-full max-h-64 object-cover" />
          <p className="bg-white py-2 text-center text-xs text-slate-500">
            Point camera at visitor QR code
          </p>
        </div>
      )}
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
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
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
          Enter passphrase, paste QR data, or tap the camera to scan.
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

