import { VenueCard } from '@/components/venues/VenueCard';
import { StopList, type Stop } from '@/components/transit/StopList';
import { OccurrenceList, type Occurrence } from '@/components/transit/OccurrenceList';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { BentoSection, spansForPreset } from '@/components/discovery';
import type { VenueRelation, VillageRelation, EventRelation } from './types';

const VENUE_SPAN_CLASS: Record<string, string> = {
  sm: 'col-span-12 sm:col-span-6 md:col-span-4',
  md: 'col-span-12 sm:col-span-6 md:col-span-4',
  lg: 'col-span-12 sm:col-span-6 md:col-span-6',
  wide: 'col-span-12 md:col-span-8',
  tall: 'col-span-12 sm:col-span-6 md:col-span-4 row-span-2',
};

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
 */
export function CityVenuesTab({ venues }: CityVenuesTabProps) {
  if (venues.length === 0) return null;
  return (
    <BentoSection preset="featured">
      {venues.map((venue: VenueRelation, i: number) => (
        <div
          key={venue.id}
          className={VENUE_SPAN_CLASS[spansForPreset('featured', i, venues.length)]}
        >
          <VenueCard venue={venue} />
        </div>
      ))}
    </BentoSection>
  );
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
