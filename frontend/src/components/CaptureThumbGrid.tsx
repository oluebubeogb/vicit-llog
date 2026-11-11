'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import PhotoGallery, { type GalleryImage } from '@/components/PhotoGallery';

export type CaptureThumb = { preview: string; alt?: string };

/**
 * Particulars / evidence thumbnail strip used at the gate and on New dispatch:
 * square thumbs, remove ×, count badge, tap to preview in the shared gallery.
 */
export default function CaptureThumbGrid({
  photos,
  onRemove,
  emptyHint,
}: {
  photos: CaptureThumb[];
  onRemove?: (index: number) => void;
  emptyHint?: string;
}) {
  const [gallery, setGallery] = useState<number | null>(null);
  if (!photos.length) {
    return emptyHint ? <p className="text-[11px] text-slate-500">{emptyHint}</p> : null;
  }
  const images: GalleryImage[] = photos.map((p, i) => ({ src: p.preview, alt: p.alt || `Capture ${i + 1}` }));
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">Captured photos</p>
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-on-brand">
          {photos.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((item, index) => (
          <div key={`${item.preview}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setGallery(index)}
              className="block w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview} alt={item.alt || `Capture ${index + 1}`} className="aspect-square w-full object-cover" />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove photo ${index + 1}`}
                className="absolute right-1 top-1 rounded-full bg-slate-950/80 p-1.5 text-white shadow"
              >
                <X size={13} />
              </button>
            )}
            {index === 0 && photos.length > 1 && (
              <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {photos.length}
              </span>
            )}
          </div>
        ))}
      </div>
      {gallery != null && (
        <PhotoGallery
          images={images}
          index={gallery}
          onIndex={setGallery}
          onClose={() => setGallery(null)}
        />
      )}
    </>
  );
}
