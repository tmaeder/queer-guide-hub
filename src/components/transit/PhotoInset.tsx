import { Image } from '@/components/ui/Image';
import type { FallbackTheme } from '@/utils/fallbackImages';
import { cn } from '@/lib/utils';

/**
 * The destination photograph, demoted from hero to module.
 *
 * The subway singles are typographic — `/tags`, `/marketplace`, `/trips` and
 * both 404 surfaces all lead with Anton on paper and no image. Geo pages are
 * the one type where a photograph carries real information (a reader deciding
 * where to travel), so it stays, but as a bordered inset inside the body
 * rather than a 58vh bed with the title lying on top of it. That kills three
 * problems at once: text-over-image contrast, the 6% of cities with no usable
 * photo rendering a placeholder as their headline, and a photo competing for
 * the eye with the safety verdict.
 *
 * Frame mirrors `MapInset` (3px outer rule, 2px around the content) so the two
 * media modules read as one family.
 *
 * Lives in `transit/` rather than `geo/`: it started on the geo singles but the
 * venue and event singles need the identical frame, and a second copy of a
 * media module is how two singles start looking like two products.
 */
export function PhotoInset({
  src,
  alt,
  caption,
  fallbackKey,
  fallbackEntityType = 'place',
  priority = false,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  caption?: string | null;
  /** Stable slug/id — the deterministic fallback texture keys off it. */
  fallbackKey?: string;
  /** Which texture family a missing image falls back to. */
  fallbackEntityType?: FallbackTheme;
  priority?: boolean;
  className?: string;
}) {
  // Rule 2: no data, no module. A geo page without a photograph is a shorter
  // page, not a page with an empty frame in it.
  if (!src) return null;

  return (
    <figure className={cn('m-0 border-[3px] border-foreground p-4', className)}>
      <div className="border-2 border-foreground">
        <Image
          src={src}
          alt={alt}
          aspect="hero"
          imageRole="hero"
          rounded="none"
          fallbackEntityType={fallbackEntityType}
          fallbackKey={fallbackKey}
          priority={priority}
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-13 leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
