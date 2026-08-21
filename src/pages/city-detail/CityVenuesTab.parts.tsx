import { StopList, type Stop } from '@/components/transit/StopList';
import { OccurrenceList, type Occurrence } from '@/components/transit/OccurrenceList';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { venueStops } from '@/components/transit/entityRows';
import type { VenueRelation, VillageRelation, EventRelation } from './types';

export interface CityVenuesTabProps {
  venues: VenueRelation[];
}

/**
 * Venues only. The villages that used to live at the bottom of this component
 * are now their own section (`CityDistricts`) — they are a different kind of
 * thing (a place containing venues, not a venue) and burying them under a
 * venue grid meant a city's queer districts were only findable by scrolling
 * past twelve bars.
 *
 * The "Planning a trip to X?" panel is gone too: the masthead now carries the
 * trip actions, and repeating a call to action inside a content section is the
 * scaffolding the rebuild is removing.
 *
 * Rows, not a bento of cards. The mosaic spent 1,909px on Berlin — the single
 * tallest thing on the page — showing twelve photographs the reader is not
 * choosing between; six named rows plus the section's existing "See all" carry
 * the same decision in a quarter of the height, in the `StopList` grammar the
 * districts section above it already uses and the country single now uses for
 * its own venues. `includeCity` is off: every venue here is in this city, so
 * printing its name on all six rows is noise.
 */
export function CityVenuesTab({ venues }: CityVenuesTabProps) {
  if (venues.length === 0) return null;
  return <StopList stops={venueStops(venues, { limit: 6, includeCity: false })} />;
}

/**
 * Spec module 05 on a city — the queer villages as stops on the line.
 *
 * Ordinals are sequence, not merit (`StopList`'s own rule): these are not
 * ranked, and no walking gap is claimed between them because two districts in
 * the same city are not a walk.
 */
export function cityDistrictStops(villages: VillageRelation[]): Stop[] {
  return villages.map((v: VillageRelation) => ({
    id: v.id,
    name: v.name,
    type: 'queer_village',
    href: v.slug ? `/villages/${v.slug}` : undefined,
    walkFromPrevious: null,
    accessNote: v.description ?? null,
  }));
}

export function CityDistricts({ villages }: { villages: VillageRelation[] }) {
  if (villages.length === 0) return null;
  return <StopList stops={cityDistrictStops(villages)} />;
}

/**
 * Spec module 03 on a city — the next departures. Ink-flooded first row is the
 * module's own device for "the one next instance".
 */
export function cityOccurrences(
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
      detail: e.venue_name ? `${e.title} · ${e.venue_name}` : e.title,
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

export function CityEventsTab({
  events,
  locale,
  openLabel,
}: {
  events: EventRelation[];
  locale: string;
  openLabel: string;
}) {
  const occurrences = cityOccurrences(events, locale, openLabel);
  if (occurrences.length === 0) return null;
  return <OccurrenceList occurrences={occurrences} />;
}
