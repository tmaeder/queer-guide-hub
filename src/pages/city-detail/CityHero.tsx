import {
  MapPin,
  Globe,
  Users,
  Building,
  Star,
  Heart,
  Clock,
  Thermometer,
  Plane,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { DetailHero } from '@/components/layout/DetailHero';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import type { CityRelation } from './types';
import { formatPopulation } from './types';

export interface CityHeroProps {
  city: CityRelation;
  imageUrl: string;
  isFavorited: boolean;
  hasAirport: boolean;
  effectiveIata: string | null;
  onFavoriteToggle: () => void;
  refetchCity: () => void;
}

export function CityHero({
  city,
  imageUrl,
  isFavorited,
  hasAirport,
  effectiveIata,
  onFavoriteToggle,
  refetchCity,
}: CityHeroProps) {
  return (
    <>
      <DetailHero imageUrl={imageUrl} alt={city.name} heightClassName="h-48 md:h-60" />

      <SafetyAlertBanner
        criminalization={
          city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
        }
        countryName={city.countries?.name || ''}
      />

      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-4 mb-1">
            <h3 className="text-3xl lg:text-5xl font-bold text-foreground">
              {city.countries?.flag_emoji && <>{city.countries.flag_emoji} </>}
              {city.name}
            </h3>
            {city.countries?.equality_score != null && (
              <EqualityScoreBadge score={city.countries.equality_score} size="md" />
            )}
          </div>
          <p className="text-lg text-muted-foreground mb-2">
            {city.region_name && `${city.region_name}, `}
            {city.countries ? (
              <LocalizedLink
                to={`/country/${city.countries.slug || city.countries.id}`}
                style={{
                  color: 'inherit',
                  textDecoration: 'underline',
                  textDecorationColor: 'currentColor',
                  textUnderlineOffset: '2px',
                }}
              >
                {city.countries.name}
              </LocalizedLink>
            ) : null}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0 mt-2 flex-wrap">
          <LocalizedLink
            to={`/travel?city=${encodeURIComponent(city.slug || String(city.id))}`}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-extrabold tracking-tight text-background transition-transform duration-300 hover:-translate-y-0.5 no-underline"
          >
            <Plane style={{ height: 14, width: 14 }} aria-hidden="true" />
            Plan a trip in {city.name}
          </LocalizedLink>
          <ReportButton contentType="cities" contentId={city.id} contentName={city.name} />
          <AdminEditButton
            contentType="cities"
            contentId={city.id}
            contentName={city.name}
            currentData={city as Record<string, unknown>}
            onSaved={() => refetchCity()}
          />
          <Button variant="outline" size="sm" onClick={onFavoriteToggle}>
            <Heart
              style={{
                height: 16,
                width: 16,
                marginRight: 6,
                ...(isFavorited ? { fill: 'currentColor', color: 'inherit' } : {}),
              }}
            />
            {isFavorited ? 'Favorited' : 'Favorite'}
          </Button>
          {city.official_website && (
            <Button variant="outline" size="sm" asChild>
              <a href={city.official_website} target="_blank" rel="noopener noreferrer">
                <Globe style={{ height: 16, width: 16, marginRight: 6 }} />
                Website
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {city.is_capital && (
          <Badge variant="outline" className="gap-1">
            <Building style={{ height: 14, width: 14 }} />
            Capital City
          </Badge>
        )}
        {city.is_major_city && (
          <Badge variant="outline" className="gap-1">
            <MapPin style={{ height: 14, width: 14 }} />
            Major City
          </Badge>
        )}
        {city.population && (
          <Badge variant="outline" className="gap-1">
            <Users style={{ height: 14, width: 14 }} />
            {formatPopulation(city.population)}
          </Badge>
        )}
        {city.timezone && (
          <Badge variant="outline" className="gap-1">
            <Clock style={{ height: 14, width: 14 }} />
            {city.timezone}
          </Badge>
        )}
        {effectiveIata && (
          <Badge variant="outline" className="gap-1">
            <Plane style={{ height: 14, width: 14 }} />
            {hasAirport ? effectiveIata : `~${effectiveIata} (nearest)`}
          </Badge>
        )}
        {city.climate_type && (
          <Badge variant="outline" className="gap-1">
            <Thermometer style={{ height: 14, width: 14 }} />
            {city.climate_type}
          </Badge>
        )}
        {city.lgbt_friendly_rating && (
          <Badge variant="outline" className="gap-1">
            <Star style={{ height: 14, width: 14, fill: 'currentColor', color: 'inherit' }} />
            {city.lgbt_friendly_rating}/5 LGBTQ+ Friendly
          </Badge>
        )}
      </div>
    </>
  );
}
