import { cn } from '@/lib/utils';
import { brandMonogram } from './marketplaceHelpers';

/**
 * A maker's mark: its logo when we hold one, its monogram when we do not.
 *
 * Both states are the SAME plate — a bordered square on card ground — because
 * brand logos arrive at wildly different aspect ratios and on assorted
 * backgrounds, and the plate is the only thing that makes a row of them scan as
 * one grid. Most of the catalogue has no logo (a brand that sells only through
 * third-party shops has no domain we can defensibly resolve), so the two states
 * sit side by side in every grid and must not read as two different components.
 *
 * The monogram is rendered ALWAYS and the logo layered over it, rather than
 * branching. That makes a dead logo URL — a purged R2 object, a mirror that
 * 404s later — degrade to the monogram instead of a broken-image glyph, with no
 * error handler and no state. It is also why this is not `<Image>`: that
 * primitive's failure mode is a decorative photo texture, which in a 56px logo
 * plate reads as a corrupted logo rather than as an absent one.
 *
 * `object-contain` is not optional. A logo is a fixed composition; cropping it
 * to fill the square (the `<img>` default is fine, but `object-cover` is what
 * the site's photo primitive would apply) mutilates the brand.
 */
export function BrandMark({
  name,
  logoUrl,
  onInk = false,
  className,
  monogramClassName,
  padding = 'p-1.5',
}: {
  name: string;
  logoUrl?: string | null;
  /**
   * This logo has no dark pixels and would be invisible on the paper plate —
   * measured from the mirrored bytes, never guessed. See the `logo_on_ink`
   * column. Seven of the catalogue's eighty marks are white-on-transparent.
   */
  onInk?: boolean;
  /** Plate size and radius — the caller owns both. */
  className?: string;
  /** Type rank for the monogram; differs by plate size. */
  monogramClassName?: string;
  padding?: string;
}) {
  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden shadow-soft',
        // The paper ground belongs to the PLATE, not to the <img>: a background
        // on the image itself still paints when the image 404s, which would
        // leave a blank square and defeat the layering above. On the plate, a
        // dead logo falls back to an ink monogram on paper.
        logoUrl
          ? onInk
            ? 'bg-foreground text-background'
            : 'bg-logo-plate text-track-ring'
          : 'bg-card',
        className,
      )}
    >
      <span
        aria-hidden="true"
        // Hidden, not absent, while a logo is expected: nearly every merchant
        // logo is a transparent PNG, so a monogram left visible underneath
        // shows THROUGH the artwork (found on prod — cherrykitten's pink
        // wordmark had an ink "C" sitting inside its counters). `invisible`
        // keeps it in the layout so the onError below can bring it back with
        // an inline style, which beats the class.
        className={cn('leading-none', logoUrl && 'invisible', monogramClassName)}
      >
        {brandMonogram(name)}
      </span>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          // Chrome paints its torn-page glyph for a failed image even with an
          // empty alt, so the monogram underneath is not on its own enough —
          // verified against a logo the CDN refused. Hiding the element is what
          // actually uncovers the fallback, and doing it on the node keeps this
          // component stateless.
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const monogram = e.currentTarget.previousElementSibling;
            if (monogram instanceof HTMLElement) monogram.style.visibility = 'visible';
          }}
          className={cn('absolute inset-0 h-full w-full object-contain', padding)}
        />
      )}
    </div>
  );
}
