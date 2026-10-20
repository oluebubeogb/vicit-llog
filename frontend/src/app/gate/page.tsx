'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser, clearToken } from '@/lib/api';
import {
  ScanLine,
  LogIn,
  LogOut,
  Search,
  Camera,
  X,
  Users,
  Clock,
  CheckCircle2,
  LogOut as SignOut,
  LayoutDashboard,
  ArrowUpDown,
} from 'lucide-react';

type Tab = 'scan' | 'visits';

export default function GatePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('scan');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [entryMode, setEntryMode] = useState('PEDESTRIAN');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [visits, setVisits] = useState<any[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [user, setUser] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  const loadVisits = useCallback(async () => {
    setVisitsLoading(true);
    try {
      const data = await api.gateVisits(filter || undefined);
      setVisits(Array.isArray(data) ? data : []);
    } catch {
      setVisits([]);
    } finally {
      setVisitsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (tab === 'visits') loadVisits();
  }, [tab, loadVisits]);

  async function lookup(raw?: string) {
    const value = (raw ?? code).trim();
    if (!value) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.gateLookup(value);
      setResult(data);
      setTab('scan');
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
      if (tab === 'visits') loadVisits();
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
      if (tab === 'visits') loadVisits();
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
          'QR scanner not supported in this browser. Paste QR data or type the passphrase instead.',
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

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const sortedVisits = [...visits].sort((a, b) => {
    const da = new Date(a.enteredAt || a.createdAt || 0).getTime();
    const db = new Date(b.enteredAt || b.createdAt || 0).getTime();
    return sortDesc ? db - da : da - db;
  });

  const onSite = visits.filter((v) => v.status === 'ARRIVED').length;
  const exited = visits.filter((v) => v.status === 'EXITED').length;
  const pending = visits.filter((v) => v.status === 'INVITED').length;

  return (
    <div className="min-h-screen bg-slate-900 px-4 pt-5 pb-28 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScanLine size={26} className="text-brand-400" />
          <div>
            <h1 className="text-lg font-bold">Gate Control</h1>
            {user?.fullName && (
              <p className="text-xs text-slate-400">{user.fullName}</p>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          <SignOut size={14} className="mr-1 inline" />
          Sign out
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-800 p-1">
        <button
          onClick={() => setTab('scan')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition ${
            tab === 'scan' ? 'bg-brand-600 text-white' : 'text-slate-400'
          }`}
        >
          <ScanLine size={16} /> Scan
        </button>
        <button
          onClick={() => setTab('visits')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition ${
            tab === 'visits' ? 'bg-brand-600 text-white' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard size={16} /> Visits
        </button>
      </div>

      {tab === 'scan' && (
        <>
          <div className="mb-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Passphrase or QR data"
              className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3.5 text-lg font-mono tracking-wide outline-none focus:border-brand-500"
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
            />
            <button
              onClick={() => lookup()}
              disabled={loading}
              className="rounded-xl bg-brand-600 px-4 py-3.5 font-semibold hover:bg-brand-700 disabled:opacity-60"
            >
              <Search size={22} />
            </button>
            <button
              onClick={() => (scanning ? stopScanner() : startScanner())}
              className={`rounded-xl px-4 py-3.5 font-semibold ${
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
            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-600 bg-black">
              <video ref={videoRef} playsInline muted className="w-full max-h-64 object-cover" />
              <p className="bg-slate-800 py-2 text-center text-xs text-slate-400">
                Point camera at visitor QR code
              </p>
            </div>
          )}
          {scanError && (
            <p className="mb-3 rounded-lg bg-amber-900/40 px-3 py-2 text-sm text-amber-200">
              {scanError}
            </p>
          )}

          {error && (
            <p className="mb-4 rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-800 p-4">
                <p className="text-sm text-slate-400">Host</p>
                <p className="font-semibold">{result.host?.fullName}</p>
                <p className="mt-2 text-sm text-slate-400">Purpose</p>
                <p>{result.purpose}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-slate-400">Entry mode</label>
                <select
                  value={entryMode}
                  onChange={(e) => setEntryMode(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
                >
                  <option value="PEDESTRIAN">Pedestrian</option>
                  <option value="MOTORCYCLE">Motorcycle</option>
                  <option value="VEHICLE">Vehicle</option>
                </select>
              </div>

              {result.visitors?.map((v: any) => (
                <div
                  key={v.id}
                  className="rounded-2xl border border-slate-700 bg-slate-800 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-semibold">{v.fullName}</p>
                      <p className="text-sm text-slate-400">
                        Status:{' '}
                        <span className="text-white">{v.status}</span>
                      </p>
                      {v.enteredAt && (
                        <p className="text-xs text-slate-500">
                          In: {new Date(v.enteredAt).toLocaleString()}
                        </p>
                      )}
                      {v.exitedAt && (
                        <p className="text-xs text-slate-500">
                          Out: {new Date(v.exitedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {v.photoPath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/visitors/photo/${v.photoPath}`}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    {v.status === 'INVITED' && (
                      <button
                        onClick={() => doEntry(v.id)}
                        disabled={!!actionLoading || !v.photoPath}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold disabled:opacity-50"
                      >
                        <LogIn size={18} />
                        {actionLoading === v.id + '-in' ? '…' : 'ENTRY'}
                      </button>
                    )}
                    {v.status === 'ARRIVED' && (
                      <button
                        onClick={() => doExit(v.id)}
                        disabled={!!actionLoading}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 font-semibold disabled:opacity-50"
                      >
                        <LogOut size={18} />
                        {actionLoading === v.id + '-out' ? '…' : 'EXIT'}
                      </button>
                    )}
                    {v.status === 'EXITED' && (
                      <p className="w-full text-center text-sm text-slate-400">
                        Already exited
                      </p>
                    )}
                    {v.status === 'INVITED' && !v.photoPath && (
                      <p className="w-full text-center text-sm text-amber-400">
                        Photo not captured yet
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!result && !error && !scanning && (
            <p className="mt-12 text-center text-slate-500">
              Enter passphrase, paste QR data, or tap the camera to scan.
            </p>
          )}
        </>
      )}

      {tab === 'visits' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-800 p-3 text-center">
              <Users size={18} className="mx-auto mb-1 text-brand-400" />
              <p className="text-xl font-bold">{pending}</p>
              <p className="text-[10px] text-slate-400">Registered</p>
            </div>
            <div className="rounded-xl bg-slate-800 p-3 text-center">
              <Clock size={18} className="mx-auto mb-1 text-emerald-400" />
              <p className="text-xl font-bold">{onSite}</p>
              <p className="text-[10px] text-slate-400">On site</p>
            </div>
            <div className="rounded-xl bg-slate-800 p-3 text-center">
              <CheckCircle2 size={18} className="mx-auto mb-1 text-slate-400" />
              <p className="text-xl font-bold">{exited}</p>
              <p className="text-[10px] text-slate-400">Exited</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: '', label: 'All' },
              { id: 'pending', label: 'Registered' },
              { id: 'on_site', label: 'On site' },
              { id: 'exited', label: 'Exited' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  filter === f.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setSortDesc((s) => !s)}
              className="ml-auto flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400"
            >
              <ArrowUpDown size={12} />
              {sortDesc ? 'Newest' : 'Oldest'}
            </button>
          </div>

          {visitsLoading ? (
            <p className="py-8 text-center text-slate-500">Loading…</p>
          ) : sortedVisits.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No visits found</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-700">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Visitor</th>
                      <th className="px-3 py-2.5">Host</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sortedVisits.map((v) => (
                      <tr
                        key={v.visitorId}
                        className="bg-slate-900/50 hover:bg-slate-800/80"
                        onClick={() => {
                          if (v.passphrase) {
                            setCode(v.passphrase);
                            setTab('scan');
                            lookup(v.passphrase);
                          }
                        }}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{v.fullName}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[120px]">
                            {v.purpose}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{v.hostName}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              v.status === 'ARRIVED'
                                ? 'bg-emerald-900 text-emerald-300'
                                : v.status === 'EXITED'
                                  ? 'bg-slate-700 text-slate-300'
                                  : 'bg-brand-900 text-brand-300'
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-400">
                          {v.enteredAt
                            ? new Date(v.enteredAt).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : v.createdAt
                              ? new Date(v.createdAt).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          {v.exitedAt && (
                            <span className="block text-slate-500">
                              out{' '}
                              {new Date(v.exitedAt).toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
