import { ShieldAlert } from 'lucide-react';
import { hasAnyCriminalizationSignal } from '@/utils/equalityScore';
import { EntityMap } from '@/components/map/EntityMap';
import { MapInset } from '@/components/transit/MapInset';
import { StopList, type Stop } from '@/components/transit/StopList';
import { OccurrenceList, type Occurrence } from '@/components/transit/OccurrenceList';
import { venueStops, newsRows } from '@/components/transit/entityRows';
import { VersionHistory, type Revision } from '@/components/transit/VersionHistory';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { TravelDealsSection } from '@/components/travel/TravelDealsSection';
import { ActivitiesWidget } from '@/components/activities/ActivitiesWidget';
import { useMilestonesForCountry } from '@/hooks/useMilestones';
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
  }
  return null;
}

// ── Section bodies. None render their own <h2>; `SingleSection` supplies the
// section heading, so these are pure content blocks. None renders an empty
// state either — spec rule 2 puts that decision at the page, which drops the
// whole section when there is nothing in it. ─────────────────────────────────

export function CountryRightsTab({ country }: { country: CountryRelation }) {
  return <LGBTJurisdictionInfo country={country} style={{ borderColor: 'inherit' }} />;
}

/**
 * The masthead action row. `CountryHero` carried these in a translucent
 * cluster pinned to the top-right of a full-bleed photograph; the single is
 * typographic, so they become ordinary outline buttons next to the primary
 * verb.
 */
export function CountryActions({
  country,
  onContentUpdated,
}: {
  country: CountryRelation;
  onContentUpdated?: () => void;
}) {
  return (
    <>
      <ReportButton contentType="countries" contentId={country.id} contentName={country.name} />
      <AdminEditButton
        contentType="countries"
        contentId={country.id}
        contentName={country.name}
        currentData={country as Record<string, unknown>}
        onSaved={onContentUpdated}
      />
    </>
  );
}

/**
 * Spec module 12 — Version history, and the OWNER module for the country type:
 * a country page is "a living legal record" where "safety information without
 * a date is dangerous".
 *
 * The source is `milestones_for_country`, i.e. real dated legal events
 * (decriminalisation, marriage, gender recognition). It is deliberately NOT
 * `countries.updated_at`: every row shares the nightly ILGA sync stamp, so a
 * history built from it would print the same date for all 250 countries and
 * call a cron run a change in the law.
 *
 * Sorted newest-first here because the RPC ranks by significance, and the
 * module's contract is chronological.
 */
export function CountryLegalRecord({
  countryId,
  countryName,
  seeAllLabel,
}: {
  countryId: string;
  countryName: string;
  seeAllLabel: string;
}) {
  const { data } = useMilestonesForCountry(countryId, 12);
  if (!data?.length) return null;

  const revisions: Revision[] = [...data]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((m) => ({ id: m.id, date: m.date, change: m.title, by: m.category ?? null }));

  return (
    <div>
      <VersionHistory revisions={revisions} />
      <LocalizedLink
        to={`/history?country=${encodeURIComponent(countryName)}`}
        className="mt-4 inline-block px-4 py-2 text-xs2 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
      >
        {seeAllLabel}
      </LocalizedLink>
    </div>
  );
}

/**
 * Spec module 05 on a country — its cities as stops on the line.
 *
 * Replaces a four-across `DirectoryCard` grid whose cards navigated with
 * `window.location.href` inside an `onClick`, i.e. a full page reload and no
 * real link (no middle-click, no open-in-new-tab, invisible to a screen
 * reader's link list). `StopList` renders a real anchor per stop.
 *
 * No walking gap is claimed: two cities in a country are not a walk. Ordinals
 * are sequence, not merit — the order is the caller's (population desc).
 */
export function countryCityStops(cities: CityRelation[]): Stop[] {
  return cities.slice(0, 8).map((c: CityRelation) => ({
    id: c.id,
    name: c.name,
    type: 'city',
    href: c.slug ? `/city/${c.slug}` : undefined,
    walkFromPrevious: null,
    accessNote: c.region_name ?? null,
  }));
}

export function CountryCitiesTab({ cities }: { cities: CityRelation[] }) {
  if (cities.length === 0) return null;
  return <StopList stops={countryCityStops(cities)} />;
}

/**
 * Venues as compact stops, not cards. Full `VenueCard`s belong on directory
 * pages; on a country single the venues are context, and a 3-across card grid
 * was the page's single tallest section (~1,200px for 12 venues). Six rows
 * plus a see-all link carry the same information in a quarter of the height,
 * in the same `StopList` grammar the cities section already uses.
 *
 * `includeCity` — a country's venues are scattered, so the row has to say
 * where each one is. The city single passes false.
 */
export function countryVenueStops(venues: VenueRelation[]): Stop[] {
  return venueStops(venues, { limit: 6, includeCity: true });
}

export function CountryVenuesTab({ venues }: { venues: VenueRelation[] }) {
  if (venues.length === 0) return null;
  return <StopList stops={countryVenueStops(venues)} />;
}

/** Spec module 03 — the next departures nationwide. */
export function countryOccurrences(
  events: EventRelation[],
  locale: string,
  openLabel: string,
): Occurrence[] {
  return events.slice(0, 8).map((e: EventRelation) => {
    const d = e.start_date ? new Date(e.start_date) : null;
    const date =
      d && !Number.isNaN(d.getTime())
        ? d
            .toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
            .toUpperCase()
        : '';
    return {
      id: e.id,
      date,
      detail: e.city ? `${e.title} · ${e.city}` : e.title,
      status: e.is_free ? 'FREE' : undefined,
      action: e.slug ? (
        <LocalizedLink
          to={`/events/${e.slug}`}
          aria-label={e.title}
          className="text-2xs font-bold uppercase tracking-label underline"
        >
          {openLabel}
        </LocalizedLink>
      ) : undefined,
    };
  });
}

export function CountryEventsTab({
  events,
  locale,
  openLabel,
}: {
  events: EventRelation[];
  locale: string;
  openLabel: string;
}) {
  const occurrences = countryOccurrences(events, locale, openLabel);
  if (occurrences.length === 0) return null;
  return <OccurrenceList occurrences={occurrences} />;
}

export function CountryTravelTab({
  country,
  activitiesTitle,
  noDealsTitle,
  noDealsBody,
}: {
  country: CountryRelation;
  activitiesTitle: string;
  noDealsTitle: string;
  noDealsBody: string;
}) {
  // High-stakes composition rule: where LGBTQ+ people face criminal penalties,
  // a page must not read like a holiday pitch. Deals and activity upsells are
  // suppressed in favour of a sober pointer to the rights section.
  if (hasAnyCriminalizationSignal(country.lgbti_criminalization)) {
    return (
      <div className="border flex gap-4 border-destructive p-4 sm:p-6">
        <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-2">
          <p className="text-body-lg font-bold">{noDealsTitle}</p>
          <p className="text-15 text-muted-foreground">{noDealsBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <TravelDealsSection
        destinationCity={country.capital || country.name}
        destinationCountryCode={country.code}
      />
      <div>
        <h3 className="text-title font-bold">{activitiesTitle}</h3>
        <div className="mt-4">
          <ActivitiesWidget
            destination={country.capital || country.name}
            countryCode={country.code}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * News as dated headline rows in the `OccurrenceList` grammar — replaces six
 * full `NewsCard`s (931px on Germany, 2,649px on Iran, where the card grid
 * fell to one column). A country page's news module is context, not a feed;
 * the feed is one link away. `floodFirst` is off: the ink-flooded first row
 * means "your next departure", and the newest headline is not that.
 */
export function countryNewsRows(
  articles: ArticleRelation[],
  locale: string,
  openLabel: string,
  onViewArticle?: (id: string) => void,
): Occurrence[] {
  return newsRows(articles, { locale, openLabel, limit: 5, onView: onViewArticle });
}

export function CountryNewsTab({
  articles,
  locale,
  openLabel,
  onViewArticle,
}: {
  articles: ArticleRelation[];
  locale: string;
  openLabel: string;
  onViewArticle?: (id: string) => void;
}) {
  const rows = countryNewsRows(articles, locale, openLabel, onViewArticle);
  if (rows.length === 0) return null;
  return <OccurrenceList occurrences={rows} floodFirst={false} />;
}

/**
 * Spec module 16 — required on countries. Rail-sized; the full map is a link.
 *
 * `EntityMap`, NOT `MapShell`: MapShell's search field, layer switcher and
 * filter bar are absolutely positioned for a full-bleed canvas and overflowed
 * the 360px rail, clipping the filter chip against the viewport. `MapInset` is
 * "a frame, not a second map" — the frame wants a bare canvas.
 */
export function CountryMapTab({
  country,
  caption,
  openLabel,
}: {
  country: CountryRelation;
  caption?: string;
  openLabel?: string;
}) {
  if (typeof country.latitude !== 'number' || typeof country.longitude !== 'number') return null;
  const center: [number, number] = [Number(country.longitude), Number(country.latitude)];

  return (
    <MapInset caption={caption}>
      <EntityMap
        center={center}
        zoom={4}
        height={280}
        markers={[
          {
            id: country.id,
            lat: Number(country.latitude),
            lng: Number(country.longitude),
            name: country.name ?? 'Country',
            type: 'countries',
            primary: true,
          },
        ]}
      />
      {openLabel && (
        <LocalizedLink
          to={`/map?country=${encodeURIComponent(country.name)}`}
          className="block border-t border-border-hairline px-2 py-2 text-2xs font-bold uppercase tracking-label no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {openLabel}
        </LocalizedLink>
      )}
    </MapInset>
  );
}
