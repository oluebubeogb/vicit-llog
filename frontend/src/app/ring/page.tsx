'use client';

/** Opened from a ring push. The global overlay reads ?call= and shows answer / call. */
export default function RingPage() {
  return (
    <div className="page">
      <div className="surface p-6 text-center">
        <p className="text-sm font-semibold text-slate-800">Ring</p>
        <p className="mt-1 text-xs text-slate-500">Answer, decline, or call.</p>
      </div>
    </div>
  );
}
