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
      <DetailHero imageUrl={imageUrl} alt={city.name} heightClassName="h-64 md:h-96" />

      <SafetyAlertBanner
        criminalization={
          city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
        }
        countryName={city.countries?.name || ''}
      />

      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          {city.countries?.name && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {city.countries.flag_emoji && <span aria-hidden="true">{city.countries.flag_emoji}</span>}
              {city.region_name && <span>{city.region_name}</span>}
              {city.region_name && <span aria-hidden="true" className="opacity-50">·</span>}
              {city.countries ? (
                <LocalizedLink
                  to={`/country/${city.countries.slug || city.countries.id}`}
                  className="hover:text-foreground"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {city.countries.name}
                </LocalizedLink>
              ) : null}
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-balance text-foreground">
              {city.name}
            </h1>
            {city.countries?.equality_score != null && (
              <EqualityScoreBadge score={city.countries.equality_score} size="md" />
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0 mt-2 flex-wrap">
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
