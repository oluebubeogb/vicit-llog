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
