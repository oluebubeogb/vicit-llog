'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
          <h2>Application error</h2>
          <p>{error?.message || 'Unexpected error'}</p>
          <button onClick={() => reset()} style={{ marginTop: 12, padding: '8px 16px' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
