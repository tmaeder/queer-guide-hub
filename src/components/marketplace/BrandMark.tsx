import { useCallback, useState } from 'react';
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
 * branching. It stays VISIBLE until the logo has actually loaded, and only
 * then hides: an empty plate while a lazy logo is still on its way read as a
 * broken mark (Blush and Vedo on /marketplace/brands, both perfectly good
 * opaque PNGs that simply had not arrived yet). A dead logo URL — a purged R2
 * object, a mirror that 404s later — never loads, so the plate keeps reading
 * as a monogram instead of a broken-image glyph. It is also why this is not
 * `<Image>`: that
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
  // Keyed on the URL so a recycled plate (a list re-sorting under the same
  // component instance) starts from the monogram again rather than inheriting
  // the previous logo's state.
  const [state, setState] = useState<{ url: string; status: 'loaded' | 'failed' } | null>(null);
  const status = logoUrl && state?.url === logoUrl ? state.status : 'loading';
  const showLogo = !!logoUrl && status !== 'failed';
  const markLoaded = useCallback(() => {
    if (logoUrl) setState({ url: logoUrl, status: 'loaded' });
  }, [logoUrl]);
  // A cached image can already be complete when the node mounts; reading it
  // here means the plate never waits on a load event that has already fired.
  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalWidth > 0) markLoaded();
    },
    [markLoaded],
  );

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
            ? // NOT `bg-foreground`: that token flips with the theme, so in dark
              // mode the "ink plate" renders PAPER and the white mark it exists
              // to rescue disappears again. Both plates are mode-independent
              // literals because polarity belongs to the artwork.
              'bg-logo-plate-ink text-logo-plate'
            : 'bg-logo-plate text-track-ring'
          : 'bg-card',
        className,
      )}
    >
      <span
        aria-hidden="true"
        // Hidden only once the logo has LOADED: nearly every merchant logo is
        // a transparent PNG, so a monogram left visible underneath shows
        // THROUGH the artwork (found on prod — cherrykitten's pink wordmark
        // had an ink "C" sitting inside its counters). `invisible` keeps it in
        // the layout so the plate does not change size when it hides.
        className={cn('leading-none', status === 'loaded' && 'invisible', monogramClassName)}
      >
        {brandMonogram(name)}
      </span>
      {showLogo && (
        <img
          ref={imgRef}
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={markLoaded}
          // Chrome paints its torn-page glyph for a failed image even with an
          // empty alt, so the monogram underneath is not on its own enough —
          // verified against a logo the CDN refused. A failed logo is removed.
          onError={() => setState({ url: logoUrl, status: 'failed' })}
          className={cn('absolute inset-0 h-full w-full object-contain', padding)}
        />
      )}
    </div>
  );
}
