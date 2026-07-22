import { MapPin, Building2, Calendar, Newspaper, Activity, Loader2, ShieldAlert } from 'lucide-react';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { MapShell } from '@/components/map/MapShell';
import { MAP_SHELL_ENABLED } from '@/lib/featureFlags';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import { CountryLegalHistory } from '@/components/country/CountryLegalHistory';
import { TravelDealsSection } from '@/components/travel/TravelDealsSection';
import { ActivitiesWidget } from '@/components/activities/ActivitiesWidget';
import { NewsCard } from '@/components/news/NewsCard';
import { supabase } from '@/integrations/supabase/client';

// CountryDetail accesses joined fields (continents, regions) on a row that doesn't
// declare them in the generated types. Mirror the page's existing loose typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CountryRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CityRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VenueRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArticleRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WeatherDataType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorldBankDataType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SDGDataType = any;

export async function fetchCountryWeather(country: CountryRelation): Promise<WeatherDataType> {
  if (!country?.latitude || !country?.longitude) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const { data, error } = await supabase.functions.invoke('get-weather-forecast', {
      body: {
        lat: country.latitude,
        lon: country.longitude,
        cityName: country.capital || country.name,
      },
    });
    if (data && !error) return data;
  } catch (error) {
    console.warn('Failed to fetch weather data:', error);
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

export function SectionLoader({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-12"
      role="status"
      aria-label={`Loading ${label}`}
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

interface EmptyCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

function EmptyCard({ icon: Icon, title, description }: EmptyCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-container border border-dashed py-12 text-center">
      <Icon size={28} className="text-muted-foreground" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ── Section bodies. None render their own <h2>; EditorialSection supplies the
// section heading, so these are pure content blocks. ──────────────────────────

export function CountryRightsTab({ country }: { country: CountryRelation }) {
  return (
    <div className="flex flex-col gap-6">
      <LGBTJurisdictionInfo country={country} style={{ borderColor: 'inherit' }} />
      <CountryLegalHistory countryId={country?.id} countryName={country?.name} />
    </div>
  );
}

export function CountryCitiesTab({
  cities,
  citiesLoading,
  emptyTitle,
  emptyDescription,
}: {
  cities: CityRelation[];
  citiesLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (citiesLoading) return <SectionLoader label="cities" />;
  if (cities.length === 0)
    return <EmptyCard icon={Building2} title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {cities.map((city: CityRelation) => (
        <DirectoryCard
          key={city.id}
          type="city"
          name={city.name}
          data={city}
          onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
        />
      ))}
    </div>
  );
}

export function CountryVenuesTab({
  venues,
  loading,
  emptyTitle,
  emptyDescription,
}: {
  venues: VenueRelation[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (loading) return <SectionLoader label="venues" />;
  if (venues.length === 0)
    return <EmptyCard icon={MapPin} title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {venues.map((venue: VenueRelation) => (
        <VenueCard key={venue.id} venue={venue} />
      ))}
    </div>
  );
}

export function CountryEventsTab({
  events,
  eventsLoading,
  emptyTitle,
  emptyDescription,
}: {
  events: EventRelation[];
  eventsLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (eventsLoading) return <SectionLoader label="events" />;
  if (events.length === 0)
    return <EmptyCard icon={Calendar} title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {events.map((event: EventRelation) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

export function CountryTravelTab({
  country,
  activitiesTitle,
  activitiesDescription,
}: {
  country: CountryRelation;
  activitiesTitle: string;
  activitiesDescription: string;
}) {
  // High-stakes composition rule: where LGBTQ+ people face criminal penalties,
  // a page must not read like a holiday pitch. Deals and activity upsells are
  // suppressed in favor of a sober pointer to the rights section.
  if (hasAnyCriminalizationSignal(country.lgbti_criminalization)) {
    return (
      <div className="flex gap-4 rounded-container border border-destructive/40 p-6">
        <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-2">
          <p className="text-body-lg font-medium">
            We don't promote travel deals for destinations where LGBTQ+ people face criminal
            penalties.
          </p>
          <p className="text-15 text-muted-foreground">
            If you need to travel to {country.name}, read the rights section on this page first and
            use the trip planner — it includes a safety briefing for high-risk destinations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TravelDealsSection
        destinationCity={country.capital || country.name}
        destinationCountryCode={country.code}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <Activity size={20} aria-hidden="true" />
            {activitiesTitle}
          </CardTitle>
          <CardDescription>{activitiesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivitiesWidget destination={country.capital || country.name} countryCode={country.code} />
        </CardContent>
      </Card>
    </div>
  );
}

export function CountryNewsTab({
  articles,
  newsLoading,
  onViewArticle,
  emptyTitle,
  emptyDescription,
}: {
  articles: ArticleRelation[];
  newsLoading: boolean;
  onViewArticle?: (id: string) => void;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (newsLoading) return <SectionLoader label="news" />;
  if (articles.length === 0)
    return <EmptyCard icon={Newspaper} title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {articles.map((article: ArticleRelation) => (
        <NewsCard key={article.id} article={article} onViewArticle={onViewArticle} />
      ))}
    </div>
  );
}

export function CountryMapTab({
  country,
  ExploreMap,
  Suspense,
}: {
  country: CountryRelation;
  ExploreMap: React.ComponentType<Record<string, unknown>>;
  Suspense: typeof import('react').Suspense;
}) {
  if (typeof country.latitude !== 'number' || typeof country.longitude !== 'number') return null;
  const center: [number, number] = [Number(country.longitude), Number(country.latitude)];

  if (MAP_SHELL_ENABLED) {
    return (
      <MapShell surface="country" height={500} initialCenter={center} initialZoom={5} skipAutoFly />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <ExploreMap
        height={500}
        initialCenter={center}
        initialZoom={5}
        defaultLayers={['venues', 'events', 'cities']}
        showLayerToggles
        showFilters={false}
        skipAutoFly
      />
    </Suspense>
  );
}
