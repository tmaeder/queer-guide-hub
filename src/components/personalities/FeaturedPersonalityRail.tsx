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
  const resolvedSrc = resolveImageUrl({ imageUrl: p.image_url, optimizedUrl, thumbnailUrl, preferThumb: true });
  const srcSet = optimizedUrl
    ? (buildCfSrcSet(optimizedUrl, [160, 320]) ??
        (thumbnailUrl ? `${thumbnailUrl} 400w, ${optimizedUrl} 1600w` : undefined))
    : undefined;
  return (
    <LocalizedLink
      to={href}
      aria-label={`${p.name}${p.profession ? ', ' + formatProfession(p.profession) : ''}`}
      className="flex-none w-40 block transition-opacity hover:opacity-80 group no-underline"
      style={{ scrollSnapAlign: 'start', color: 'inherit' }}
    >
      <div
        className="featured-avatar relative flex items-center justify-center overflow-hidden mb-2 rounded-full"
        style={{
          width: 160,
          height: 160,
          background:
            'linear-gradient(135deg, hsl(var(--foreground) / 0.25) 0%, hsl(var(--foreground) / 0.15) 100%)',
          border: '2px solid hsl(var(--foreground))',
        }}
      >
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
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
          />
        ) : (
          <span style={{ fontSize: '2rem' }} className="font-bold">
            {getInitials(p.name)}
          </span>
        )}
      </div>
      <p className="text-center truncate font-semibold" style={{ fontSize: '0.9rem' }}>
        {p.name}
      </p>
      {p.profession && (
        <p className="text-xs text-muted-foreground text-center truncate">{formatProfession(p.profession)}</p>
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
      <div className="flex items-center gap-2 mb-4">
        <Star
          size={18}
          className="text-foreground"
          fill="hsl(var(--foreground))"
          aria-hidden="true"
        />
        <h2 className="font-bold text-lg">Featured icons</h2>
      </div>
      <div className="flex gap-6 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-none w-40">
                <div className="bg-muted mb-2 rounded-full" style={{ width: 160, height: 160 }} />
                <div className="h-3 bg-muted mb-1" />
                <div className="h-3 bg-muted w-3/4 mx-auto" />
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
