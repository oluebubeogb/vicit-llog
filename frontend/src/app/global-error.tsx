'use client';

/* Rendered outside the root layout, so styles are inline and brand-neutral. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: 'radial-gradient(120% 80% at 100% 0%, #dbeafe 0%, transparent 60%), linear-gradient(180deg, #f8fafc, #eef2ff)',
          color: '#0f172a',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 360,
            width: '100%',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.9)',
            borderRadius: 28,
            padding: 28,
            boxShadow: '0 30px 60px -30px rgba(15,23,42,0.35)',
            border: '1px solid rgba(255,255,255,0.8)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={56} height={56} style={{ borderRadius: 16, marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Application error</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{error?.message || 'Unexpected error'}</p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 20,
              width: '100%',
              padding: '12px 16px',
              border: 0,
              borderRadius: 14,
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8 55%, #1e3a8a)',
              boxShadow: '0 12px 30px -12px rgba(37,99,235,0.6)',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
