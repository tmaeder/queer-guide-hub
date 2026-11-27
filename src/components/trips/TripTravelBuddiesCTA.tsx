import { TravelMeetLink } from '@/components/travel-meet/TravelMeetLink';

/** Private trip → destination/date discovery. Publishing is a separate choice. */
export function TripTravelBuddiesCTA({
  tripId,
  cityId,
  startDate,
  endDate,
  countryIds = [],
}: {
  tripId: string;
  cityId?: string | null;
  cityName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  countryIds?: string[];
}) {
  return (
    <TravelMeetLink
      context={{ tripId, cityId: cityId ?? '', start: startDate ?? '', end: endDate ?? '' }}
      countryIds={countryIds}
    />
  );
}
