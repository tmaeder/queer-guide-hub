import { memo, useEffect, useRef, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { RouteBullet } from '@/components/transit/RouteBullet';
import type { Personality } from '@/hooks/usePersonalities';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { buildCfSrcSet } from '@/utils/cloudflareOptimizations';
import { formatProfession } from '@/lib/professionDisplay';

const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 120;

interface PersonalityCardProps {
  personality?: Personality;
  loading?: boolean;
  onClick?: () => void;
  optimizedUrl?: string | null;
  thumbnailUrl?: string | null;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatEra(p: Personality): string | null {
  if (p.is_living) return 'Living';
  const birthYear = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
  const deathYear = p.death_date ? new Date(p.death_date).getFullYear() : null;
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  if (deathYear) return `d. ${deathYear}`;
  return 'Historical';
}

export function PersonalityCardSkeleton() {
  return (
    // Matches the card's own frame — this was `bg-background` against a
    // `bg-surface-container` card, so the grid visibly changed colour as it
    // loaded.
    <div className="flex h-full flex-col border-[3px] border-foreground bg-background">
      <div className="relative aspect-[3/4] w-full border-b-[3px] border-foreground bg-muted">
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      </div>
      <div className="p-4">
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mb-2 h-4 w-[55%]" />
        <Skeleton className="h-4 w-[65%]" />
      </div>
    </div>
  );
}

function PersonalityCardImpl({
  personality,
  loading,
  onClick,
  optimizedUrl,
  thumbnailUrl,
}: PersonalityCardProps) {
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (loading || !personality) {
    return <PersonalityCardSkeleton />;
  }

  const era = formatEra(personality);
  // Grid cards are small — prefer the 400px thumbnail as src; only fall back
  // to full optimized_url when no thumbnail exists.
  const resolvedImageUrl = resolveImageUrl({
    imageUrl: personality.image_url,
    optimizedUrl,
    thumbnailUrl,
    preferThumb: true,
  });
  // Multi-stop srcset via CF Image Resizing when the asset is on img.queer.guide;
  // fall back to two-stop thumb/original pair for external images.
  const srcSet = optimizedUrl
    ? (buildCfSrcSet(optimizedUrl, [400, 800, 1200]) ??
      (thumbnailUrl ? `${thumbnailUrl} 400w, ${optimizedUrl} 1600w` : undefined))
    : undefined;
  const showImage = Boolean(resolvedImageUrl) && !imgError;
  const metaParts = [era, personality.nationality].filter(Boolean) as string[];
  const ariaLabel = personality.profession
    ? `${personality.name}, ${formatProfession(personality.profession)}`
    : personality.name;
  const href = `/personalities/${personality.slug ?? personality.id}`;

  const scheduleOpen = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (previewOpen) return;
    openTimerRef.current = window.setTimeout(() => setPreviewOpen(true), HOVER_OPEN_MS);
  };
  const scheduleClose = () => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    closeTimerRef.current = window.setTimeout(() => setPreviewOpen(false), HOVER_CLOSE_MS);
  };

  const previewText = personality.description || personality.bio;
  // Mouse-only preview: pointer:fine excludes touch, where the long-press
  // alternative would interfere with native link tap. Touch users still get
  // the inline snippet on the card body.
  const isFinePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const card = (
    <LocalizedLink
      to={href}
      onClick={onClick}
      onMouseEnter={isFinePointer ? scheduleOpen : undefined}
      onMouseLeave={isFinePointer ? scheduleClose : undefined}
      onFocus={isFinePointer ? scheduleOpen : undefined}
      onBlur={isFinePointer ? scheduleClose : undefined}
      aria-label={ariaLabel}
      /* The lift and the border live on the LINK itself. `CardHoverEffect`'s
         group/overlay contract exists for cards whose click target is a
         sibling overlay — this card has no nested interactive elements, so the
         whole anchor is the target and a nested lift wrapper only meant the
         border sat on one element while a different one moved. */
      className="personality-card card-lift group flex h-full cursor-pointer touch-manipulation flex-col border-[3px] border-foreground bg-background text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Portrait. `aspect-[3/4]` replaces a `paddingTop: 133.33%` box and an
          inline foreground-alpha gradient — both pre-rebrand idioms. */}
      <div className="relative aspect-[3/4] w-full overflow-hidden border-b-[3px] border-foreground bg-muted">
        {showImage ? (
          <img
            src={resolvedImageUrl!}
            srcSet={srcSet}
            sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 250px"
            alt={personality.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="personality-card-image absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-headline text-muted-foreground">
              {getInitials(personality.name)}
            </span>
          </div>
        )}

        {/* The station marker. Makes a person legible as a P-line stop
            wherever this card travels — tag pages, profession pages, search. */}
        <RouteBullet
          type="personality"
          size={26}
          className="pointer-events-none absolute left-2 top-2"
        />

        {personality.is_featured && (
          <div className="pointer-events-none absolute right-2 top-2 flex select-none items-center gap-1 bg-foreground px-2 py-1 text-2xs font-bold text-background">
            <Star size={10} fill="currentColor" color="currentColor" aria-hidden="true" />
            <span>Featured</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-grow p-4">
        <h3 className="truncate text-title font-bold leading-tight text-foreground">
          {personality.name}
        </h3>
        {personality.profession && (
          <p className="mt-1 truncate text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {formatProfession(personality.profession)}
          </p>
        )}
        {metaParts.length > 0 && (
          <p className="mt-1 truncate text-13 tabular-nums text-muted-foreground">
            {metaParts.join(' · ')}
          </p>
        )}
        {(personality.description || personality.bio) && (
          <p className="mt-1.5 line-clamp-2 text-13 leading-snug text-muted-foreground">
            {personality.description || personality.bio}
          </p>
        )}
      </div>
    </LocalizedLink>
  );

  if (!isFinePointer) return card;

  return (
    <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
      <PopoverAnchor asChild>{card}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-72 overflow-hidden border-[3px] border-foreground p-0"
        onMouseEnter={() => {
          if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {showImage ? (
          <img
            src={resolvedImageUrl!}
            srcSet={srcSet}
            sizes="288px"
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-40 w-full border-b-[3px] border-foreground bg-muted object-cover object-top"
          />
        ) : (
          <div className="flex h-24 w-full items-center justify-center border-b-[3px] border-foreground bg-muted font-display text-headline text-muted-foreground">
            {getInitials(personality.name)}
          </div>
        )}
        <div className="space-y-1.5 p-4">
          <div className="text-title font-bold leading-snug">{personality.name}</div>
          {personality.profession && (
            <div className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {formatProfession(personality.profession)}
            </div>
          )}
          {metaParts.length > 0 && (
            <div className="text-13 tabular-nums text-muted-foreground">
              {metaParts.join(' · ')}
            </div>
          )}
          {previewText && (
            <p className="line-clamp-5 pt-1 text-13 leading-snug text-muted-foreground">
              {previewText}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Memoized: rendered in personality grids — skip re-render when props are
// referentially stable.
export const PersonalityCard = memo(PersonalityCardImpl);
