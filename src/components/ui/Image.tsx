import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { buildCfSrcSet } from '@/utils/cloudflareOptimizations';
import { imageReferrerPolicy } from '@/utils/imageHost';
import { getFallbackImage, type FallbackTheme } from '@/utils/fallbackImages';

/**
 * Single image primitive for every card and hero on the site.
 *
 * Replaces ~30 hand-rolled `<img>` blocks. It wires the existing image utilities
 * so every surface gets the same treatment for free:
 *   - source resolution (R2 optimized → thumbnail → original) via resolveImageUrl
 *   - responsive Cloudflare srcset for img.queer.guide assets via buildCfSrcSet,
 *     with a two-stop thumb/optimized fallback for external hosts
 *   - host-aware referrerPolicy, lazy/eager + fetchpriority by `priority`
 *   - a fade-in on load with an 8s stall guard
 *   - a deterministic, on-brand fallback (stable per entity — no reload reshuffle)
 *
 * Cohesion comes from a small fixed set of aspect ratios and a 3-tier scrim —
 * NOT from desaturation. Images render in full color.
 *
 * The hover zoom assumes a `group` ancestor (the card root); it's a no-op
 * otherwise.
 */

export type ImageRole = 'cover' | 'hero' | 'thumb' | 'avatar';
export type AspectToken = 'card' | 'hero' | 'portrait' | 'thumb' | 'square' | 'auto';
export type ScrimVariant = 'none' | 'readable' | 'strong';
type RoundedToken = 'container' | 'element' | 'top' | 'none';

interface ImageProps {
  // ── Source (pick one path) ──────────────────────────────────────────
  /** Pre-resolved URL escape hatch. Takes precedence over the *Url props. */
  src?: string | null;
  imageUrl?: string | null;
  optimizedUrl?: string | null;
  thumbnailUrl?: string | null;
  preferThumb?: boolean;

  // ── Deterministic fallback ──────────────────────────────────────────
  fallbackEntityType?: FallbackTheme;
  /** Stable entity id/slug — same key always yields the same fallback. */
  fallbackKey?: string;
  /** When set, a missing image renders an icon tile instead of a photo. */
  fallbackIcon?: LucideIcon;

  // ── Layout / treatment ──────────────────────────────────────────────
  alt: string;
  aspect?: AspectToken;
  /**
   * Object-fit of the rendered image. `cover` (default) crops to fill — right for
   * photos. `contain` letterboxes on the neutral tile with padding and no hover
   * zoom — right for brand logos, which must not be cropped. The texture fallback
   * and icon tile always stay `cover` regardless.
   */
  fit?: 'cover' | 'contain';
  /** Fixed pixel height escape hatch; overrides `aspect` when set. */
  heightPx?: number;
  /** Named `imageRole` (not `role`) to avoid the ARIA `role` attribute. */
  imageRole?: ImageRole;
  objectPosition?: string;
  scrim?: ScrimVariant;
  priority?: boolean;
  rounded?: RoundedToken;

  // ── Responsive overrides ────────────────────────────────────────────
  sizes?: string;
  widths?: number[];

  className?: string;
  /** Overlay slot (badges, favorite button, gradient text). */
  children?: React.ReactNode;
}

const ASPECT_CLASS: Record<AspectToken, string> = {
  card: 'aspect-[16/10]',
  hero: 'aspect-[21/9]',
  portrait: 'aspect-[3/4]',
  thumb: 'aspect-square',
  square: 'aspect-square',
  auto: '',
};

const ROUNDED_CLASS: Record<RoundedToken, string> = {
  container: 'rounded-container',
  element: 'rounded-element',
  top: 'rounded-t-container',
  none: '',
};

const SCRIM_CLASS: Record<ScrimVariant, string | null> = {
  none: null,
  readable: 'img-scrim-readable',
  strong: 'img-scrim-strong',
};

const DEFAULT_WIDTHS: Record<ImageRole, number[]> = {
  cover: [400, 800, 1200],
  hero: [800, 1280, 1920],
  thumb: [200, 400],
  avatar: [200, 400],
};

const DEFAULT_SIZES: Record<ImageRole, string> = {
  cover: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 500px',
  hero: '100vw',
  thumb: '(max-width: 640px) 160px, 250px',
  avatar: '(max-width: 640px) 160px, 250px',
};

export const Image = ({
  src,
  imageUrl,
  optimizedUrl,
  thumbnailUrl,
  preferThumb,
  fallbackEntityType = 'default',
  fallbackKey,
  fallbackIcon: FallbackIcon,
  alt,
  aspect = 'card',
  fit = 'cover',
  heightPx,
  imageRole = 'cover',
  objectPosition,
  scrim = 'none',
  priority = false,
  rounded = 'top',
  sizes,
  widths,
  className,
  children,
}: ImageProps) => {
  const resolved = src ?? resolveImageUrl({ imageUrl, optimizedUrl, thumbnailUrl, preferThumb });

  const [error, setError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  // Read in the stall-timer without re-arming it; the effect closure captures
  // `loaded === false` at creation, so a state read there is always stale.
  const loadedRef = React.useRef(false);

  // Reset on src change, and guard against Pexels-style 200-then-stall URLs
  // that never fire onLoad/onError (8s → treat as failed). Only armed for
  // priority (above-fold) images — lazy grid images legitimately stay unloaded
  // while off-screen and must not be force-failed.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing state with external src prop
    setError(false);
    setLoaded(false);
    loadedRef.current = false;
    if (!resolved || !priority) return;
    const timer = setTimeout(() => setError((prev) => prev || !loadedRef.current), 8000);
    return () => clearTimeout(timer);
  }, [resolved, priority]);

  const fallback = React.useMemo(
    () => getFallbackImage(fallbackEntityType, fallbackKey),
    [fallbackEntityType, fallbackKey],
  );

  const showingFallback = !resolved || error;
  const showIconTile = showingFallback && !!FallbackIcon;
  const effectiveSrc = showIconTile ? null : (showingFallback ? fallback : resolved);
  // Logos render contained; the texture fallback and icon tile always cover.
  const useContain = fit === 'contain' && !showingFallback && !showIconTile;

  const widthSet = widths ?? DEFAULT_WIDTHS[imageRole];
  // Build the responsive srcset from the LARGEST on-CDN source, not `effectiveSrc`
  // — `preferThumb` collapses `effectiveSrc` to the 400px thumbnail, and CF would
  // then upscale that to 800/1200w (blurry). The thumb stays as the fast LQIP base.
  const cfBase = showingFallback ? effectiveSrc : (optimizedUrl ?? src ?? imageUrl ?? effectiveSrc);
  const cfSrcSet = cfBase ? buildCfSrcSet(cfBase, widthSet) : undefined;
  // External hosts can't use CF resizing; fall back to a two-stop set when we
  // have both a small and a large URL for the same asset.
  const externalSrcSet =
    !cfSrcSet && optimizedUrl && thumbnailUrl
      ? `${thumbnailUrl} 400w, ${optimizedUrl} 1600w`
      : undefined;
  const srcSet = cfSrcSet ?? externalSrcSet;
  const referrerPolicy = effectiveSrc ? imageReferrerPolicy(effectiveSrc) : undefined;

  // Person/portrait photos are framed head-and-shoulders; center-cropping crops
  // the head. Default them to top so faces survive `object-cover`. Landscape
  // venue/event/city photos keep center (heads aren't the subject there).
  const effectiveObjectPosition =
    objectPosition ??
    (aspect === 'portrait' || fallbackEntityType === 'person' ? 'top' : undefined);

  const scrimClass = SCRIM_CLASS[scrim];

  return (
    <div
      className={cn('relative overflow-hidden bg-muted', heightPx == null && ASPECT_CLASS[aspect], ROUNDED_CLASS[rounded])}
      style={heightPx != null ? { height: heightPx } : undefined}
    >
      {showIconTile ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {FallbackIcon ? <FallbackIcon className="h-10 w-10" aria-hidden /> : null}
        </div>
      ) : (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener.
        <img
          src={effectiveSrc ?? undefined}
          srcSet={srcSet}
          sizes={srcSet ? (sizes ?? DEFAULT_SIZES[imageRole]) : undefined}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          referrerPolicy={referrerPolicy}
          onLoad={() => { loadedRef.current = true; setLoaded(true); }}
          onError={() => { if (!error) setError(true); }}
          style={effectiveObjectPosition ? { objectPosition: effectiveObjectPosition } : undefined}
          className={cn(
            'img-lazy-fade h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
            useContain ? 'object-contain p-4' : 'object-cover group-hover:scale-[1.04]',
            loaded && 'loaded',
            className,
          )}
        />
      )}
      {scrimClass ? <div className={cn('pointer-events-none absolute inset-0', scrimClass)} aria-hidden /> : null}
      {children}
    </div>
  );
};
Image.displayName = 'Image';
