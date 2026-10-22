import clsx from 'clsx';

/**
 * The one shared line-art layer (same artwork as .hero / .surface / .card backgrounds).
 * Fills its positioned parent edge to edge — every line starts and ends beyond the card
 * bounds — and stays very faint so it never competes with text. Colour = currentColor.
 */
export default function LineArt({ className, opacity = 0.085 }: { className?: string; opacity?: number }) {
  return <span aria-hidden className={clsx('line-art', className)} style={{ opacity }} />;
}
