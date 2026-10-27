import { NextResponse } from 'next/server';
import { readFirebaseEnv } from '@/lib/firebaseEnv';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Public Firebase web config + VAPID public key from runtime env (never the service account). */
export async function GET() {
  return NextResponse.json(readFirebaseEnv(), {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
