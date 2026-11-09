'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type GalleryImage = { src: string; alt?: string };

/** Full-screen photo gallery: chevrons, keyboard arrows, swipe, Esc / X to close. */
export default function PhotoGallery({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: GalleryImage[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const startX = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const safe = images.length ? ((index % images.length) + images.length) % images.length : 0;
  const photo = images[safe];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((safe + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((safe - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [images.length, onClose, onIndex, safe]);

  if (!photo) return null;

  const go = (dir: number) => onIndex((safe + dir + images.length) % images.length);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/92 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      onClick={onClose}
    >
      <button type="button" onClick={onClose} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25" aria-label="Close">
        <X size={22} />
      </button>
      {images.length > 1 && (
        <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 sm:left-6">
          <ChevronLeft size={26} />
        </button>
      )}
      <figure className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={photo.alt || 'Captured photo'}
          className="max-h-[78vh] max-w-[92vw] select-none rounded-2xl object-contain shadow-2xl"
          style={{ transform: `translateX(${drag}px)` }}
          draggable={false}
          onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
          onTouchMove={(e) => { if (startX.current != null) setDrag(e.touches[0].clientX - startX.current); }}
          onTouchEnd={() => {
            if (drag > 50) go(-1);
            else if (drag < -50) go(1);
            setDrag(0);
            startX.current = null;
          }}
        />
        <figcaption className="mt-3 text-center text-sm text-white/80">
          {photo.alt || 'Photo'}
          {images.length > 1 && <span className="ml-2 text-white/50">{safe + 1} / {images.length}</span>}
        </figcaption>
      </figure>
      {images.length > 1 && (
        <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 sm:right-6">
          <ChevronRight size={26} />
        </button>
      )}
    </div>
  );
}
