import * as QRCode from 'qrcode';

/**
 * Single source of truth for every gate QR code (visitor page, email, hosted PNG).
 *
 * Scan-friendly settings:
 *  - error correction "M" (15%) — survives screen glare, scratches and email recompression
 *  - 4-module quiet zone (the QR spec minimum; iPhone / jsQR / ZXing struggle with less)
 *  - pure black on opaque white (no transparency, so dark-mode mail clients cannot
 *    render it as black-on-black)
 *  - 512px raster so it stays sharp when scaled down on retina screens
 */
export const QR_RENDER_OPTIONS = {
  errorCorrectionLevel: 'M' as const,
  margin: 4,
  width: 512,
  color: { dark: '#000000ff', light: '#ffffffff' },
};

/**
 * Compact payload. Kept JSON (same shape as before) so already-issued codes and any
 * other integrations keep working:  {"v":"<visitorId>","p":"<PASSPHRASE>","t":"<token8>"}
 */
export function buildGateQrPayload(visitorId: string, passphrase: string, token: string) {
  return JSON.stringify({ v: visitorId, p: passphrase, t: token.slice(0, 8) });
}

export function renderQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { ...QR_RENDER_OPTIONS, type: 'image/png' });
}

export function renderQrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { ...QR_RENDER_OPTIONS, type: 'png' });
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type ParsedGateCode = {
  /** Normalised passphrase candidate (upper-case, hyphen separated) */
  passphrase?: string;
  /** Invite token (from a /visitor/<token> URL or a bare UUID) */
  token?: string;
  /** Visitor id (from the QR JSON "v" field or a bare UUID) */
  visitorId?: string;
  /** First 8 chars of invite token from QR JSON "t" */
  tokenPrefix?: string;
};

function normPassphrase(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[\s_.–—]+/g, '-') // spaces, underscores, en/em dashes → hyphen
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Accepts anything a gate officer could scan or type and extracts lookup keys:
 *   - QR JSON  {"v":..,"p":..,"t":..}  (any key case, smart quotes, whitespace)
 *   - Full / partial URL to /visitor/<token> (with or without trailing slash, query, hash)
 *   - URL with ?code=<passphrase> (gate deep link)
 *   - Bare invite token / visitor id UUID
 *   - Passphrase in any case / with spaces instead of hyphens
 */
export function parseGateCode(rawInput: unknown): ParsedGateCode {
  if (typeof rawInput !== 'string') return {};
  // strip BOM / zero-width chars that some scanners and copy-paste add
  let raw = rawInput.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!raw) return {};

  // Normalise curly quotes (iOS "smart punctuation" when typing/pasting)
  const quoteFixed = raw.replace(/[\u201C\u201D\u2033]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // 1) JSON payload
  if (quoteFixed.startsWith('{')) {
    try {
      const obj = JSON.parse(quoteFixed);
      const lower: Record<string, any> = {};
      for (const k of Object.keys(obj || {})) lower[k.toLowerCase()] = obj[k];
      const out: ParsedGateCode = {};
      if (typeof lower.p === 'string' && lower.p.trim()) out.passphrase = normPassphrase(lower.p);
      if (typeof lower.v === 'string' && UUID_RE.test(lower.v)) out.visitorId = lower.v.toLowerCase();
      if (typeof lower.t === 'string' && lower.t.trim()) out.tokenPrefix = lower.t.trim().toLowerCase();
      if (out.passphrase || out.visitorId) return out;
    } catch {
      // fall through — maybe a mangled payload; try the other strategies
    }
    const pm = quoteFixed.match(/"p"\s*:\s*"([^"]+)"/i);
    const vm = quoteFixed.match(/"v"\s*:\s*"([^"]+)"/i);
    if (pm || vm) {
      return {
        passphrase: pm ? normPassphrase(pm[1]) : undefined,
        visitorId: vm && UUID_RE.test(vm[1]) ? vm[1].toLowerCase() : undefined,
      };
    }
  }

  // 2) URL (absolute or relative) to the visitor page or gate deep link
  if (/^(https?:\/\/|www\.|\/)/i.test(raw) || /\/visitor\//i.test(raw)) {
    try {
      const url = new URL(raw, 'http://placeholder.local');
      const code = url.searchParams.get('code');
      if (code) return parseGateCode(code);
      const m = url.pathname.match(/\/visitor\/([^/?#]+)/i);
      if (m) {
        const tok = decodeURIComponent(m[1]).trim();
        const uuid = tok.match(UUID_RE);
        return { token: (uuid ? uuid[0] : tok).toLowerCase() };
      }
    } catch {
      // not a URL
    }
    const anyUuid = raw.match(UUID_RE);
    if (anyUuid) return { token: anyUuid[0].toLowerCase(), visitorId: anyUuid[0].toLowerCase() };
  }

  // 3) Bare UUID — could be invite token or visitor id
  const bare = raw.match(new RegExp(`^${UUID_RE.source}$`, 'i'));
  if (bare) {
    const id = bare[0].toLowerCase();
    return { token: id, visitorId: id };
  }

  // 4) Passphrase
  return { passphrase: normPassphrase(raw) };
}
