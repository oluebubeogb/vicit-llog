/**
 * Generates PWA launch assets from public/icon-512.png with no external tools:
 *   public/splash/apple-splash-<w>x<h>.png   (iOS apple-touch-startup-image)
 *   public/icon-maskable-512.png             (Android adaptive icon)
 *   public/apple-touch-icon.png              (180px, solid white tile)
 * Usage: node scripts/generate-pwa-assets.mjs [#primary] [#secondary]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pub = path.join(root, 'public');
const primary = process.argv[2] || '#2563eb';
const secondary = process.argv[3] || '#1e3a8a';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const P = hex(primary);
const S = hex(secondary);
const icon = PNG.sync.read(fs.readFileSync(path.join(pub, 'icon-512.png')));

function sample(img, x, y) {
  // bilinear
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(y)));
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = img.data[(y0 * img.width + x0) * 4 + c];
    const b = img.data[(y0 * img.width + x1) * 4 + c];
    const d = img.data[(y1 * img.width + x0) * 4 + c];
    const e = img.data[(y1 * img.width + x1) * 4 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return out;
}

function blend(png, x, y, rgba) {
  const i = (y * png.width + x) * 4;
  const a = rgba[3] / 255;
  png.data[i] = png.data[i] * (1 - a) + rgba[0] * a;
  png.data[i + 1] = png.data[i + 1] * (1 - a) + rgba[1] * a;
  png.data[i + 2] = png.data[i + 2] * (1 - a) + rgba[2] * a;
  png.data[i + 3] = 255;
}

function roundedRectAlpha(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const d = Math.hypot(px - cx, py - cy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function render(w, h, { tile = 0.3, bg = 'gradient' } = {}) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (bg === 'white') {
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 255;
      } else {
        const t = Math.min(1, (x / w) * 0.35 + (y / h) * 0.75);
        // soft glow top-right
        const g = Math.max(0, 1 - Math.hypot(x - w, y) / (w * 1.1)) * 0.25;
        for (let c = 0; c < 3; c++) png.data[i + c] = Math.min(255, P[c] * (1 - t) + S[c] * t + 255 * g);
      }
      png.data[i + 3] = 255;
    }
  }
  const size = Math.round(Math.min(w, h) * tile);
  const tx = Math.round((w - size) / 2);
  const ty = Math.round((h - size) / 2 - (bg === 'gradient' && h > w ? h * 0.03 : 0));
  const radius = size * 0.26;
  // white tile with soft shadow
  if (bg !== 'white') {
    const sh = size * 0.08;
    for (let y = ty - sh; y < ty + size + sh * 2; y++)
      for (let x = tx - sh; x < tx + size + sh; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const a = roundedRectAlpha(x, y - sh * 0.6, tx - sh * 0.3, ty, size + sh * 0.6, size, radius) * 0.18;
        if (a > 0) blend(png, x, y, [8, 12, 40, a * 255]);
      }
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) {
        const a = roundedRectAlpha(x + 0.5, y + 0.5, tx, ty, size, size, radius);
        if (a > 0) blend(png, x, y, [255, 255, 255, a * 255]);
      }
  }
  const pad = bg === 'white' ? size * 0.08 : size * 0.14;
  const inner = size - pad * 2;
  for (let y = 0; y < inner; y++)
    for (let x = 0; x < inner; x++) {
      const s = sample(icon, (x / inner) * icon.width, (y / inner) * icon.height);
      if (s[3] > 2) blend(png, Math.round(tx + pad + x), Math.round(ty + pad + y), s);
    }
  return PNG.sync.write(png, { colorType: 2 });
}

const SPLASH = [
  [1320, 2868], [1206, 2622], [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
  [1125, 2436], [1242, 2688], [828, 1792], [1242, 2208], [750, 1334], [640, 1136],
  [2048, 2732], [1668, 2388], [1640, 2360], [1620, 2160], [1536, 2048],
];
fs.mkdirSync(path.join(pub, 'splash'), { recursive: true });
for (const [w, h] of SPLASH) {
  fs.writeFileSync(path.join(pub, 'splash', `apple-splash-${w}x${h}.png`), render(w, h, { tile: 0.3 }));
}
fs.writeFileSync(path.join(pub, 'icon-maskable-512.png'), render(512, 512, { tile: 0.62 }));
fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), render(180, 180, { tile: 1, bg: 'white' }));
console.log(`Generated ${SPLASH.length} splash screens + maskable + apple-touch icons`);
