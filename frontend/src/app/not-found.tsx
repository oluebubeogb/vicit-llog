import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="page flex min-h-[80vh] items-center justify-center">
      <div className="surface animate-in w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 text-brand-600 shadow-inner">
          <Compass size={28} />
        </div>
        <p className="eyebrow">404</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">Page not found</h2>
        <p className="mt-1 text-sm text-slate-500">The page you’re looking for has moved or no longer exists.</p>
        <Link href="/" className="btn-primary mt-5 w-full">
          <Home size={16} /> Back home
        </Link>
      </div>
    </div>
  );
}
