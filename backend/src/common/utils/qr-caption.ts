import * as QRCode from 'qrcode';
import { inflateSync } from 'zlib';
import { QR_FONT_DEFLATED_B64 } from './qr-font';
import { QR_RENDER_OPTIONS } from './qr';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require('pngjs');

/**
 * Gate QR pass with a printed caption ("Ibe Okafor | 21 Oct 2026" + a smaller org / ref line)
 * so saved passes are easy to tell apart in a phone gallery or a shared folder.
 *
 * Scan safety:
 *  - the QR itself is drawn exactly like before: error correction M, black on opaque white,
 *    integer module size (crisp edges) and the full 4-module quiet zone on every side;
 *  - the caption lives strictly BELOW the quiet zone, on the same white canvas, with an extra
 *    gap — nothing is ever drawn inside the quiet zone;
 *  - text is rendered in pure JS from bundled glyph bitmaps (no system fonts, no native canvas),
 *    so it looks the same in the node:alpine Docker image as in development.
 */

type Glyph = { adv: number; l: number; t: number; w: number; h: number; a: Uint8Array };
type Face = { size: number; ascent: number; descent: number; glyphs: Map<number, Glyph> };
let FONTS: { title: Face; sub: Face } | null = null;

function fonts() {
  if (FONTS) return FONTS;
  const raw = JSON.parse(inflateSync(Buffer.from(QR_FONT_DEFLATED_B64, 'base64')).toString('utf8'));
  const load = (f: any): Face => {
    const glyphs = new Map<number, Glyph>();
    for (const [code, g] of Object.entries<any>(f.glyphs)) {
      glyphs.set(Number(code), { adv: g[0], l: g[1], t: g[2], w: g[3], h: g[4], a: new Uint8Array(Buffer.from(g[5], 'base64')) });
    }
    return { size: f.size, ascent: f.ascent, descent: f.descent, glyphs };
  };
  FONTS = { title: load(raw.title), sub: load(raw.sub) };
  return FONTS;
}

/** Bundled glyphs are ASCII: fold accents (Ọlá → Ola) and replace anything else. */
export function captionSafe(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00b7\u2022]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function measure(face: Face, s: string) {
  let w = 0;
  for (const ch of s) w += face.glyphs.get(ch.charCodeAt(0))?.adv ?? face.size * 0.5;
  return w;
}

/** Shorten with an ellipsis so the line always fits the canvas width. */
function fit(face: Face, s: string, max: number) {
  if (measure(face, s) <= max) return s;
  let t = s;
  while (t.length > 1 && measure(face, t + '...') > max) t = t.slice(0, -1);
  return t.trimEnd() + '...';
}

function drawText(
  img: { data: Buffer; width: number; height: number },
  face: Face,
  s: string,
  cx: number,
  baseline: number,
  rgb: [number, number, number],
) {
  let x = cx - measure(face, s) / 2;
  for (const ch of s) {
    const g = face.glyphs.get(ch.charCodeAt(0));
    if (!g) {
      x += face.size * 0.5;
      continue;
    }
    const gx = Math.round(x + g.l);
    const gy = Math.round(baseline + g.t);
    for (let yy = 0; yy < g.h; yy++)
      for (let xx = 0; xx < g.w; xx++) {
        const a = g.a[yy * g.w + xx];
        if (!a) continue;
        const px = gx + xx;
        const py = gy + yy;
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const i = (py * img.width + px) * 4;
        const k = a / 255;
        img.data[i] = Math.round(img.data[i] * (1 - k) + rgb[0] * k);
        img.data[i + 1] = Math.round(img.data[i + 1] * (1 - k) + rgb[1] * k);
        img.data[i + 2] = Math.round(img.data[i + 2] * (1 - k) + rgb[2] * k);
      }
    x += g.adv;
  }
}

export type QrCaption = { title: string; subtitle?: string };

/** Geometry is exported for the tests: the QR (incl. quiet zone) occupies [0, qrSize) on both axes. */
export function captionedLayout(moduleCount: number) {
  const margin = QR_RENDER_OPTIONS.margin;
  const total = moduleCount + margin * 2;
  const scale = Math.max(4, Math.round(QR_RENDER_OPTIONS.width / total));
  const qrSize = total * scale;
  return { margin, scale, qrSize, captionHeight: Math.round(qrSize * 0.2) };
}

export function renderCaptionedQrPng(payload: string, caption?: QrCaption | null): Buffer {
  const qr = QRCode.create(payload, { errorCorrectionLevel: QR_RENDER_OPTIONS.errorCorrectionLevel });
  const n = qr.modules.size;
  const { margin, scale, qrSize, captionHeight } = captionedLayout(n);
  const title = captionSafe(caption?.title || '');
  const subtitle = captionSafe(caption?.subtitle || '');
  const hasCaption = !!(title || subtitle);
  const width = qrSize;
  const height = qrSize + (hasCaption ? captionHeight : 0);

  const png = new PNG({ width, height, colorType: 6 });
  png.data.fill(255); // opaque white everywhere (quiet zone + caption band)
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      const x0 = (c + margin) * scale;
      const y0 = (r + margin) * scale;
      for (let y = y0; y < y0 + scale; y++) {
        const row = y * width * 4;
        for (let x = x0; x < x0 + scale; x++) {
          const i = row + x * 4;
          png.data[i] = 0;
          png.data[i + 1] = 0;
          png.data[i + 2] = 0;
        }
      }
    }

  if (hasCaption) {
    const f = fonts();
    const pad = Math.round(qrSize * 0.06);
    const maxW = width - pad * 2;
    // hairline divider, well below the quiet zone, very light so no scanner treats it as data
    const divY = qrSize + Math.round(captionHeight * 0.06);
    for (let x = pad; x < width - pad; x++) {
      const i = (divY * width + x) * 4;
      png.data[i] = 226;
      png.data[i + 1] = 232;
      png.data[i + 2] = 240;
    }
    const titleBase = qrSize + Math.round(captionHeight * (subtitle ? 0.47 : 0.62));
    if (title) drawText(png, f.title, fit(f.title, title, maxW), width / 2, titleBase, [15, 23, 42]);
    if (subtitle) drawText(png, f.sub, fit(f.sub, subtitle, maxW), width / 2, qrSize + Math.round(captionHeight * 0.8), [71, 85, 105]);
  }
  return PNG.sync.write(png, { colorType: 6 });
}

export function renderCaptionedQrDataUrl(payload: string, caption?: QrCaption | null): string {
  return `data:image/png;base64,${renderCaptionedQrPng(payload, caption).toString('base64')}`;
}

/** "21 Oct 2026" — fixed English format so it reads the same on every pass. */
export function captionDate(d: Date | string | null | undefined): string {
  const dt = d ? new Date(d) : new Date();
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dt.getDate()} ${M[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Descriptive, filesystem-safe download name: vicit-pass_ibe-okafor_2026-10-21.png */
export function qrFileName(name: string, d?: Date | string | null): string {
  const dt = d ? new Date(d) : new Date();
  const slug =
    captionSafe(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'visitor';
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return `vicit-pass_${slug}_${iso}.png`;
}

/** Standard caption for a visitor gate pass: "Name | 21 Oct 2026" / "Org - Location - Ref 3F1C2A9E". */
export function gatePassCaption(opts: {
  fullName: string;
  visitorId: string;
  date?: Date | string | null;
  orgName?: string | null;
  locationName?: string | null;
}): QrCaption {
  return {
    title: `${opts.fullName} | ${captionDate(opts.date)}`,
    subtitle: [opts.orgName, opts.locationName, `Ref ${opts.visitorId.slice(0, 8).toUpperCase()}`].filter(Boolean).join(' - '),
  };
}
