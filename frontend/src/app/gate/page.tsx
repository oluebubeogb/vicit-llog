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
  BellRing,
  ImagePlus,
  Flashlight,
  SwitchCamera,
  Footprints,
  Bike,
  Car,
  UserRound,
} from 'lucide-react';
import PersonLink from '@/components/PersonLink';
import PageHeader from '@/components/ui/PageHeader';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Collapse from '@/components/ui/Collapse';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
import { fmtDate, MODE_LABEL } from '@/lib/format';
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
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [activeGateId, setActiveGateId] = useState('');
  const [withheldItems, setWithheldItems] = useState('');
  const [allowedItems, setAllowedItems] = useState('');
  const [evidencePhotos, setEvidencePhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const [evidenceCameraOpen, setEvidenceCameraOpen] = useState(false);
  const [evidenceCameraError, setEvidenceCameraError] = useState('');
  const [particularsChecked, setParticularsChecked] = useState(false);

  const [photoDecoding, setPhotoDecoding] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const evidenceVideoRef = useRef<HTMLVideoElement>(null);
  const evidenceStreamRef = useRef<MediaStream | null>(null);
  const evidencePreviewUrlsRef = useRef<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const scanSession = useRef(0);
  const cameraIdx = useRef(-1);

  useEffect(() => {
    const u = getUser();
    if (u) api.checkpoints().then((rows: any[]) => { setCheckpoints(rows || []); if (rows?.length) setActiveGateId(rows[0].id); }).catch(() => {});
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

  useEffect(() => {
    const video = evidenceVideoRef.current;
    const stream = evidenceStreamRef.current;
    if (evidenceCameraOpen && video && stream) {
      video.srcObject = stream;
      video.play().catch(() => { /* browser will resume when media is ready */ });
    }
  }, [evidenceCameraOpen]);

  useEffect(() => {
    if (!result || !checkpoints.length) return;
    const relevant = checkpoints.filter((g: any) => result.locationId ? g.locationId === result.locationId : g.location?.organisationId === result.organisationId);
    const passed = new Set((result.visitors || []).flatMap((v: any) => (v.gateVisits || []).filter((event: any) => event.decision === 'PASSED').map((event: any) => event.gateId)));
    const next = relevant.sort((a: any,b: any)=>a.sequence-b.sequence).find((g: any) => !passed.has(g.id));
    if (next && !relevant.some((g: any) => g.id === activeGateId && !passed.has(g.id))) setActiveGateId(next.id);
  }, [result, checkpoints, activeGateId]);

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
      const relevant = checkpoints.filter((g: any) => data?.locationId ? g.locationId === data.locationId : g.location?.organisationId === data?.organisationId);
      const passed = new Set((data?.visitors || []).flatMap((v: any) => (v.gateVisits || []).filter((event: any) => event.decision === 'PASSED').map((event: any) => event.gateId)));
      const next = relevant.sort((a: any,b: any)=>a.sequence-b.sequence).find((g: any) => !passed.has(g.id));
      if (next) setActiveGateId(next.id);
    } catch (err: any) {
      setError(err.message || 'Not found');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!result?.visitors?.some((v:any)=>v.status==='ARRIVED')) return;
    const timer = window.setInterval(async () => {
      const current = normalizeScannedCode(code);
      if (!current) return;
      const waiting = (result.visitors || []).filter((v:any) => v.status === 'ARRIVED' && v.hostAvailabilityStatus === 'WAITING' && v.hostWaitUntil && new Date(v.hostWaitUntil).getTime() <= Date.now());
      for (const visitor of waiting) { try { await api.requestHostAvailability(visitor.id); } catch { /* server cooldown prevents duplicate prompts */ } }
      await lookup(current).catch(()=>{});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [result, code]);

  async function doCheckpoint(visitorId: string, decision: 'PASSED' | 'DENIED') {
    if (!activeGateId) { setError('Choose the checkpoint first.'); return; }
    setActionLoading(visitorId + '-checkpoint');
    try {
      const uploadedEvidence = await Promise.all(evidencePhotos.map(async (photo) => (await api.uploadParticularImage(photo.file)).imagePath));
      const particulars: any[] = [
        ...withheldItems.split(/\r?\n/).map((description: string) => description.trim()).filter(Boolean).map((description: string) => ({ kind: 'WITHHELD', description })),
        ...allowedItems.split(/\r?\n/).map((description: string) => description.trim()).filter(Boolean).map((description: string) => ({ kind: 'ALLOWED', description })),
      ];
      await api.recordCheckpoint({ visitorId, gateId: activeGateId, decision, entryMode, notes: decision === 'DENIED' ? denyReason : '', particulars, particularsChecked, evidencePhotos: uploadedEvidence });
      const currentGate = checkpoints.find((g: any) => g.id === activeGateId);
      const nextGate = currentGate && checkpoints.filter((g: any) => g.locationId === currentGate.locationId && g.sequence > currentGate.sequence).sort((a: any,b: any)=>a.sequence-b.sequence)[0];
      if (nextGate) setActiveGateId(nextGate.id);
      setWithheldItems(''); setAllowedItems(''); clearEvidenceRack(); setParticularsChecked(false); setDenyFor(null); setDenyReason('');
      await lookup();
    } catch (err: any) { setError(err.message || 'Checkpoint could not be recorded'); } finally { setActionLoading(''); }
  }

  function stopEvidenceCamera() {
    evidenceStreamRef.current?.getTracks().forEach(track => track.stop());
    evidenceStreamRef.current = null;
    if (evidenceVideoRef.current) {
      evidenceVideoRef.current.pause();
      evidenceVideoRef.current.srcObject = null;
    }
    setEvidenceCameraOpen(false);
  }

  async function startEvidenceCamera() {
    setEvidenceCameraError('');
    if (evidencePhotos.length >= 10) { setEvidenceCameraError('You can capture up to 10 photos per checkpoint.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setEvidenceCameraError('Live camera access requires HTTPS and a supported browser.'); return; }
    stopEvidenceCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      evidenceStreamRef.current = stream;
      setEvidenceCameraOpen(true);
    } catch (err: any) {
      setEvidenceCameraError(err?.name === 'NotAllowedError' ? 'Allow camera access in your browser to capture checkpoint evidence.' : 'Could not open the live camera. Check camera permissions and try again.');
    }
  }

  async function captureEvidencePhoto() {
    const video = evidenceVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) { setEvidenceCameraError('Camera is still starting. Try again in a moment.'); return; }
    if (evidencePhotos.length >= 10) { setEvidenceCameraError('You can capture up to 10 photos per checkpoint.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setEvidenceCameraError('Could not process the camera frame.'); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) { setEvidenceCameraError('Could not convert the photo to WebP.'); return; }
    const file = new File([blob], `checkpoint-${Date.now()}.webp`, { type: 'image/webp' });
    const preview = URL.createObjectURL(blob);
    evidencePreviewUrlsRef.current.push(preview);
    setEvidencePhotos(current => [...current, { file, preview }]);
    setEvidenceCameraError('');
  }

  function removeEvidencePhoto(index: number) {
    setEvidencePhotos(current => {
      const item = current[index];
      if (item) { URL.revokeObjectURL(item.preview); evidencePreviewUrlsRef.current = evidencePreviewUrlsRef.current.filter(url => url !== item.preview); }
      return current.filter((_, i) => i !== index);
    });
  }

  function clearEvidenceRack() {
    evidencePreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    evidencePreviewUrlsRef.current = [];
    setEvidencePhotos([]);
    stopEvidenceCamera();
  }

  useEffect(() => () => {
    evidenceStreamRef.current?.getTracks().forEach(track => track.stop());
    evidencePreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

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

  async function markParticularReturned(id: string) {
    setActionLoading('particular-' + id);
    try { await api.returnParticular(id); await lookup(); } catch (err: any) { setError(err.message || 'Could not update item custody'); } finally { setActionLoading(''); }
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

  const photo = (p: string) => `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/visitors/photo/${p}`;
  const particularPhoto = (p: string) => `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${p}`;
  const currentRole = getUser()?.role;
  const currentCheckpoints = checkpoints.filter((g: any) => result ? (result.locationId ? g.locationId === result.locationId : g.location?.organisationId === result.organisationId) : true);
  const MODES = [
    { v: 'PEDESTRIAN', l: 'On foot', icon: <Footprints size={16} /> },
    { v: 'MOTORCYCLE', l: 'Motorcycle', icon: <Bike size={16} /> },
    { v: 'VEHICLE', l: 'Vehicle', icon: <Car size={16} /> },
  ];

  return (
    <div className="page">
      <PageHeader
        icon={<ScanLine size={20} />}
        title="Gate control"
        subtitle="Scan a QR code or type the passphrase"
        info="The camera works on iPhone, Android and desktop. If the live camera is unavailable, use “Scan from photo”."
      />

      <div className="surface animate-in mb-4 !p-3">
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Passphrase or QR data"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="input min-w-0 flex-1 !px-3 !py-3.5 font-mono uppercase tracking-[0.18em] sm:!px-4 sm:text-lg"
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
          />
          <Tooltip content="Look up passphrase">
            <button onClick={() => lookup()} disabled={loading} className="btn-primary shrink-0 !px-3.5" aria-label="Look up">
              {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Search size={21} />}
            </button>
          </Tooltip>
          <Tooltip content={scanning ? 'Stop camera' : 'Scan QR with camera'}>
            <button
              type="button"
              onClick={() => (scanning ? stopScanner() : startScanner())}
              className={`${scanning ? 'btn-danger' : 'btn-success'} shrink-0 !px-3.5`}
              aria-label={scanning ? 'Stop camera' : 'Scan QR code'}
            >
              {scanning ? <X size={21} /> : <Camera size={21} />}
            </button>
          </Tooltip>
        </div>

        {/* Video stays mounted so the ref exists before getUserMedia resolves (iOS) */}
        <div className={`mt-3 overflow-hidden rounded-2xl bg-slate-950 shadow-lift ring-1 ring-black/10 ${scanning ? 'animate-in' : 'hidden'}`}>
          <div className="relative">
            <video ref={videoRef} playsInline muted autoPlay disablePictureInPicture className="aspect-square max-h-80 w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[65%] w-[65%] rounded-3xl shadow-[0_0_0_999px_rgba(2,6,23,0.45)]">
                {['left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'].map((c) => (
                  <span key={c} className={`absolute h-10 w-10 border-white ${c}`} />
                ))}
                <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_12px_rgb(110_231_183)]" />
              </div>
            </div>
            <div className="absolute right-2 top-2 flex gap-2">
              {torchSupported && (
                <button type="button" onClick={toggleTorch} className={`rounded-full p-2.5 backdrop-blur transition ${torchOn ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'}`} aria-label="Toggle torch" title="Torch">
                  <Flashlight size={18} />
                </button>
              )}
              {cameras.length > 1 && (
                <button type="button" onClick={switchCamera} className="rounded-full bg-white/20 p-2.5 text-white backdrop-blur transition hover:bg-white/30" aria-label="Switch camera" title="Switch camera">
                  <SwitchCamera size={18} />
                </button>
              )}
            </div>
          </div>
          <p className="flex items-center justify-center gap-1.5 bg-white/95 py-2 text-center text-xs text-slate-500">
            <ScanLine size={13} className="text-emerald-600" /> Point at the QR · ask the visitor to raise screen brightness
          </p>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoPicked} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={photoDecoding} className="btn-ghost mt-3 w-full">
          <ImagePlus size={17} />
          {photoDecoding ? 'Reading QR…' : 'Scan from photo'}
          <InfoTip text="Take or choose a picture of the QR code — handy when the live camera is blocked." size={13} />
        </button>
      </div>

      {scanError && <Notice tone="warn">{scanError}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <div className="stagger space-y-3">
          <div className="card card-art p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600">
                <UserRound size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Visiting</p>
                <p className="font-semibold text-slate-900">
                  <PersonLink id={result.host?.id} name={result.host?.fullName} className="font-semibold" />
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{result.purpose}</p>
              </div>
              {result.category && <StatusPill status={result.category} />}
            </div>
          </div>

          <div>
            <span className="label">
              Arriving by
              <InfoTip text={`Pre-filled from the invite${result.expectedMode ? ` (arriving by: ${(MODE_LABEL[result.expectedMode] || result.expectedMode).toLowerCase()})` : ''}; change it if the visitor arrives differently.`} />
            </span>
            <div className="segmented w-full">
              {MODES.map((m) => (
                <button key={m.v} type="button" data-active={entryMode === m.v} onClick={() => setEntryMode(m.v)} className="!flex flex-1 items-center justify-center gap-1.5">
                  {m.icon} {m.l}
                </button>
              ))}
            </div>
          </div>

          {result.visitors?.map((v: any) => (
            <div key={v.id} className={`card p-4 ${result.scannedVisitorId === v.id ? '!border-brand-300 ring-2 ring-brand-200' : ''}`}>
              {result.scannedVisitorId === v.id && result.visitors?.length > 1 && (
                <p className="eyebrow mb-2 flex items-center gap-1">
                  <ScanLine size={12} /> Scanned QR belongs to this guest
                </p>
              )}
              <div className="flex items-start gap-3">
                {v.photoPath ? (
                  <Tooltip content="Tap to enlarge photo">
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto({ url: photo(v.photoPath), name: v.fullName })}
                      className="group relative shrink-0 overflow-hidden rounded-2xl shadow-soft ring-2 ring-white transition hover:ring-brand-400 focus:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo(v.photoPath)} alt={v.fullName} className="h-20 w-20 object-cover transition duration-500 group-hover:scale-110" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-[10px] font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">View</span>
                    </button>
                  </Tooltip>
                ) : (
                  <Avatar name={v.fullName} size={80} className="!rounded-2xl" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-slate-900">{v.fullName}</p>
                  <StatusPill status={v.status} className="mt-1" />
                  {(v.gateVisits || []).length > 0 && <p className="mt-1 text-[11px] text-slate-500">{v.gateVisits.length} checkpoint record{v.gateVisits.length===1?'':'s'}</p>}
                  <div className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                    {v.enteredAt && <p className="flex items-center gap-1"><LogIn size={11} className="text-emerald-600" /> In {fmtDate(v.enteredAt)}</p>}
                    {v.exitedAt && <p className="flex items-center gap-1"><LogOut size={11} /> Out {fmtDate(v.exitedAt)}</p>}
                  </div>
                </div>
              </div>

              {(v.gateVisits || []).length > 0 && <div className="mt-3 space-y-2">
                {v.gateVisits.map((event: any) => <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2"><b className="text-xs text-slate-700">{event.gate?.name || 'Checkpoint'}</b><span className={`text-[10px] font-bold ${event.decision==='DENIED'?'text-rose-700':'text-emerald-700'}`}>{event.decision}</span></div>{event.particularsChecked&&<p className="mt-1 text-[10px] font-medium text-emerald-700">Particulars check confirmed</p>}
                  <p className="mt-0.5 text-[10px] text-slate-400">{event.officer?.fullName || 'Officer'} · {fmtDate(event.occurredAt)}</p>
                  {(event.particulars || []).filter((x:any)=>x.kind==='WITHHELD').map((x:any)=><div key={x.id} className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-800"><b>WITHHELD</b> · {x.description} {x.quantity>1?`(×${x.quantity})`:''}{x.imagePath&&<a className="ml-2 underline" href={particularPhoto(x.imagePath)} target="_blank" rel="noreferrer">View photo</a>} {x.returnedAt?<span className="ml-2 font-semibold text-emerald-700">Returned</span>:<button type="button" onClick={()=>markParticularReturned(x.id)} disabled={!!actionLoading} className="ml-2 font-semibold underline">Mark returned</button>}</div>)}
                  {(event.particulars || []).filter((x:any)=>x.kind==='ALLOWED').map((x:any)=><div key={x.id} className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800"><b>ALLOWED</b> · {x.description} {x.quantity>1?`(×${x.quantity})`:''}{x.imagePath&&<a className="ml-2 underline" href={particularPhoto(x.imagePath)} target="_blank" rel="noreferrer">View photo</a>}</div>)}
                  {(event.evidencePhotos || []).length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{event.evidencePhotos.map((path: string, i: number) => <a key={`${path}-${i}`} href={particularPhoto(path)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-200"><img src={particularPhoto(path)} alt={`Checkpoint evidence ${i + 1}`} className="aspect-square w-full object-cover"/></a>)}</div>}
                </div>)}
              </div>}

              <div className="mt-4 space-y-2">
                {v.status === 'ARRIVED' && ['GATE','GLOBAL_GATE'].includes(currentRole) && <div className={`rounded-2xl border p-3 ${v.hostAvailabilityStatus==='AVAILABLE'?'border-emerald-200 bg-emerald-50':v.hostAvailabilityStatus==='WAITING'?'border-amber-200 bg-amber-50':'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2"><b className="text-xs text-slate-800">Host availability</b><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${v.hostAvailabilityStatus==='AVAILABLE'?'bg-emerald-100 text-emerald-800':v.hostAvailabilityStatus==='WAITING'?'bg-amber-100 text-amber-800':'bg-slate-200 text-slate-700'}`}>{v.hostAvailabilityStatus==='AVAILABLE'?'Available':v.hostAvailabilityStatus==='WAITING'?'Asked guest to wait':'Awaiting response'}</span></div>
                  {v.hostAvailabilityStatus==='WAITING' && v.hostWaitUntil && <p className="mt-1 text-xs text-amber-800">Host asked the visitor to wait until {new Date(v.hostWaitUntil).toLocaleTimeString()}.</p>}
                  {v.hostAvailabilityStatus==='AVAILABLE' && <p className="mt-1 text-xs text-emerald-800">Host has confirmed availability to receive this visitor.</p>}
                  <button type="button" onClick={async()=>{try{await api.requestHostAvailability(v.id);await lookup()}catch(e:any){setError(e.message||'Could not contact host')}}} className="btn-quiet mt-2 w-full !py-2 text-xs"><BellRing size={14}/> Ask host to confirm again</button>
                </div>}
                {v.status === 'INVITED' && !v.photoPath && (
                  <p className="tile-muted !py-2 text-center text-xs font-medium text-amber-700">Photo not captured yet — entry unlocks once the visitor adds a photo</p>
                )}
                {v.status === 'INVITED' && currentCheckpoints.length > 0 && (
                  <div className="w-full space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-semibold text-slate-700">Checkpoint inspection</p>{checkpoints.find((g:any)=>g.id===activeGateId)?.admissionsEnabled===false&&<p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Admissions are disabled at this gate.</p>}
                    <select className="input !py-2 text-sm" value={activeGateId} onChange={e => { setActiveGateId(e.target.value); setWithheldItems(''); setAllowedItems(''); clearEvidenceRack(); setParticularsChecked(false); }}>
                      {currentCheckpoints.map((g: any) => <option key={g.id} value={g.id}>{g.location?.organisation?.name ? `${g.location.organisation.name} · ` : ''}{g.location?.name} · {g.sequence + 1}. {g.name}</option>)}
                    </select>
                    <label className="block text-[11px] font-semibold text-slate-900">Withheld items (one per line)<textarea rows={2} value={withheldItems} onChange={e=>setWithheldItems(e.target.value)} className="input mt-1 !border-rose-100 !bg-rose-50/60 !py-2 font-sans text-sm placeholder:font-sans placeholder:text-slate-500" placeholder="Item retained at this gate…"/></label>
                    <label className="block text-[11px] font-semibold text-slate-900">Allowed items (one per line)<textarea rows={2} value={allowedItems} onChange={e=>setAllowedItems(e.target.value)} className="input mt-1 !border-emerald-100 !bg-emerald-50/60 !py-2 font-sans text-sm placeholder:font-sans placeholder:text-slate-500" placeholder="Items permitted through…"/></label>
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold text-slate-700">Checkpoint photo evidence</p></div><button type="button" onClick={evidenceCameraOpen ? stopEvidenceCamera : startEvidenceCamera} className="btn-ghost !py-2 !px-3 text-xs"><Camera size={14}/>{evidenceCameraOpen ? 'Close camera' : 'Open camera'}</button></div>
                      {evidenceCameraOpen && <div className="overflow-hidden rounded-xl bg-black"><video ref={evidenceVideoRef} autoPlay muted playsInline className="aspect-video w-full object-cover"/><div className="flex justify-center p-3"><button type="button" onClick={captureEvidencePhoto} disabled={evidencePhotos.length >= 10} className="btn-primary !rounded-full !px-6 !py-2"><Camera size={16}/> Capture photo</button></div></div>}
                      {evidenceCameraError && <p className="text-[11px] text-rose-600">{evidenceCameraError}</p>}
                      {evidencePhotos.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{evidencePhotos.map((item, index) => <div key={item.preview} className="relative overflow-hidden rounded-lg border border-slate-200"><img src={item.preview} alt={`Checkpoint evidence ${index + 1}`} className="aspect-square w-full object-cover"/><button type="button" onClick={() => removeEvidencePhoto(index)} aria-label={`Remove photo ${index + 1}`} className="absolute right-1 top-1 rounded-full bg-slate-950/80 p-1.5 text-white shadow"><X size={13}/></button><span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] text-white">{index + 1}</span></div>)}</div>}
                    </div>
                    {checkpoints.find((g:any)=>g.id===activeGateId)?.particularsCheckEnabled!==false&&<label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-100 p-2 text-[11px] text-slate-700"><input type="checkbox" checked={particularsChecked} onChange={e=>setParticularsChecked(e.target.checked)}/> I have completed the particulars check (including confirming there are no items to record).</label>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => doCheckpoint(v.id, 'PASSED')} disabled={!!actionLoading || !v.photoPath || checkpoints.find((g:any)=>g.id===activeGateId)?.admissionsEnabled===false || (checkpoints.find((g:any)=>g.id===activeGateId)?.particularsCheckEnabled!==false && !particularsChecked)} className="btn-success flex-1 !py-3">{actionLoading===v.id+'-checkpoint'?'Saving…':'Pass checkpoint'}</button>
                      <button type="button" onClick={() => { setDenyFor(denyFor===v.id?null:v.id); setDenyReason(''); }} disabled={!!actionLoading} className="btn-danger !px-4"><Ban size={17}/></button>
                    </div>
                    <Collapse open={denyFor === v.id}><textarea value={denyReason} onChange={e=>setDenyReason(e.target.value)} rows={2} className="input text-sm" placeholder="Reason for denial (required)…"/><button type="button" onClick={()=>doCheckpoint(v.id,'DENIED')} disabled={!!actionLoading||!denyReason.trim()||(checkpoints.find((g:any)=>g.id===activeGateId)?.particularsCheckEnabled!==false&&!particularsChecked)} className="btn-danger mt-2 w-full">Confirm denial at this checkpoint</button></Collapse>
                  </div>
                )}
                {v.status === 'INVITED' && currentCheckpoints.length === 0 && ['GATE', 'GLOBAL_GATE'].includes(currentRole) && (
                  <Notice tone="warn">No checkpoint is assigned to your account for this agency or destination. Contact an administrator.</Notice>
                )}
                {v.status === 'INVITED' && currentCheckpoints.length === 0 && !['GATE', 'GLOBAL_GATE'].includes(currentRole) && (
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => doEntry(v.id)} disabled={!!actionLoading || !v.photoPath} aria-label="Permit entry" className="btn-success flex-1 !py-3">
                        {actionLoading === v.id + '-in' ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <LogIn size={19} />}
                        Permit entry
                      </button>
                      <Tooltip content="Decline entry">
                        <button
                          type="button"
                          onClick={() => {
                            setDenyFor(denyFor === v.id ? null : v.id);
                            setDenyReason('');
                          }}
                          disabled={!!actionLoading}
                          aria-label="Decline entry"
                          className="btn shrink-0 border border-rose-200 bg-gradient-to-br from-rose-50 to-white !px-4 text-rose-700 hover:border-rose-300 hover:from-rose-100"
                        >
                          <Ban size={19} />
                        </button>
                      </Tooltip>
                    </div>
                    <Collapse open={denyFor === v.id}>
                      <div className="w-full rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-3">
                        <label className="mb-1 block text-xs font-semibold text-rose-800">Reason (required)</label>
                        <textarea value={denyReason} onChange={(e) => setDenyReason(e.target.value)} rows={2} placeholder="Reason for declining entry…" className="input !py-2 text-sm focus:!border-rose-300 focus:!ring-rose-100" />
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setDenyFor(null)} className="btn-ghost flex-1 !py-2">
                            Cancel
                          </button>
                          <button type="button" onClick={() => doDeny(v.id)} disabled={!!actionLoading || !denyReason.trim()} className="btn-danger flex-1 !py-2">
                            {actionLoading === v.id + '-deny' ? '…' : 'Confirm decline'}
                          </button>
                        </div>
                      </div>
                    </Collapse>
                  </div>
                )}
                {v.status === 'DENIED' && (
                  <Notice tone="error">Entry declined{v.deniedReason ? `: ${v.deniedReason}` : ''}</Notice>
                )}
                {v.status === 'ARRIVED' && (
                  <button onClick={() => doExit(v.id)} disabled={!!actionLoading} className="btn w-full bg-gradient-to-br from-amber-400 to-amber-600 !py-3 text-white shadow-[0_10px_24px_-10px_rgb(217_119_6/0.6)] hover:brightness-105">
                    <LogOut size={18} />
                    {actionLoading === v.id + '-out' ? '…' : 'Record exit'}
                  </button>
                )}
                {v.status === 'EXITED' && <p className="tile-muted !py-2 text-center text-sm text-slate-500">Already signed out</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!result && !error && !scanning && (
        <div className="animate-in mt-8 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 animate-pulse-ring rounded-[28px]" />
            <span className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 shadow-inner">
              <ScanLine size={40} />
            </span>
          </div>
          <p className="font-semibold text-slate-700">Ready to scan</p>
          <p className="mt-1 max-w-[260px] text-sm text-slate-500">Enter a passphrase, tap the camera, or scan from a photo.</p>
        </div>
      )}

      {/* Full-screen photo preview for gate verification */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[100] flex animate-in flex-col items-center justify-center bg-slate-950/90 p-4 backdrop-blur"
          onClick={() => setPreviewPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Visitor photo preview"
        >
          <button type="button" onClick={() => setPreviewPhoto(null)} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Close preview">
            <X size={24} />
          </button>
          <p className="mb-3 text-center text-sm font-medium text-white/90">{previewPhoto.name}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewPhoto.url} alt={previewPhoto.name} className="max-h-[80vh] max-w-full rounded-3xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <p className="mt-4 text-xs text-white/60">Tap outside to close</p>
        </div>
      )}
    </div>
  );
}
