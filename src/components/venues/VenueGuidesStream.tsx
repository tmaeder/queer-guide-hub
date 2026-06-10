import { useRecommendedVenueGuides } from '@/hooks/useRecommendedVenueGuides';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight } from 'lucide-react';
import { VenueGuideCard } from './VenueGuideCard';

interface VenueGuidesStreamProps {
  limit?: number;
  showHero?: boolean;
  hideWhenEmpty?: boolean;
}

export function VenueGuidesStream({
  limit = 6,
  showHero = true,
  hideWhenEmpty = true,
}: VenueGuidesStreamProps) {
  const { data: guides = [], isLoading, error } = useRecommendedVenueGuides({ limit });

  if (error) return null;
  if (!isLoading && guides.length === 0 && hideWhenEmpty) return null;

  const [hero, ...rest] = guides;

  return (
    <section className="my-10" aria-labelledby="venue-guides-stream-heading">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 id="venue-guides-stream-heading" className="text-headline-lg leading-tight">
            Guides
          </h2>
          <p className="text-body-lg text-muted-foreground">
            Editor-curated picks for first visits and locals.
          </p>
        </div>
        <LocalizedLink
          to="/venues/guides"
          className="inline-flex items-center gap-2 text-13 text-muted-foreground hover:text-foreground"
        >
          All guides
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-12 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="col-span-12 md:col-span-6 lg:col-span-4 rounded-container border border-border bg-card overflow-hidden"
            >
              <div className="aspect-[16/9] bg-muted animate-pulse" />
              <div className="p-6 space-y-2">
                <div className="h-3 w-24 bg-muted animate-pulse rounded-badge" />
                <div className="h-6 w-3/4 bg-muted animate-pulse rounded-element" />
                <div className="h-4 w-2/3 bg-muted animate-pulse rounded-element" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {hero && showHero && (
            <div className="col-span-12">
              <VenueGuideCard guide={hero} size="hero" priority />
            </div>
          )}
          {(showHero ? rest : guides).map((g, i) => (
            <div key={g.id} className="col-span-12 md:col-span-6 lg:col-span-4">
              <VenueGuideCard guide={g} priority={!showHero && i < 3} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
