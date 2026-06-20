import { useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useListingImages } from '@/hooks/useListingImages';
import { cn } from '@/lib/utils';

interface MarketplaceGalleryProps {
  listingId: string;
  images: string[] | null | undefined;
  title: string;
}

/**
 * Image-forward product gallery: a large object-cover main image with a
 * horizontal thumbnail strip that swaps it. Monochrome, no decorative
 * motion. R2-optimized URLs via useListingImages.
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

  if (gallery.length === 0 || usable.length === 0) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-container bg-muted text-muted-foreground"
        role="img"
        aria-label={`No image for ${title}`}
      >
        <ImageOff size={48} aria-hidden="true" />
      </div>
    );
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
      <div className="overflow-hidden rounded-container bg-muted">
        {current && !failed.has(safeActive) ? (
          <img
            src={current.full}
            alt={current.alt || title}
            className="aspect-square w-full object-cover md:aspect-[4/5]"
            onError={() => setFailed((prev) => new Set(prev).add(safeActive))}
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-muted-foreground md:aspect-[4/5]">
            <ImageOff size={48} aria-hidden="true" />
          </div>
        )}
      </div>

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
                'h-16 w-16 flex-shrink-0 snap-start overflow-hidden rounded-element border bg-muted transition-colors md:h-20 md:w-20',
                i === safeActive ? 'border-foreground' : 'border-border hover:border-foreground/40',
              )}
            >
              {failed.has(i) ? (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff size={16} aria-hidden="true" />
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
