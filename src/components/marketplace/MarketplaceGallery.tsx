import { useRef, useState } from 'react';
import { useListingImages } from '@/hooks/useListingImages';
import { cn } from '@/lib/utils';

interface MarketplaceGalleryProps {
  listingId: string;
  images: string[] | null | undefined;
  title: string;
}

/**
 * Product gallery: one bordered image plate with a strip of square thumbnails
 * that swap it. R2-optimized URLs via useListingImages.
 *
 * The image sits DIRECTLY in a 3px ink plate. It used to sit in a muted tray
 * with 8px of padding wrapping a second rounded frame — a plate inside a plate,
 * the thing `MarketplaceCard`'s docblock already calls out, and two radii on a
 * page whose radius tokens are all zero.
 *
 * The missing-image state is text in a plate, not a lucide `ImageOff` glyph:
 * this surface carries TransitIcon elsewhere and the two icon sets may not
 * share a surface. There is no TransitIcon for "no photo" and inventing one to
 * label an absence would be the wrong place to spend the vocabulary.
 */
export function MarketplaceGallery({ listingId, images, title }: MarketplaceGalleryProps) {
  const { images: gallery } = useListingImages(listingId, images);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Clamp during render so a shrinking gallery (after the async upgrade)
  // never indexes out of range — no synchronizing effect needed.
  const safeActive = active >= gallery.length ? 0 : active;
  const current = gallery[safeActive];
  const usable = gallery.filter((_, i) => !failed.has(i));

  const NoImage = ({ label }: { label: string }) => (
    <div
      className="flex aspect-square w-full items-center justify-center border-[3px] border-foreground bg-muted"
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true" className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        No photo
      </span>
    </div>
  );

  if (gallery.length === 0 || usable.length === 0) {
    return <NoImage label={`No image for ${title}`} />;
  }

  const showStrip = gallery.length > 1;

  const onThumbKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (safeActive + dir + gallery.length) % gallery.length;
    setActive(next);
    thumbRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      {current && !failed.has(safeActive) ? (
        <div className="overflow-hidden border-[3px] border-foreground bg-muted">
          {/* onError is a standard non-interactive image fallback handler, not a
              mouse/keyboard interaction. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <img
            src={current.full}
            alt={current.alt || title}
            className="aspect-square w-full object-cover md:aspect-[4/5]"
            onError={() => setFailed((prev) => new Set(prev).add(safeActive))}
          />
        </div>
      ) : (
        <NoImage label={`No image for ${title}`} />
      )}

      {showStrip && (
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {gallery.map((img, i) => (
            <button
              key={`${img.thumb}-${i}`}
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              type="button"
              onClick={() => setActive(i)}
              onKeyDown={onThumbKeyDown}
              aria-label={`Show image ${i + 1} of ${gallery.length}`}
              aria-current={i === safeActive}
              className={cn(
                'h-16 w-16 flex-shrink-0 snap-start overflow-hidden bg-muted transition-colors md:h-20 md:w-20',
                // The selected thumb takes the full 3px ink border; the rest sit
                // back at 2px translucent. Same fill-or-lift logic as a station
                // tile, expressed in border weight because a 64px square has no
                // room to lift.
                i === safeActive
                  ? 'border-[3px] border-foreground'
                  : 'border-2 border-foreground/30 hover:border-foreground',
              )}
            >
              {failed.has(i) ? (
                <span
                  aria-hidden="true"
                  className="flex h-full w-full items-center justify-center text-3xs font-bold uppercase text-muted-foreground"
                >
                  —
                </span>
              ) : (
                <img
                  src={img.thumb}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  onError={() => setFailed((prev) => new Set(prev).add(i))}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
