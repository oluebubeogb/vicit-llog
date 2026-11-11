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
  Footprints,
  Bike,
  Car,
  UserRound,
} from 'lucide-react';
import PersonLink from '@/components/PersonLink';
import HostSuggest, { type HostPick } from '@/components/HostSuggest';
import PageHeader from '@/components/ui/PageHeader';
import StatusPill from '@/components/ui/StatusPill';
import Avatar from '@/components/ui/Avatar';
import Collapse from '@/components/ui/Collapse';
import Tooltip, { InfoTip } from '@/components/ui/Tooltip';
import { Notice } from '@/components/ui/Bits';
import PhotoGallery, { GalleryImage } from '@/components/PhotoGallery';
import CaptureThumbGrid from '@/components/CaptureThumbGrid';
import { InAppCallButton, PhoneCallLink } from '@/components/CallButtons';
import CheckpointTracker from '@/components/CheckpointTracker';
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
  const [withheldItems, setWithheldItems] = useState<Record<string, string>>({});
  const [allowedItems, setAllowedItems] = useState<Record<string, string>>({});
  const [evidencePhotos, setEvidencePhotos] = useState<Record<string, Array<{ file: File; preview: string }>>>({});
  const [evidenceGuestId, setEvidenceGuestId] = useState<string | null>(null);
  const [evidenceCameraOpen, setEvidenceCameraOpen] = useState(false);
  const [evidenceCameraError, setEvidenceCameraError] = useState('');
  const [particularsChecked, setParticularsChecked] = useState<Record<string, boolean>>({});
  const [showWithheld, setShowWithheld] = useState<Record<string, boolean>>({});
  const [showAllowed, setShowAllowed] = useState<Record<string, boolean>>({});
  const [expandedGuests, setExpandedGuests] = useState<Record<string, boolean>>({});
  const [selectedGuests, setSelectedGuests] = useState<Record<string, boolean>>({});
  const [denyReasons, setDenyReasons] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState('');
  const [hostPick, setHostPick] = useState<HostPick | null>(null);
  const [gallery, setGallery] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [ringNote, setRingNote] = useState<Record<string, string>>({});

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
  const lastScanValue = useRef('');
  const lastScanAt = useRef(0);
  const autoScan = useRef(true);
  const lookupBusy = useRef(false);

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
    if (!result || result.kind === 'staff' || !checkpoints.length) return;
    const relevant = checkpoints.filter((g: any) => result.locationId ? g.locationId === result.locationId : g.location?.organisationId === result.organisationId);
    const passed = new Set((result.visitors || []).flatMap((v: any) => (v.gateVisits || []).filter((event: any) => event.decision === 'PASSED').map((event: any) => event.gateId)));
    const next = relevant.sort((a: any,b: any)=>a.sequence-b.sequence).find((g: any) => !passed.has(g.id));
    if (next && !relevant.some((g: any) => g.id === activeGateId && !passed.has(g.id))) setActiveGateId(next.id);
  }, [result, checkpoints, activeGateId]);

  const codeRef = useRef(code);
  const resultRef = useRef(result);
  codeRef.current = code;
  resultRef.current = result;

  async function lookup(raw?: string, opts?: { silent?: boolean }) {
    const value = normalizeScannedCode(raw ?? codeRef.current);
    if (!value) return;
    if (!opts?.silent) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await api.gateLookup(value);
      setResult((prev: any) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
      if (data?.kind === 'staff') {
        // Staff attendance QR — no visitor checkpoint workflow
      } else {
        if (data?.expectedMode) setEntryMode(data.expectedMode);
        if (!opts?.silent) {
          const relevant = checkpoints.filter((g: any) => data?.locationId ? g.locationId === data.locationId : g.location?.organisationId === data?.organisationId);
          const passed = new Set((data?.visitors || []).flatMap((v: any) => (v.gateVisits || []).filter((event: any) => event.decision === 'PASSED').map((event: any) => event.gateId)));
          const next = [...relevant].sort((a: any,b: any)=>a.sequence-b.sequence).find((g: any) => !passed.has(g.id));
          if (next) setActiveGateId(next.id);
        }
      }
    } catch (err: any) {
      if (!opts?.silent) {
        setResult(null);
        setError(err.message || 'Not found');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    const onRing = (ev: Event) => {
      const call = (ev as CustomEvent).detail;
      const id = call?.visitor?.id;
      if (!id) return;
      const label = call.status === 'RINGING' ? 'Ringing' : call.status === 'ACCEPTED' ? 'Answered' : call.status === 'DECLINED' ? 'Declined' : call.status === 'BUSY' ? 'Busy' : call.status === 'MISSED' ? 'No answer' : '';
      setRingNote((m) => ({ ...m, [id]: label }));
    };
    window.addEventListener('vicit:ring', onRing);
    return () => window.removeEventListener('vicit:ring', onRing);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const current = resultRef.current;
      if (current?.kind === 'staff' || !current?.visitors?.some((v: any) => v.status === 'ARRIVED')) return;
      const codeNow = normalizeScannedCode(codeRef.current);
      if (!codeNow) return;
      const waiting = (current.visitors || []).filter((v: any) => v.status === 'ARRIVED' && v.hostAvailabilityStatus === 'WAITING' && v.hostWaitUntil && new Date(v.hostWaitUntil).getTime() <= Date.now());
      for (const visitor of waiting) { try { await api.requestHostAvailability(visitor.id); } catch { /* server cooldown prevents duplicate prompts */ } }
      await lookup(codeNow, { silent: true }).catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doCheckpoint(visitorId: string, decision: 'PASSED' | 'DENIED') {
    if (!activeGateId) { setError('Choose the checkpoint first.'); return; }
    setActionLoading(visitorId + '-checkpoint');
    try {
      const rack = evidencePhotos[visitorId] || [];
      const uploadedEvidence = await Promise.all(rack.map(async (photo) => (await api.uploadParticularImage(photo.file)).imagePath));
      const particulars: any[] = [
        ...(withheldItems[visitorId] || '').split(/\r?\n/).map((description: string) => description.trim()).filter(Boolean).map((description: string) => ({ kind: 'WITHHELD', description })),
        ...(allowedItems[visitorId] || '').split(/\r?\n/).map((description: string) => description.trim()).filter(Boolean).map((description: string) => ({ kind: 'ALLOWED', description })),
      ];
      const visitor = (result?.visitors || []).find((x: any) => x.id === visitorId) || (result?.appointments || []).flatMap((a: any) => a.visitors || []).find((x: any) => x.id === visitorId);
      const direction = visitor?.status === 'ARRIVED' ? 'EXIT' : 'ENTRY';
      await api.recordCheckpoint({ visitorId, gateId: activeGateId, decision, entryMode, direction, notes: decision === 'DENIED' ? (denyReasons[visitorId] || denyReason) : '', particulars, particularsChecked: particularsChecked[visitorId] === true, evidencePhotos: uploadedEvidence });
      const currentGate = checkpoints.find((g: any) => g.id === activeGateId);
      const nextGate = currentGate && checkpoints.filter((g: any) => g.locationId === currentGate.locationId && (direction === 'EXIT' ? g.sequence < currentGate.sequence : g.sequence > currentGate.sequence)).sort((a: any,b: any)=> direction === 'EXIT' ? b.sequence-a.sequence : a.sequence-b.sequence)[0];
      if (nextGate) setActiveGateId(nextGate.id);
      setWithheldItems((c) => ({ ...c, [visitorId]: '' }));
      setAllowedItems((c) => ({ ...c, [visitorId]: '' }));
      clearEvidenceRack(visitorId);
      setParticularsChecked((c) => ({ ...c, [visitorId]: false }));
      setDenyFor(null);
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

  async function startEvidenceCamera(guestId?: string) {
    if (guestId) setEvidenceGuestId(guestId);
    setEvidenceCameraError('');
    const gid = evidenceGuestId;
    if ((evidencePhotos[gid || ''] || []).length >= 10) { setEvidenceCameraError('You can capture up to 10 photos per checkpoint.'); return; }
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
    const gid = evidenceGuestId;
    if (!gid) { setEvidenceCameraError('Choose a guest first.'); return; }
    if ((evidencePhotos[gid] || []).length >= 10) { setEvidenceCameraError('You can capture up to 10 photos per checkpoint.'); return; }
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
    setEvidencePhotos(current => ({ ...current, [gid]: [...(current[gid] || []), { file, preview }] }));
    setEvidenceCameraError('');
  }

  function removeEvidencePhoto(guestId: string, index: number) {
    setEvidencePhotos(current => {
      const list = current[guestId] || [];
      const item = list[index];
      if (item) { URL.revokeObjectURL(item.preview); evidencePreviewUrlsRef.current = evidencePreviewUrlsRef.current.filter(url => url !== item.preview); }
      return { ...current, [guestId]: list.filter((_, i) => i !== index) };
    });
  }

  function clearEvidenceRack(guestId?: string) {
    if (!guestId) {
      Object.values(evidencePhotos).flat().forEach((item) => URL.revokeObjectURL(item.preview));
      evidencePreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      evidencePreviewUrlsRef.current = [];
      setEvidencePhotos({});
    } else {
      (evidencePhotos[guestId] || []).forEach((item) => URL.revokeObjectURL(item.preview));
      setEvidencePhotos((c) => ({ ...c, [guestId]: [] }));
    }
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

  async function resolveItem(id: string, resolution: 'RETURNED' | 'SEIZED' | 'OTHER', note?: string) {
    setActionLoading('particular-' + id);
    try { await api.resolveParticular(id, { resolution, note }); await lookup(); } catch (err: any) { setError(err.message || 'Could not resolve item'); } finally { setActionLoading(''); }
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
    const now = Date.now();
    // Ignore the same code for 8s so a held frame does not retrigger lookup.
    if (value === lastScanValue.current && now - lastScanAt.current < 8000) return;
    if (lookupBusy.current) return;
    lastScanValue.current = value;
    lastScanAt.current = now;
    try {
      navigator.vibrate?.(60);
    } catch {
      /* iOS has no vibrate */
    }
    // Keep the camera running for hands-free continuous scanning.
    setScanError('');
    setCode(displayCode(value));
    lookupBusy.current = true;
    Promise.resolve(lookup(value)).finally(() => {
      lookupBusy.current = false;
    });
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
      if (autoScan.current) startScanner();
    }
  }

  useEffect(() => {
    // Open the rear camera on arrival so a code can be scanned without a tap.
    // iOS may still require a user gesture; startScanner surfaces that in scanError
    // and the Scan button remains as a fallback.
    autoScan.current = true;
    startScanner();

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        stopScanner();
      } else if (autoScan.current) {
        startScanner();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', stopScanner);
    return () => {
      autoScan.current = false;
      document.removeEventListener('visibilitychange', onVis);
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
        subtitle="Camera opens automatically — or type a passphrase"
        info="The rear camera opens as soon as this page loads. Hold a code in view to scan hands-free. If the camera is blocked, use Scan, Scan from photo, or type the passphrase."
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
              onClick={() => { if (scanning) { autoScan.current = false; stopScanner(); } else { autoScan.current = true; startScanner(); } }}
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

      {result && result.kind === 'staff' && (
        <div className="card card-art space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow ${result.action === 'ARRIVAL' ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-sky-500 to-indigo-600'}`}>
              <UserRound size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Staff attendance</p>
              <p className="text-lg font-bold text-slate-900">{result.staff?.fullName}</p>
              <p className="text-xs text-slate-500">{result.staff?.roleLabel} · {result.staff?.organisation?.name}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${result.action === 'ARRIVAL' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
              {result.action === 'ARRIVAL' ? 'Arrived' : 'Exited'}
            </span>
          </div>
          <p className="text-sm text-slate-600">{result.message}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-400">Arrival</p><p className="font-semibold text-slate-800">{result.attendance?.arrivedAt ? new Date(result.attendance.arrivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-400">Exit</p><p className="font-semibold text-slate-800">{result.attendance?.exitedAt ? new Date(result.attendance.exitedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</p></div>
          </div>
          <p className="text-[11px] text-slate-400">Day {result.day} · {result.timezone}. First scan = arrival; later scans update exit.</p>
        </div>
      )}

      {result && result.kind === 'contractor' && (
        <div className="surface space-y-3 p-4">
          <div className="flex items-start gap-3">
            {result.contractor?.photoPath ? <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/contractors/photo/${result.contractor.photoPath}`} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><UserRound size={24} /></span>}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{result.contractor?.fullName}</p>
              <p className="text-xs text-slate-500">{[result.contractor?.company, (result.contractor?.agencies || []).map((a: any) => a.shortName || a.name).join(', ') || result.contractor?.organisation?.name].filter(Boolean).join(' · ')}</p>
              <StatusPill tone={result.contractor?.status === 'valid' ? 'emerald' : result.contractor?.status === 'terminated' ? 'rose' : 'rose'} className="mt-1" label={`${result.contractor?.status} through ${result.contractor?.validThrough ? new Date(result.contractor.validThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`} />
            </div>
          </div>
          {result.openVisit ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">On site · headed for <b>{result.openVisit.destination || result.openVisit.host?.fullName || 'site'}</b></p>
              {result.openVisit.host?.fullName && <p className="text-xs text-slate-500">Seeing {result.openVisit.host.fullName}</p>}
              <button type="button" className="btn w-full bg-gradient-to-br from-amber-400 to-amber-600 !py-3 text-white" disabled={!!actionLoading} onClick={async () => { setActionLoading('cout'); try { await api.contractorCheckOut({ contractorId: result.contractor.id, visitId: result.openVisit.id }); await lookup(); } catch (e: any) { setError(e.message); } finally { setActionLoading(''); } }}>Record exit</button>
            </div>
          ) : (
            <div className="space-y-2">
              <HostSuggest contractorId={result.contractor?.id} value={hostPick} onChange={setHostPick} required />
              <label className="block"><span className="label">Where are they headed? (optional)</span><input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Office, workshop…" /></label>
              <button type="button" className="btn-success w-full !py-3" disabled={!!actionLoading || (!destination.trim() && !hostPick)} onClick={async () => { setActionLoading('cin'); try { await api.contractorCheckIn({ contractorId: result.contractor.id, destination: destination.trim() || hostPick?.fullName, hostId: hostPick?.id, gateId: activeGateId || undefined }); setHostPick(null); setDestination(''); await lookup(); } catch (e: any) { setError(e.message); } finally { setActionLoading(''); } }}>Check in</button>
            </div>
          )}
        </div>
      )}

      {result && result.kind !== 'staff' && result.kind !== 'contractor' && (
        <div className="space-y-3">
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

          {(result.appointments || []).length > 1 && (
            <div className="surface space-y-2 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Today&apos;s appointments</p>
              {result.appointments.map((a: any) => (
                <div key={a.inviteId} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <b className="text-slate-800">{a.organisation?.name || 'Agency'}</b>
                  {a.host?.fullName && <span> · {a.host.fullName}</span>}
                  {a.purpose && <span> · {a.purpose}</span>}
                  {a.expectedAt && <span className="text-slate-400"> · {new Date(a.expectedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              ))}
            </div>
          )}

          {currentCheckpoints.length > 0 && (result.visitors || [])[0] && (
            <CheckpointTracker gates={currentCheckpoints} visits={(result.visitors || []).flatMap((v: any) => v.gateVisits || [])} direction={(result.visitors || []).some((v: any) => v.status === 'ARRIVED') ? 'both' : 'ENTRY'} />
          )}

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

          {result.visitors?.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white/80 px-3 py-2">
              <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={result.visitors.every((v: any) => selectedGuests[v.id])} onChange={(e) => setSelectedGuests(Object.fromEntries(result.visitors.map((v: any) => [v.id, e.target.checked])))} />
                Select all
              </label>
              <div className="ml-auto flex min-w-0 flex-wrap gap-2">
                <button type="button" className="btn-success !px-3 !py-1.5 text-[11px]" disabled={!!actionLoading || !Object.values(selectedGuests).some(Boolean)} onClick={() => result.visitors.filter((v: any) => selectedGuests[v.id]).forEach((v: any) => doCheckpoint(v.id, 'PASSED'))}>Pass selected</button>
                <button type="button" className="btn-danger !px-3 !py-1.5 text-[11px]" disabled={!!actionLoading || !Object.values(selectedGuests).some(Boolean)} onClick={() => { const first = result.visitors.find((v: any) => selectedGuests[v.id]); if (first) setDenyFor(first.id); }}>Decline selected</button>
              </div>
            </div>
          )}

          {result.visitors?.map((v: any) => {
            const open = expandedGuests[v.id] === true || result.visitors.length === 1;
            const draftPhotos = evidencePhotos[v.id] || [];
            const openItems = (v.gateVisits || []).flatMap((ev: any) => (ev.particulars || []).filter((x: any) => x.kind === 'WITHHELD' && !x.resolvedAt && !x.returnedAt));
            const showInspect = (v.status === 'INVITED' || v.status === 'ARRIVED') && currentCheckpoints.length > 0;
            return (
            <div key={v.id} className={`card p-4 ${result.scannedVisitorId === v.id ? '!border-brand-300 ring-2 ring-brand-200' : ''}`}>
              <div className="flex items-start gap-3">
                {result.visitors.length > 1 && <input type="checkbox" className="mt-2" checked={!!selectedGuests[v.id]} onChange={(e) => setSelectedGuests((c) => ({ ...c, [v.id]: e.target.checked }))} />}
                {v.photoPath ? (
                  <Tooltip content="Tap to enlarge photo">
                    <button type="button" onClick={() => setPreviewPhoto({ url: photo(v.photoPath), name: v.fullName })} className="group relative shrink-0 overflow-hidden rounded-2xl shadow-soft ring-2 ring-white">
                      <img src={photo(v.photoPath)} alt={v.fullName} className="h-16 w-16 object-cover" />
                    </button>
                  </Tooltip>
                ) : (
                  <Avatar name={v.fullName} size={64} className="!rounded-2xl" />
                )}
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpandedGuests((c) => ({ ...c, [v.id]: !open }))}>
                  <p className="truncate text-base font-bold text-slate-900">{v.fullName}</p>
                  <StatusPill status={v.status} className="mt-1" />
                  {result.scannedVisitorId === v.id && result.visitors?.length > 1 && <p className="mt-1 text-[10px] font-semibold text-brand-700">Scanned pass</p>}
                </button>
                {result.visitors.length > 1 && <span className="text-xs font-semibold text-slate-400">{open ? 'Hide' : 'Open'}</span>}
              </div>

              <Collapse open={open}>
              <div className="mt-3 space-y-2">
              {currentCheckpoints.length > 0 && <CheckpointTracker gates={currentCheckpoints} visits={v.gateVisits || []} direction={v.status === 'ARRIVED' || v.status === 'EXITED' ? 'both' : 'ENTRY'} />}

              {(v.transfers || []).length > 0 && (
                <div className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                  {(v.transfers || []).map((t: any) => <p key={t.id}>Transferred {new Date(t.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — {t.comment}</p>)}
                </div>
              )}

              {(v.gateVisits || []).length > 0 && <div className="space-y-2">
                {v.gateVisits.map((event: any) => <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2"><b className="text-xs text-slate-700">{event.gate?.name || 'Checkpoint'} · {event.direction === 'EXIT' ? 'Exit' : 'Entry'}</b><span className={`text-[10px] font-bold ${event.decision==='DENIED'?'text-rose-700':'text-emerald-700'}`}>{event.decision}</span></div>
                  {(() => {
                    const shots: GalleryImage[] = [
                      ...(event.evidencePhotos || []).map((path: string, i: number) => ({ src: particularPhoto(path), alt: `Evidence ${i + 1}` })),
                      ...(event.particulars || []).filter((x: any) => x.imagePath).map((x: any) => ({ src: particularPhoto(x.imagePath), alt: x.description })),
                    ];
                    const withheld = (event.particulars || []).filter((x: any) => x.kind === 'WITHHELD');
                    const allowed = (event.particulars || []).filter((x: any) => x.kind === 'ALLOWED');
                    return <>
                      {withheld.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{withheld.map((x: any) => (
                        <span key={x.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${x.resolvedAt || x.returnedAt ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                          {x.description}{x.quantity > 1 ? ` ×${x.quantity}` : ''}
                          {x.resolvedAt || x.returnedAt ? <span className="uppercase tracking-wide">{(x.resolution || 'returned').toLowerCase()}</span> : (
                            <span className="flex gap-1">
                              <button type="button" className="underline" onClick={() => resolveItem(x.id, 'RETURNED')}>Return</button>
                              <button type="button" className="underline" onClick={() => resolveItem(x.id, 'SEIZED')}>Seize</button>
                            </span>
                          )}
                        </span>
                      ))}</div>}
                      {allowed.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{allowed.map((x: any) => <span key={x.id} className="chip !bg-emerald-50 !text-emerald-800">{x.description}</span>)}</div>}
                      {shots.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{shots.map((shot, i) => <button type="button" key={`${shot.src}-${i}`} onClick={() => setGallery({ images: shots, index: i })} className="overflow-hidden rounded-lg border border-slate-200"><img src={shot.src} alt={shot.alt || 'Checkpoint photo'} className="aspect-square w-full object-cover"/></button>)}</div>}
                    </>;
                  })()}
                </div>)}
              </div>}

                {v.status === 'ARRIVED' && ['GATE','GLOBAL_GATE','SUPER_ADMIN'].includes(currentRole) && <div className={`rounded-2xl border p-3 ${v.hostAvailabilityStatus==='AVAILABLE'?'border-emerald-200 bg-emerald-50':v.hostAvailabilityStatus==='WAITING'?'border-amber-200 bg-amber-50':'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-xs text-slate-800">Host</b>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${v.hostAvailabilityStatus==='AVAILABLE'?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-700'}`}>{ringNote[v.id] || (v.hostAvailabilityStatus==='AVAILABLE'?'Available':v.hostAvailabilityStatus==='WAITING'?'Waiting':'No answer')}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <InAppCallButton className="flex-1 !py-2 text-xs" onClick={async()=>{try{const call=await api.startRing(v.id,'GATE_TO_HOST');window.dispatchEvent(new CustomEvent('vicit:ring-local',{detail:call}));}catch(e:any){setError(e.message||'Could not start the in-app call')}}} />
                    <PhoneCallLink phone={result.host?.phone} className="flex-1 !py-2 text-xs" />
                  </div>
                </div>}
                {v.status === 'INVITED' && !v.photoPath && (
                  <p className="tile-muted !py-2 text-center text-xs font-medium text-amber-700">Photo not captured yet — entry unlocks once the visitor adds a photo</p>
                )}
                {showInspect && (
                  <div className="w-full space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-xs font-semibold text-slate-700">{v.status === 'ARRIVED' ? 'Exit checkpoint' : 'Checkpoint inspection'}</p>
                    {openItems.length > 0 && v.status === 'ARRIVED' && (
                      <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-800">Return, seize or resolve withheld items before the final exit.</p>
                    )}
                    <select className="input !py-2 text-sm" value={activeGateId} onChange={e => setActiveGateId(e.target.value)}>
                      {currentCheckpoints.map((g: any) => <option key={g.id} value={g.id}>{g.location?.organisation?.name ? `${g.location.organisation.name} · ` : ''}{g.location?.name} · {g.sequence + 1}. {g.name}</option>)}
                    </select>
                    <div className="overflow-hidden rounded-xl border border-rose-100 bg-rose-50/40">
                      <button type="button" onClick={() => setShowWithheld((c) => ({ ...c, [v.id]: !c[v.id] }))} className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-rose-800">Withheld <span className="font-medium normal-case tracking-normal text-rose-600">{showWithheld[v.id] ? 'Hide' : (withheldItems[v.id] || '').trim() ? 'Edit' : 'Add'}</span></button>
                      <Collapse open={!!showWithheld[v.id]}><div className="px-3 pb-3"><textarea rows={2} value={withheldItems[v.id] || ''} onChange={e=>setWithheldItems((c)=>({...c,[v.id]:e.target.value}))} className="input !border-rose-100 !bg-white !py-2 font-sans text-sm" placeholder="One item per line"/></div></Collapse>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/40">
                      <button type="button" onClick={() => setShowAllowed((c) => ({ ...c, [v.id]: !c[v.id] }))} className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Allowed <span className="font-medium normal-case tracking-normal text-emerald-700">{showAllowed[v.id] ? 'Hide' : (allowedItems[v.id] || '').trim() ? 'Edit' : 'Add'}</span></button>
                      <Collapse open={!!showAllowed[v.id]}><div className="px-3 pb-3"><textarea rows={2} value={allowedItems[v.id] || ''} onChange={e=>setAllowedItems((c)=>({...c,[v.id]:e.target.value}))} className="input !border-emerald-100 !bg-white !py-2 font-sans text-sm" placeholder="One item per line"/></div></Collapse>
                    </div>
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">Checkpoint photo evidence</p><button type="button" onClick={() => evidenceCameraOpen && evidenceGuestId === v.id ? stopEvidenceCamera() : startEvidenceCamera(v.id)} className="btn-ghost !py-2 !px-3 text-xs"><Camera size={14}/>{evidenceCameraOpen && evidenceGuestId === v.id ? 'Close camera' : 'Open camera'}</button></div>
                      {evidenceCameraOpen && evidenceGuestId === v.id && <div className="overflow-hidden rounded-xl bg-black"><video ref={evidenceVideoRef} autoPlay muted playsInline className="aspect-video w-full object-cover"/><div className="flex justify-center p-3"><button type="button" onClick={captureEvidencePhoto} disabled={draftPhotos.length >= 10} className="btn-primary !rounded-full !px-6 !py-2"><Camera size={16}/> Capture photo</button></div></div>}
                      {evidenceCameraError && evidenceGuestId === v.id && <p className="text-[11px] text-rose-600">{evidenceCameraError}</p>}
                      {draftPhotos.length > 0 && <CaptureThumbGrid photos={draftPhotos.map((item, index) => ({ preview: item.preview, alt: `Checkpoint evidence ${index + 1}` }))} onRemove={(index) => removeEvidencePhoto(v.id, index)} />}
                    </div>
                    {checkpoints.find((g:any)=>g.id===activeGateId)?.particularsCheckEnabled!==false&&<label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-100 p-2 text-[11px] text-slate-700"><input type="checkbox" checked={!!particularsChecked[v.id]} onChange={e=>setParticularsChecked((c)=>({...c,[v.id]:e.target.checked}))}/> I have completed the particulars check (including confirming there are no items to record).</label>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => doCheckpoint(v.id, 'PASSED')} disabled={!!actionLoading || !v.photoPath || (v.status!=='ARRIVED' && checkpoints.find((g:any)=>g.id===activeGateId)?.admissionsEnabled===false) || (checkpoints.find((g:any)=>g.id===activeGateId)?.particularsCheckEnabled!==false && !particularsChecked[v.id])} className="btn-success flex-1 !py-3">{actionLoading===v.id+'-checkpoint'?'Saving…': v.status==='ARRIVED' ? 'Pass exit checkpoint' : 'Pass checkpoint'}</button>
                      <button type="button" onClick={() => { setDenyFor(denyFor===v.id?null:v.id); }} disabled={!!actionLoading} className="btn-danger !px-4"><Ban size={17}/></button>
                    </div>
                    <Collapse open={denyFor === v.id}><textarea value={denyReasons[v.id] || ''} onChange={e=>setDenyReasons((c)=>({...c,[v.id]:e.target.value}))} rows={2} className="input text-sm" placeholder="Reason for denial (required)…"/><button type="button" onClick={()=>doCheckpoint(v.id,'DENIED')} disabled={!!actionLoading||!(denyReasons[v.id]||'').trim()||(checkpoints.find((g:any)=>g.id===activeGateId)?.particularsCheckEnabled!==false&&!particularsChecked[v.id])} className="btn-danger mt-2 w-full">Confirm denial at this checkpoint</button></Collapse>
                  </div>
                )}
                {v.status === 'INVITED' && currentCheckpoints.length === 0 && ['GATE', 'GLOBAL_GATE'].includes(currentRole) && (
                  <Notice tone="warn">No checkpoint is assigned to your account for this agency or destination. Contact an administrator.</Notice>
                )}
                {v.status === 'INVITED' && currentCheckpoints.length === 0 && !['GATE', 'GLOBAL_GATE'].includes(currentRole) && (
                  <div className="flex w-full gap-2">
                    <button type="button" onClick={() => doEntry(v.id)} disabled={!!actionLoading || !v.photoPath} className="btn-success flex-1 !py-3">Permit entry</button>
                  </div>
                )}
                {v.status === 'DENIED' && (
                  <Notice tone="error">Entry declined{v.deniedReason ? `: ${v.deniedReason}` : ''}</Notice>
                )}
                {v.status === 'ARRIVED' && currentCheckpoints.length === 0 && (
                  <button onClick={() => doExit(v.id)} disabled={!!actionLoading || openItems.length > 0} className="btn w-full bg-gradient-to-br from-amber-400 to-amber-600 !py-3 text-white">
                    <LogOut size={18} />
                    {openItems.length > 0 ? 'Resolve withheld items first' : actionLoading === v.id + '-out' ? '…' : 'Record exit'}
                  </button>
                )}
                {v.status === 'EXITED' && <p className="tile-muted !py-2 text-center text-sm text-slate-500">Already signed out</p>}
              </div>
              </Collapse>
            </div>
          );})}
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
          <p className="mt-1 max-w-[260px] text-sm text-slate-500">Point the open camera at a QR code, or use Scan, Scan from photo, or type a passphrase.</p>
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
      {gallery && <PhotoGallery images={gallery.images} index={gallery.index} onIndex={(index) => setGallery((g) => (g ? { ...g, index } : g))} onClose={() => setGallery(null)} />}
    </div>
  );
}
