import { Heart, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { getRandomFallbackImage } from '@/utils/fallbackImages';
import type { CityRelation } from './types';

export interface CityHeroProps {
  city: CityRelation;
  imageUrl: string;
  isFavorited: boolean;
  onFavoriteToggle: () => void;
  refetchCity: () => void;
}

/**
 * Cinematic full-bleed city hero. Photography is the hero; the title and a single
 * line of editorial voice sit over a readability scrim (the one documented
 * over-image exception to the monochrome rule). Admin / report / favorite live in
 * a compact translucent cluster so they never compete with the title.
 */
export function CityHero({
  city,
  imageUrl,
  isFavorited,
  onFavoriteToggle,
  refetchCity,
}: CityHeroProps) {
  const countryHref = city.countries
    ? `/country/${city.countries.slug || city.countries.id}`
    : null;

  return (
    <div className="group relative h-[58vh] min-h-[380px] max-h-[600px] w-full overflow-hidden rounded-container ring-1 ring-border/60">
      <img
        src={imageUrl || getRandomFallbackImage()}
        alt={city.name}
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
      />
      <div className="pointer-events-none absolute inset-0 img-scrim-strong" aria-hidden="true" />

      {/* Action cluster — top-right, on a neutral chip for legibility over photo. */}
      <div className="absolute right-4 top-4 flex flex-wrap items-center gap-1 rounded-element bg-background/70 p-1 backdrop-blur">
        <ReportButton contentType="cities" contentId={city.id} contentName={city.name} />
        <AdminEditButton
          contentType="cities"
          contentId={city.id}
          contentName={city.name}
          currentData={city as Record<string, unknown>}
          onSaved={() => refetchCity()}
        />
        {city.official_website && (
          <Button variant="ghost" size="icon" asChild aria-label="Official website">
            <a href={city.official_website} target="_blank" rel="noopener noreferrer">
              <Globe size={18} />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onFavoriteToggle}
          aria-pressed={isFavorited}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={18} style={isFavorited ? { fill: 'currentColor' } : undefined} />
        </Button>
      </div>

      {/* Title block — bottom-left, over the scrim. */}
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 md:p-12 text-white">
        <div className="max-w-3xl">
          <h1 className="text-headline-lg sm:text-display md:text-hero font-bold leading-[1.02] tracking-tight">
            {city.countries?.flag_emoji && <span className="mr-2">{city.countries.flag_emoji}</span>}
            <Editable
              contentType="cities"
              recordId={city.id}
              field="name"
              value={city.name}
              onSaved={refetchCity}
            >
              {city.name}
            </Editable>
          </h1>
          <p className="mt-2 text-body-lg text-white/85">
            {city.region_name && `${city.region_name}, `}
            {countryHref ? (
              <LocalizedLink
                to={countryHref}
                className="text-white/85 underline decoration-white/40 underline-offset-4 transition-colors hover:text-white"
                style={{ color: 'inherit' }}
              >
                {city.countries.name}
              </LocalizedLink>
            ) : null}
          </p>
          {city.editorial_hook && (
            <p className="mt-4 max-w-2xl text-15 leading-relaxed text-white/80 sm:text-body-lg">
              {city.editorial_hook}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
