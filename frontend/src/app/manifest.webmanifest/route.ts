import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Dynamic PWA manifest: app name, theme colour and splash background come from
 * Branding & Settings, so installed home-screen apps follow the organisation brand.
 */
export async function GET() {
  const api = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  let b: any = {};
  try {
    const res = await fetch(`${api}/branding/public`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (res.ok) b = await res.json();
  } catch {
    /* fall back to defaults */
  }
  const name = b.name || process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog';
  const theme = b.primaryColor || '#2563eb';
  const bg = b.secondaryColor || '#1e40af';
  const manifest = {
    id: '/',
    name,
    short_name: name.length > 12 ? name.split(/\s+/)[0].slice(0, 12) : name,
    description: `${name} · Visitor Access & Exit Control`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: bg,
    theme_color: theme,
    categories: ['business', 'productivity', 'security'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Scan at gate', url: '/gate', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'New invite', url: '/invite/new', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
