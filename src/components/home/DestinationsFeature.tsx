import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { fetchTrending } from '@/lib/searchClient';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

interface CityRow {
  entity_id?: string;
  id?: string;
  slug?: string;
  title?: string;
  country?: string;
  image_url?: string;
}

/**
 * Destinations — an editorial, type-led treatment of live trending cities.
 * Deliberately NOT a card rail: one large featured city + a quiet ranked list,
 * so it reads differently from every other block on the page. Self-hides empty.
 */
export function DestinationsFeature() {
  const { t } = useTranslation();
  const [cities, setCities] = useState<CityRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTrending(['city'], undefined, 7)
      .then((res) => {
        if (!cancelled) setCities((res as CityRow[]).filter((c) => c.title && (c.slug || c.id)));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || cities?.length === 0) return null;
  if (!cities) {
    // Quiet, shaped placeholder — keeps page rhythm stable, no spinner.
    return <div aria-hidden className="h-px" />;
  }

  const href = (c: CityRow) => `/city/${c.slug || c.id}`;
  const featured = cities[0];
  const rest = cities.slice(1, 6);
  const featuredImage = isValidImageUrl(featured.image_url) ? featured.image_url : null;

  return (
    <section
      aria-labelledby="destinations-heading"
      className="px-4 sm:px-6 md:px-8 py-20 md:py-32"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between gap-4 mb-12 md:mb-16">
          <div>
            <Eyebrow as="div" className="mb-4">
              {t('home.discover', 'Destinations')}
            </Eyebrow>
            <h2
              id="destinations-heading"
              className="text-headline-lg md:text-display font-bold tracking-tight"
              style={{ letterSpacing: '-0.03em' }}
            >
              {t('home.destinationsTitle', 'Where the scene lives.')}
            </h2>
          </div>
          <LocalizedLink
            to="/cities"
            className="group hidden shrink-0 items-center gap-1 text-13 font-medium text-muted-foreground transition-colors hover:text-foreground no-underline sm:inline-flex"
          >
            {t('home.allCities', 'All cities')}
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </LocalizedLink>
        </div>

        <div className="grid gap-x-16 gap-y-12 md:grid-cols-[1.1fr_1fr] md:items-end">
          {/* Featured city — large, type-forward */}
          <LocalizedLink
            to={href(featured)}
            className="group block no-underline"
            aria-label={`${featured.title}${featured.country ? `, ${featured.country}` : ''}`}
          >
            {featuredImage && (
              <div className="relative mb-6 aspect-[4/3] overflow-hidden rounded-container bg-muted">
                <img
                  src={featuredImage}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover grayscale transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
            )}
            <Eyebrow as="div" className="mb-2 opacity-70">
              {featured.country}
            </Eyebrow>
            <span
              className="block text-hero font-bold leading-[0.95] tracking-tight transition-opacity group-hover:opacity-70"
              style={{ letterSpacing: '-0.04em' }}
            >
              {featured.title}
            </span>
          </LocalizedLink>

          {/* Ranked list — quiet, no images, distinct rhythm from the featured + the index.
              div[role=list] not <ol>: standalone row links must escape the inline-prose
              rule (index.css `li a { display:inline }` + underline ::after). */}
          <div role="list" className="md:pb-2">
            {rest.map((c, i) => (
              <div
                role="listitem"
                key={`${c.slug || c.id}`}
                className="border-t border-border last:border-b"
              >
                <LocalizedLink
                  to={href(c)}
                  className="group flex items-baseline gap-6 py-6 no-underline"
                >
                  <span
                    className="text-13 font-semibold tabular-nums text-muted-foreground/60"
                    style={{ letterSpacing: 'var(--tracking-label)' }}
                  >
                    {String(i + 2).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 text-title font-bold leading-tight tracking-tight transition-opacity group-hover:opacity-70">
                    <span className="block truncate">{c.title}</span>
                    {c.country && (
                      <span className="block text-13 font-normal text-muted-foreground">
                        {c.country}
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden
                    className="self-center text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
                  >
                    →
                  </span>
                </LocalizedLink>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
