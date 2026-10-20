'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
      <p className="text-sm text-slate-500">{error?.message || 'Unexpected error'}</p>
      <button
        onClick={() => reset()}
        className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
