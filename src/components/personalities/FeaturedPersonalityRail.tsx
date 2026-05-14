import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Star } from 'lucide-react';
import { useFeaturedPersonalities, type Personality } from '@/hooks/usePersonalities';

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

function FeaturedItem({ p, eager }: { p: Personality; eager: boolean }) {
  const href = `/personalities/${p.slug ?? p.id}`;
  return (
    <LocalizedLink
      to={href}
      aria-label={`${p.name}${p.profession ? ', ' + p.profession : ''}`}
      className="flex-none w-40 block transition-transform hover:-translate-y-0.5 group"
      style={{ scrollSnapAlign: 'start', textDecoration: 'none', color: 'inherit' }}
    >
      <div
        className="featured-avatar relative flex items-center justify-center overflow-hidden mb-2 transition-shadow group-hover:shadow-lg"
        style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, hsl(var(--foreground) / 0.25) 0%, hsl(var(--foreground) / 0.15) 100%)',
          border: '2px solid hsl(var(--foreground))',
        }}
      >
        {p.image_url ? (
          <img
            src={p.image_url}
            alt={p.name}
            loading={eager ? 'eager' : 'lazy'}
            // fetchpriority is widely supported but not in React's typings yet
            // — pass via a typed cast inline.
            {...(eager ? ({ fetchpriority: 'high' } as { fetchpriority: 'high' }) : {})}
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              fontWeight: 700,
              fontSize: '2rem',
            }}
          >
            {getInitials(p.name)}
          </span>
        )}
      </div>
      <p
        className="text-center truncate"
        style={{
          fontWeight: 600,
          fontSize: '0.9rem',
        }}
      >
        {p.name}
      </p>
      {p.profession && (
        <p className="text-xs text-muted-foreground text-center truncate">
          {p.profession}
        </p>
      )}
    </LocalizedLink>
  );
}

export function FeaturedPersonalityRail() {
  const { featured, loading, error } = useFeaturedPersonalities(10);

  if (error) return null;
  if (!loading && featured.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Star size={18} style={{ color: 'hsl(var(--foreground))' }} fill="hsl(var(--foreground))" aria-hidden="true" />
        <h2
          style={{
            fontWeight: 700,
            fontSize: '1.125rem',
          }}
        >
          Featured icons
        </h2>
      </div>
      <div
        className="flex gap-5 overflow-x-auto pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-none w-40">
                <div className="bg-muted mb-2" style={{ width: 160, height: 160, borderRadius: '50%' }} />
                <div className="h-3 bg-muted mb-1" />
                <div className="h-3 bg-muted w-3/4 mx-auto" />
              </div>
            ))
          : featured.map((p, i) => (
              <FeaturedItem key={p.id} p={p} eager={i < ABOVE_FOLD_COUNT} />
            ))}
      </div>
    </div>
  );
}
