/**
 * Cross-device QR scanning helpers for the gate.
 *
 * Why: the old scanner relied only on the native `BarcodeDetector` API, which does not
 * exist in Safari on iPhone/iPad (nor Firefox, nor desktop Safari, nor many Android
 * WebViews). We now:
 *   1. use BarcodeDetector when it exists AND supports qr_code (fast, Android Chrome),
 *   2. otherwise decode frames ourselves with jsQR (pure JS — works everywhere,
 *      including iOS Safari and iOS home-screen / standalone PWAs),
 *   3. offer "scan from photo" (file input with camera capture) for devices where live
 *      camera is unavailable (old iOS standalone PWAs, http:// pages, locked-down MDM),
 *   4. always keep manual passphrase entry.
 */
import jsQR from 'jsqr';

/** Clean a scanned/typed value without changing its meaning (backend does the parsing). */
export function normalizeScannedCode(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width / BOM
    .replace(/[\u201C\u201D\u2033]/g, '"') // iOS smart quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\r\n\t]+/g, '')
    .trim();
}

/** Human readable version for the input box (JSON payload → passphrase). */
export function displayCode(raw: string): string {
  const v = normalizeScannedCode(raw);
  if (v.startsWith('{')) {
    try {
      const o = JSON.parse(v);
      const p = o.p ?? o.P;
      if (typeof p === 'string' && p) return p.toUpperCase();
    } catch {
      /* ignore */
    }
  }
  return v;
}

// ---------------------------------------------------------------- decoding

export function decodeImageData(img: ImageData): string | null {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return r?.data ? r.data : null;
}

function getCtx(canvas: HTMLCanvasElement) {
  return (canvas.getContext('2d', { willReadFrequently: true } as any) ||
    canvas.getContext('2d')) as CanvasRenderingContext2D | null;
}

/**
 * Draw `src` (video / image / bitmap) scaled so its longest side is `maxDim`, optionally
 * cropping to the centre `crop` fraction, and decode with jsQR.
 */
export function decodeFromSource(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  canvas: HTMLCanvasElement,
  maxDim = 720,
  crop = 1,
): string | null {
  if (!srcW || !srcH) return null;
  const cw = Math.round(srcW * crop);
  const ch = Math.round(srcH * crop);
  const sx = Math.round((srcW - cw) / 2);
  const sy = Math.round((srcH - ch) / 2);
  const scale = Math.min(1, maxDim / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = getCtx(canvas);
  if (!ctx) return null;
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, w, h);
  return decodeImageData(ctx.getImageData(0, 0, w, h));
}

type NativeDetector = { detect: (s: any) => Promise<Array<{ rawValue: string }>> };

/** Native detector only when the browser really supports QR (never on iOS Safari). */
export async function getNativeQrDetector(): Promise<NativeDetector | null> {
  try {
    const BD = (globalThis as any).BarcodeDetector;
    if (typeof BD !== 'function') return null;
    if (typeof BD.getSupportedFormats === 'function') {
      const formats: string[] = await BD.getSupportedFormats();
      if (!formats.includes('qr_code')) return null;
    }
    return new BD({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

async function loadImage(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  // createImageBitmap honours EXIF orientation (iPhone photos) when asked to.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close?.() };
    } catch {
      /* fall back to <img> (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Could not read image'));
    img.src = url;
  });
  return {
    src: img,
    w: img.naturalWidth,
    h: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

/**
 * Decode a QR from a photo / screenshot (iPhone 12MP photos included). Tries several
 * scales and a centre crop because jsQR is sensitive to module size.
 */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const native = await getNativeQrDetector();
  const img = await loadImage(file);
  try {
    if (native) {
      try {
        const codes = await native.detect(img.src);
        if (codes?.[0]?.rawValue) return codes[0].rawValue;
      } catch {
        /* fall through to jsQR */
      }
    }
    const canvas = document.createElement('canvas');
    const attempts: Array<[number, number]> = [
      [1024, 1],
      [1600, 1],
      [800, 1],
      [1200, 0.6],
      [2400, 1],
      [600, 1],
      [1000, 0.4],
    ];
    for (const [maxDim, crop] of attempts) {
      const r = decodeFromSource(img.src, img.w, img.h, canvas, maxDim, crop);
      if (r) return r;
    }
    return null;
  } finally {
    img.close();
  }
}

// ---------------------------------------------------------------- camera

export function cameraSupport(): { ok: true } | { ok: false; reason: string } {
  if (typeof window === 'undefined') return { ok: false, reason: 'Not in a browser' };
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason:
        'Live camera needs a secure (https://) connection. Open the app over HTTPS, or use "Scan from photo" / type the passphrase.',
    };
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    const standalone =
      (navigator as any).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches;
    return {
      ok: false,
      reason: standalone
        ? 'This device does not allow live camera in home-screen apps (update iOS to 13.4+ or open in Safari). Use "Scan from photo" instead.'
        : 'Live camera is not available in this browser. Use "Scan from photo" or type the passphrase.',
    };
  }
  return { ok: true };
}

export function describeCameraError(err: any): string {
  const name = err?.name || '';
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return isIOS
        ? 'Camera access was blocked. On iPhone: tap "aA" in the Safari address bar → Website Settings → Camera → Allow (or Settings → Safari → Camera → Allow), then try again.'
        : 'Camera access was blocked. Allow camera for this site in your browser settings (lock icon in the address bar), then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'No usable camera was found on this device. Use "Scan from photo" or type the passphrase.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'The camera is busy or unavailable. Close other apps/tabs using the camera and try again.';
    default:
      return `Could not start the camera${err?.message ? ` (${err.message})` : ''}. Use "Scan from photo" or type the passphrase.`;
  }
}

/** Open the rear camera with progressively looser constraints (older iOS / desktops). */
export async function openRearCamera(deviceId?: string): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  const attempts: MediaStreamConstraints[] = deviceId
    ? [{ audio: false, video: { deviceId: { exact: deviceId } } }]
    : [];
  attempts.push(
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  );
  let lastErr: any;
  for (const c of attempts) {
    try {
      return await md.getUserMedia(c);
    } catch (e: any) {
      lastErr = e;
      // Permission problems will not be fixed by looser constraints
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw e;
    }
  }
  throw lastErr;
}
