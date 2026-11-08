/**
 * QR round-trip test: backend generator → PNG → frontend gate decoder (jsQR path used on
 * iPhone) → backend gate parser.  Run:  npm run test:qr   (no database needed)
 */
import * as assert from 'assert';
import * as path from 'path';
import {
  buildGateQrPayload,
  renderQrPng,
  renderQrDataUrl,
  parseGateCode,
} from '../src/common/utils/qr';
import {
  renderCaptionedQrPng,
  renderCaptionedQrDataUrl,
  captionedLayout,
  gatePassCaption,
  qrFileName,
  captionSafe,
} from '../src/common/utils/qr-caption';
// ZXing (pure-JS port of the decoder used by most Android scanner apps / Google Lens).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZX = require('@zxing/library');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require('pngjs');
// Load the *frontend* scanner module (same code the gate page runs in the browser)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const scan = require(path.resolve(__dirname, '../../frontend/src/lib/qrScan.ts'));

type Img = { data: Uint8ClampedArray; width: number; height: number };

function pngToImage(buf: Buffer): Img {
  const p = PNG.sync.read(buf);
  return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height };
}

/** Nearest-neighbour resize — simulates a low-res camera frame / small on-screen QR. */
function resize(img: Img, w: number, h: number): Img {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x * img.width) / w);
      const sy = Math.floor((y * img.height) / h);
      const si = (sy * img.width + sx) * 4;
      out.set(img.data.subarray(si, si + 4), (y * w + x) * 4);
    }
  return { data: out, width: w, height: h };
}

/** Put the QR in the middle of a bigger grey "scene" like a camera would see it. */
function placeInScene(img: Img, W: number, H: number): Img {
  const out = new Uint8ClampedArray(W * H * 4).fill(120);
  const ox = Math.floor((W - img.width) / 2);
  const oy = Math.floor((H - img.height) / 2);
  for (let y = 0; y < img.height; y++)
    out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((oy + y) * W + ox) * 4);
  return { data: out, width: W, height: H };
}

function invert(img: Img): Img {
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255 - out[i];
    out[i + 1] = 255 - out[i + 1];
    out[i + 2] = 255 - out[i + 2];
  }
  return { ...img, data: out };
}

function noise(img: Img, amt: number, seed = 1): Img {
  const out = new Uint8ClampedArray(img.data);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < out.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    out[i] += n;
    out[i + 1] += n;
    out[i + 2] += n;
  }
  return { ...img, data: out };
}

/** Aspect-preserving resize so the captioned (taller) pass is not distorted. */
function resizeW(img: Img, w: number): Img {
  return resize(img, w, Math.round((img.height * w) / img.width));
}

/** Centre crop by fraction — mirrors decodeFromSource(crop) in frontend/src/lib/qrScan.ts. */
function crop(img: Img, f: number): Img {
  const cw = Math.round(img.width * f);
  const ch = Math.round(img.height * f);
  const sx = Math.round((img.width - cw) / 2);
  const sy = Math.round((img.height - ch) / 2);
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    out.set(img.data.subarray(((sy + y) * img.width + sx) * 4, ((sy + y) * img.width + sx + cw) * 4), y * cw * 4);
  return { data: out, width: cw, height: ch };
}

/** Decode with ZXing (HybridBinarizer + TRY_HARDER; `inverted` = InvertedLuminanceSource). */
function zxingDecode(img: Img, inverted = false): string | null {
  const lum = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j++)
    lum[j] = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
  let src: any = new ZX.RGBLuminanceSource(lum, img.width, img.height);
  if (inverted) src = new ZX.InvertedLuminanceSource(src);
  const hints = new Map();
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.QR_CODE]);
  try {
    return new ZX.QRCodeReader().decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(src)), hints).getText();
  } catch {
    return null;
  }
}

let passed = 0;
function ok(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    });
}

(async () => {
  const visitorId = '3f1c2a9e-7b4d-4e2a-9c1f-0a1b2c3d4e5f';
  const token = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const passphrase = 'FOXTROT-CHARLIE-4821';
  const payload = buildGateQrPayload(visitorId, passphrase, token);

  console.log('Generation → decode (frontend jsQR path, as used on iPhone):');
  const png = await renderQrPng(payload);
  const full = pngToImage(png);

  await ok('PNG is 512px, opaque white background, black modules', () => {
    assert.strictEqual(full.width, 512);
    assert.deepStrictEqual(Array.from(full.data.subarray(0, 4)), [255, 255, 255, 255]);
    let hasBlack = false;
    for (let i = 0; i < full.data.length; i += 4) if (full.data[i] === 0 && full.data[i + 3] === 255) hasBlack = true;
    assert.ok(hasBlack);
  });

  await ok('data URL from generator is a PNG of the same code', async () => {
    const du = await renderQrDataUrl(payload);
    assert.ok(du.startsWith('data:image/png;base64,'));
    const img = pngToImage(Buffer.from(du.split(',')[1], 'base64'));
    assert.strictEqual(scan.decodeImageData(img), payload);
  });

  await ok('full-size decode', () => assert.strictEqual(scan.decodeImageData(full), payload));
  for (const size of [300, 200, 160]) {
    await ok(`downscaled to ${size}px inside a 640x480 camera frame`, () =>
      assert.strictEqual(scan.decodeImageData(placeInScene(resize(full, size, size), 640, 480)), payload),
    );
  }
  await ok('inverted colours (dark-mode / smart invert) still decode', () =>
    assert.strictEqual(scan.decodeImageData(placeInScene(invert(resize(full, 240, 240)), 640, 480)), payload),
  );
  await ok('sensor noise ±60', () =>
    assert.strictEqual(scan.decodeImageData(noise(placeInScene(resize(full, 240, 240), 640, 480), 60)), payload),
  );

  console.log('Captioned gate pass (name | date footer) → jsQR + ZXing:');
  const caption = gatePassCaption({
    fullName: 'Ibe Okafor',
    visitorId,
    date: new Date(2026, 9, 21),
    orgName: 'Acme Towers',
    locationName: 'Acme HQ',
  });
  const capPng = renderCaptionedQrPng(payload, caption);
  const cap = pngToImage(capPng);
  const n = require('qrcode').create(payload, { errorCorrectionLevel: 'M' }).modules.size;
  const L = captionedLayout(n);

  await ok('caption text is "Ibe Okafor | 21 Oct 2026" / "Acme Towers - Acme HQ - Ref 3F1C2A9E"', () => {
    assert.strictEqual(caption.title, 'Ibe Okafor | 21 Oct 2026');
    assert.strictEqual(caption.subtitle, 'Acme Towers - Acme HQ - Ref 3F1C2A9E');
  });
  await ok('pass is the QR square + a caption band below it, opaque white canvas', () => {
    assert.strictEqual(cap.width, L.qrSize);
    assert.strictEqual(cap.height, L.qrSize + L.captionHeight);
    for (let i = 3; i < cap.data.length; i += 4) assert.strictEqual(cap.data[i], 255, 'fully opaque');
  });
  await ok('4-module quiet zone is untouched (pure white on all four sides)', () => {
    const q = L.margin * L.scale;
    for (let y = 0; y < L.qrSize; y++)
      for (let x = 0; x < L.qrSize; x++) {
        if (x >= q && x < L.qrSize - q && y >= q && y < L.qrSize - q) continue;
        const i = (y * cap.width + x) * 4;
        assert.ok(cap.data[i] === 255 && cap.data[i + 1] === 255 && cap.data[i + 2] === 255, `quiet zone pixel ${x},${y}`);
      }
  });
  await ok('QR modules are pixel-identical to the plain generator layout (integer module size)', () => {
    const qr = require('qrcode').create(payload, { errorCorrectionLevel: 'M' });
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const x = (c + L.margin) * L.scale + (L.scale >> 1);
        const y = (r + L.margin) * L.scale + (L.scale >> 1);
        const dark = cap.data[(y * cap.width + x) * 4] === 0;
        assert.strictEqual(dark, !!qr.modules.get(r, c), `module ${r},${c}`);
      }
  });
  await ok('caption band actually contains text pixels', () => {
    let dark = 0;
    for (let y = L.qrSize; y < cap.height; y++)
      for (let x = 0; x < cap.width; x++) if (cap.data[(y * cap.width + x) * 4] < 100) dark++;
    assert.ok(dark > 500, `dark caption pixels: ${dark}`);
  });
  await ok('stored data URL is the same captioned pass', () => {
    const du = renderCaptionedQrDataUrl(payload, caption);
    assert.strictEqual(scan.decodeImageData(pngToImage(Buffer.from(du.split(',')[1], 'base64'))), payload);
  });

  const conditions: Array<[string, () => Img, boolean]> = [
    ['full size', () => cap, false],
    ...[300, 240, 200, 160].map((w) => [`downscaled to ${w}px wide in a 640x480 camera frame`, () => placeInScene(resizeW(cap, w), 640, 480), false] as [string, () => Img, boolean]),
    ['inverted colours (dark-mode / smart invert)', () => placeInScene(invert(resizeW(cap, 240)), 640, 480), true],
    ['sensor noise ±60 in a grey 640x480 scene', () => noise(placeInScene(resizeW(cap, 240), 640, 480), 60), false],
    ['sensor noise ±60, pass filling a 240px frame', () => noise(resizeW(cap, 240), 60), false],
  ];
  for (const [label, make, inv] of conditions) {
    await ok(`jsQR · ${label}`, () => assert.strictEqual(scan.decodeImageData(make()), payload));
    // ZXing's HybridBinarizer cannot read *any* QR (plain or captioned) in a flat grey scene with
    // heavy per-pixel noise; for that one synthetic case we assert parity with the plain code.
    if (label.startsWith('sensor noise ±60 in a grey')) continue;
    await ok(`ZXing · ${label}`, () => assert.strictEqual(zxingDecode(make(), inv), payload));
  }
  await ok('ZXing parity: the caption never makes a frame undecodable that the plain code decodes', () => {
    const frames: Array<[(img: Img) => Img, boolean]> = [];
    for (const w of [320, 240, 200, 160, 120]) {
      frames.push([(i) => placeInScene(resizeW(i, w), 640, 480), false]);
      frames.push([(i) => placeInScene(invert(resizeW(i, w)), 640, 480), true]);
      for (const amt of [20, 40, 60]) frames.push([(i) => noise(placeInScene(resizeW(i, w), 640, 480), amt, w + amt), false]);
    }
    let plainOk = 0;
    let capOk = 0;
    for (const [f, inv] of frames) {
      const p = zxingDecode(f(full), inv) === payload;
      const c = zxingDecode(f(cap), inv) === payload;
      if (p) plainOk++;
      if (c) capOk++;
      assert.ok(!p || c, 'captioned pass failed where plain code decoded');
    }
    console.log(`      (ZXing decoded ${capOk}/${frames.length} captioned vs ${plainOk}/${frames.length} plain frames)`);
  });
  await ok('jsQR · "Scan from photo" attempt ladder (same scales/crops as decodeImageFile) on a 1170px-wide screenshot', () => {
    const shot = placeInScene(resizeW(cap, 1000), 1170, 2532); // iPhone screenshot with the pass on screen
    const attempts: Array<[number, number]> = [[1024, 1], [1600, 1], [800, 1], [1200, 0.6], [2400, 1], [600, 1], [1000, 0.4]];
    let got: string | null = null;
    for (const [maxDim, f] of attempts) {
      const c = f < 1 ? crop(shot, f) : shot;
      const sc = Math.min(1, maxDim / Math.max(c.width, c.height));
      got = scan.decodeImageData(resize(c, Math.round(c.width * sc), Math.round(c.height * sc)));
      if (got) break;
    }
    assert.strictEqual(got, payload);
  });
  await ok('very long names are ellipsised and still decode (jsQR + ZXing)', () => {
    const long = pngToImage(
      renderCaptionedQrPng(payload, { title: 'Oluwadamilola Chukwuemeka-Abubakar Adeyemi-Okonkwo | 21 Oct 2026', subtitle: 'A very long organisation name - Marina Annex Tower B - Ref 3F1C2A9E' }),
    );
    assert.strictEqual(scan.decodeImageData(long), payload);
    assert.strictEqual(zxingDecode(long), payload);
  });
  await ok('accented names fold to ASCII; download file name is descriptive', () => {
    assert.strictEqual(captionSafe('Ọlá Àdébáyọ̀'), 'Ola Adebayo');
    assert.strictEqual(qrFileName('Ibe Okafor', new Date(2026, 9, 21)), 'vicit-pass_ibe-okafor_2026-10-21.png');
  });
  await ok('ZXing also decodes the plain (uncaptioned) code', () => assert.strictEqual(zxingDecode(full), payload));

  console.log('Scanned payload → gate parser (backend lookup keys):');
  const cases: Array<[string, any]> = [
    [payload, { passphrase, visitorId, tokenPrefix: token.slice(0, 8) }],
    [`  ${payload}\n`, { passphrase, visitorId }],
    [payload.toUpperCase().replace(visitorId.toUpperCase(), visitorId.toUpperCase()), { passphrase, visitorId }],
    [payload.replace(/"/g, '\u201C'), { passphrase, visitorId }],
    [`https://vicit.example.com/visitor/${token}`, { token }],
    [`https://vicit.example.com/visitor/${token}/`, { token }],
    [`https://vicit.example.com/visitor/${token}?utm=mail#qr`, { token }],
    [`HTTPS://VICIT.EXAMPLE.COM/VISITOR/${token.toUpperCase()}`, { token }],
    [`/visitor/${token}`, { token }],
    [`vicit.example.com/visitor/${token}`, { token }],
    [`https://vicit.example.com/gate?code=${encodeURIComponent(passphrase)}`, { passphrase }],
    [token, { token, visitorId: token }],
    [token.toUpperCase(), { token, visitorId: token }],
    ['foxtrot-charlie-4821', { passphrase }],
    [' Foxtrot Charlie 4821 ', { passphrase }],
    ['FOXTROT_CHARLIE_4821', { passphrase }],
    ['FOXTROT—CHARLIE—4821', { passphrase }],
    ['\uFEFFFOXTROT-CHARLIE-4821\u200B', { passphrase }],
  ];
  for (const [input, expected] of cases) {
    await ok(JSON.stringify(input).slice(0, 70), () => {
      const got = parseGateCode(input);
      for (const k of Object.keys(expected)) assert.strictEqual((got as any)[k], expected[k], `${k} for ${input}`);
    });
  }
  await ok('empty / non-string input yields no keys', () => {
    assert.deepStrictEqual(parseGateCode(''), {});
    assert.deepStrictEqual(parseGateCode(undefined), {});
    assert.deepStrictEqual(parseGateCode('   '), {});
  });

  console.log('End-to-end: decoded camera frame → frontend normalize → backend parser:');
  await ok('scan → lookup keys', () => {
    const raw = scan.decodeImageData(placeInScene(resize(full, 200, 200), 640, 480));
    const cleaned = scan.normalizeScannedCode(raw);
    const keys = parseGateCode(cleaned);
    assert.strictEqual(keys.passphrase, passphrase);
    assert.strictEqual(keys.visitorId, visitorId);
    assert.strictEqual(scan.displayCode(cleaned), passphrase);
  });

  console.log(`\nAll ${passed} checks passed.`);
})().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
