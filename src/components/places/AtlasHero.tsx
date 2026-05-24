import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useEditorialCover } from '@/hooks/useEditorialCover';
import { useOptimizedCountries } from '@/hooks/usePlaces';

interface Props {
  /** Names of editorially featured countries (used for fallback when no cover is published). */
  featuredCountryNames: Set<string>;
}

const HREF: Record<'country' | 'city' | 'village', (slug: string) => string> = {
  country: (s) => `/country/${s}`,
  city: (s) => `/city/${s}`,
  village: (s) => `/village/${s}`,
};

export function AtlasHero({ featuredCountryNames }: Props) {
  const { data: cover } = useEditorialCover();
  const { countries } = useOptimizedCountries();

  const fallback = useMemo(() => {
    if (cover) return null;
    const featured = (countries ?? []).filter((c) =>
      featuredCountryNames.has(c.name as string),
    );
    if (featured.length === 0) return null;
    // Deterministic pick by ISO week so the cover changes weekly without admin input.
    const now = new Date();
    const onejan = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    const c = featured[week % featured.length];
    return c
      ? {
          entity_type: 'country' as const,
          entity_id: c.id as string,
          slug: (c.slug as string) ?? (c.id as string),
          name: c.name as string,
          headline: c.name as string,
          pull_quote: (c.editorial_hook as string) ?? null,
          hero_image_url: (c.image_url as string) ?? null,
        }
      : null;
  }, [cover, countries, featuredCountryNames]);

  const view = cover
    ? {
        entity_type: cover.entity_type,
        entity_id: cover.entity_id,
        slug: cover.entity_id,
        name: cover.headline,
        headline: cover.headline,
        pull_quote: cover.pull_quote,
        hero_image_url: cover.hero_image_url,
      }
    : fallback;

  if (!view) {
    return (
      <section className="rounded-container border border-border/60 bg-muted/40 p-12 text-center">
        <p className="text-headline-lg font-semibold">Atlas</p>
        <p className="text-15 text-muted-foreground mt-2">
          Cities, countries, and neighborhoods worldwide.
        </p>
      </section>
    );
  }

  const href = HREF[view.entity_type](view.slug);

  return (
    <LocalizedLink to={href} className="block group">
      <section className="relative overflow-hidden rounded-container border border-border/60 min-h-[420px] md:min-h-[520px]">
        {view.hero_image_url ? (
          <img
            src={view.hero_image_url}
            alt={view.name}
            loading="eager"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        {/* Documented scrim exception in CLAUDE.md — readability over photography */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/75" aria-hidden />
        <div className="relative h-full p-8 md:p-16 flex flex-col justify-end gap-4 text-white min-h-[420px] md:min-h-[520px]">
          <p className="text-2xs md:text-xs uppercase tracking-[0.2em] opacity-80">
            Cover · {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <h2 className="text-display md:text-hero font-bold leading-[1.05] tracking-tight max-w-3xl">
            {view.headline}
          </h2>
          {view.pull_quote && (
            <p className="text-body-lg md:text-title max-w-2xl opacity-95">{view.pull_quote}</p>
          )}
        </div>
      </section>
    </LocalizedLink>
  );
}
