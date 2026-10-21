'use client';

import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page flex min-h-[80vh] items-center justify-center">
      <div className="surface animate-in w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 text-rose-600 shadow-inner">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
        <p className="mt-1 text-sm text-slate-500">{error?.message || 'Unexpected error'}</p>
        <div className="mt-5 flex gap-2">
          <Link href="/" className="btn-ghost flex-1">
            <Home size={16} /> Home
          </Link>
          <button onClick={() => reset()} className="btn-primary flex-1">
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}
