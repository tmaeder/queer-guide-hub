import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight, BookOpen } from 'lucide-react';
import {
  useVenueGuideAppearances,
  useCityVenueGuides,
  type VenueGuideAppearance,
} from '@/hooks/useVenueGuideAppearances';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import type { Database } from '@/integrations/supabase/types';

type PickTier = Database['public']['Tables']['venue_guide_picks']['Row']['tier'];

const TIER_LABEL: Record<PickTier, string> = {
  top: 'Our pick',
  also_great: 'Also great',
  upgrade: 'Worth the upgrade',
  budget: 'Easy choice',
  avoid: 'Skip this one',
};

/** "Featured in" callout on a single venue's detail page. */
export function VenueFeaturedInGuides({ venueId }: { venueId: string }) {
  const { data: appearances = [] } = useVenueGuideAppearances(venueId);
  if (appearances.length === 0) return null;
  return (
    <section
      className="rounded-container border border-border p-6 bg-card my-6"
      aria-labelledby="venue-featured-in-heading"
    >
      <header className="flex items-center gap-2 mb-4">
        <BookOpen size={16} aria-hidden className="text-muted-foreground" />
        <h2
          id="venue-featured-in-heading"
          className="text-13 uppercase tracking-[0.15em] text-muted-foreground"
        >
          Featured in {appearances.length === 1 ? 'a guide' : `${appearances.length} guides`}
        </h2>
      </header>
      <ul className="space-y-5">
        {appearances.map((a) => (
          <li key={a.id}>
            <FeaturedInItem appearance={a} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeaturedInItem({ appearance }: { appearance: VenueGuideAppearance }) {
  const { guide, tier, rationale_md } = appearance;
  return (
    <LocalizedLink to={`/venues/guides/${guide.slug}`} className="group block no-underline">
      <p className="inline-flex items-center rounded-badge border border-border px-2 py-1 text-2xs uppercase tracking-[0.1em]">
        {TIER_LABEL[tier]}
      </p>
      <p className="mt-2 text-title leading-snug group-hover:underline underline-offset-4">
        {guide.title}
      </p>
      {rationale_md && (
        <p className="mt-2 text-body-lg italic text-muted-foreground leading-relaxed">
          “{rationale_md}”
        </p>
      )}
      <p className="mt-3 inline-flex items-center gap-1 text-13 text-muted-foreground">
        Read the full guide
        <ArrowRight size={14} aria-hidden />
      </p>
    </LocalizedLink>
  );
}

/** "Guides for this city" rail on CityDetail. */
export function CityVenueGuidesRail({ cityId }: { cityId: string }) {
  const { data: guides = [] } = useCityVenueGuides(cityId);
  if (guides.length === 0) return null;
  return (
    <section className="my-10" aria-labelledby="city-venue-guides-heading">
      <header className="mb-4 flex items-end justify-between gap-4">
        <h2
          id="city-venue-guides-heading"
          className="text-13 uppercase tracking-[0.15em] text-muted-foreground"
        >
          Guides for this city
        </h2>
        <LocalizedLink
          to="/venues/guides"
          className="inline-flex items-center gap-1 text-13 text-muted-foreground hover:text-foreground"
        >
          All guides
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {guides.map((g) => {
          const hero = resolveImageUrl({ imageUrl: g.hero_image_path });
          return (
            <li
              key={g.id}
              className="rounded-container border border-border bg-card overflow-hidden"
            >
              <LocalizedLink
                to={`/venues/guides/${g.slug}`}
                className="group block no-underline"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {hero ? (
                    <img
                      src={hero}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  ) : null}
                </div>
                <div className="p-5">
                  <p className="text-xs2 uppercase tracking-[0.15em] text-muted-foreground">
                    Guide
                    {g.reading_time_min ? ` · ${g.reading_time_min} min read` : ''}
                    {' · '}
                    {g.pick_count} picks
                  </p>
                  <p className="mt-2 text-title leading-snug group-hover:underline underline-offset-4">
                    {g.title}
                  </p>
                  {g.dek && (
                    <p className="mt-2 italic text-body-lg text-muted-foreground">{g.dek}</p>
                  )}
                </div>
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
