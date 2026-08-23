/**
 * Single source of truth for which image to show for a venue, and how to fit it.
 *
 * Venues carry two unrelated image sources:
 *   - `logo_url` — a clean brand mark (fetched from logo.dev).
 *   - `images[]` — scraped/review photos (Foursquare/TripAdvisor) that are often
 *     low quality and unattractive.
 *
 * Product decision (2026-06-23): lead with the logo whenever one exists, and only
 * fall back to a review photo when there is no logo. Logos are square brand marks
 * on transparent/white grounds, so they must render `contain` (letterboxed on a
 * neutral tile) — cropping them with `cover` looks terrible. Photos keep `cover`.
 */
export interface VenueVisual {
  /** Image URL to render, or null to let the surface show its own fallback. */
  src: string | null;
  /** `contain` for logos (don't crop), `cover` for photos. */
  fit: 'cover' | 'contain';
  /** True when `src` is the brand logo (drives contain rendering + no scrim). */
  isLogo: boolean;
  /**
   * Ground to pin a logo tile to, or null for a photo (which brings its own).
   *
   * Not decorative. The default tile is `bg-muted`, a THEME token — light in
   * light mode, near-black in dark — so a dark wordmark is erased in dark mode
   * and a white one in light. Measured across 344 venue logos, 19.5% are
   * invisible in one theme or the other. Pinning the tile to a fixed ground and
   * choosing it from the logo's own measured polarity is what makes a logo
   * survive a theme switch.
   */
  plate: 'paper' | 'ink' | null;
}

export function getVenueVisual(
  venue:
    | { images?: string[] | null; logo_url?: string | null; logo_on_ink?: boolean | null }
    | null
    | undefined,
): VenueVisual {
  if (venue?.logo_url) {
    return {
      src: venue.logo_url,
      fit: 'contain',
      isLogo: true,
      plate: venue.logo_on_ink ? 'ink' : 'paper',
    };
  }
  return { src: venue?.images?.[0] ?? null, fit: 'cover', isLogo: false, plate: null };
}
