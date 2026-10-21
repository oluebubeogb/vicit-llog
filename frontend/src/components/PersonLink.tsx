'use client';

import Link from 'next/link';

/** Clickable person name → public profile (/u/[uuid]) */
export default function PersonLink({
  id,
  name,
  className = '',
}: {
  id?: string | null;
  name?: string | null;
  className?: string;
}) {
  if (!name) return <span className={className}>—</span>;
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link
      href={`/u/${id}`}
      className={`text-brand-600 underline-offset-2 hover:underline ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {name}
    </Link>
  );
}
