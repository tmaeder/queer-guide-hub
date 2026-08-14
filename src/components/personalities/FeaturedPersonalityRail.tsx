import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Star } from 'lucide-react';
import { useFeaturedPersonalities, type Personality } from '@/hooks/usePersonalities';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { buildCfSrcSet } from '@/utils/cloudflareOptimizations';
import { formatProfession } from '@/lib/professionDisplay';

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Number of carousel items above the fold on every viewport tested. These get
// loading="eager" + fetchpriority="high" so they don't pop in after first paint;
// the rest stay lazy so we don't blow the LCP budget on cards the user may
// never see.
const ABOVE_FOLD_COUNT = 5;

function FeaturedItem({
  p,
  eager,
  optimizedUrl,
  thumbnailUrl,
}: {
  p: Personality;
  eager: boolean;
  optimizedUrl?: string | null;
  thumbnailUrl?: string | null;
}) {
  const href = `/personalities/${p.slug ?? p.id}`;
  const resolvedSrc = resolveImageUrl({
    imageUrl: p.image_url,
    optimizedUrl,
    thumbnailUrl,
    preferThumb: true,
  });
  const srcSet = optimizedUrl
    ? (buildCfSrcSet(optimizedUrl, [160, 320]) ??
      (thumbnailUrl ? `${thumbnailUrl} 400w, ${optimizedUrl} 1600w` : undefined))
    : undefined;
  return (
    <LocalizedLink
      to={href}
      aria-label={`${p.name}${p.profession ? ', ' + formatProfession(p.profession) : ''}`}
      className="group block w-40 flex-none text-inherit no-underline"
      style={{ scrollSnapAlign: 'start' }}
    >
      {/* A station ring at portrait scale — `rounded-full` is sanctioned for
          avatars, and the 3px ink ring is the same one StationRing draws. */}
      <div className="featured-avatar relative mb-2 flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-[3px] border-foreground bg-muted transition-colors group-hover:bg-surface-container">
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            srcSet={srcSet}
            sizes="160px"
            alt={p.name}
            loading={eager ? 'eager' : 'lazy'}
            // fetchpriority is widely supported but not in React's typings yet
            // — pass via a typed cast inline.
            {...(eager ? ({ fetchpriority: 'high' } as { fetchpriority: 'high' }) : {})}
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <span className="font-display text-headline text-muted-foreground">
            {getInitials(p.name)}
          </span>
        )}
      </div>
      <p className="truncate text-center text-title font-bold leading-tight">{p.name}</p>
      {p.profession && (
        <p className="truncate text-center text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {formatProfession(p.profession)}
        </p>
      )}
    </LocalizedLink>
  );
}

export function FeaturedPersonalityRail() {
  const { featured, loading, error } = useFeaturedPersonalities(10);
  const featuredIds = featured.map((p) => p.id);
  const { assets: imageAssets } = useEntityImageAssets('personality', featuredIds);

  if (error) return null;
  if (!loading && featured.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Same rank as the other editorial section labels on this page, so the
          card names below (text-title) stay a clear level down from it. */}
      <h2 className="mb-4 flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
        <Star size={14} fill="currentColor" aria-hidden="true" />
        Featured icons
      </h2>
      <div className="flex gap-6 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-40 flex-none">
                <div className="mb-2 h-40 w-40 animate-pulse rounded-full border-[3px] border-foreground bg-muted" />
                <div className="mb-1 h-4 animate-pulse bg-muted" />
                <div className="mx-auto h-4 w-3/4 animate-pulse bg-muted" />
              </div>
            ))
          : featured.map((p, i) => {
              const asset = imageAssets.get(p.id);
              return (
                <FeaturedItem
                  key={p.id}
                  p={p}
                  eager={i < ABOVE_FOLD_COUNT}
                  optimizedUrl={asset?.optimized_url}
                  thumbnailUrl={asset?.thumbnail_url}
                />
              );
            })}
      </div>
    </div>
  );
}
