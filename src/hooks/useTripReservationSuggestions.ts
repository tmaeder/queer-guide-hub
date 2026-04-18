import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserTravelPreferences, type TransportMode } from '@/hooks/useUserTravelPreferences';
import { useTrip } from '@/hooks/useTrips';
import { buildBookingUrl } from '@/utils/transport/bookingUrl';
import { buildTrainlineUrl } from '@/utils/transport/trainlineUrl';
import { buildOmioUrl } from '@/utils/transport/omioUrl';
import { buildFlixbusUrl } from '@/utils/transport/flixbusUrl';
import { getAffiliateUrl } from '@/utils/aviasalesUrl';

export interface AccommodationSuggestion {
  id: string;
  kind: 'accommodation';
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceFrom: number | null;
  currency: string | null;
  provider: string;
  externalUrl: string;
  listingId: string | null;
  rank: number;
}

export interface TransportSuggestion {
  id: string;
  kind: 'flight' | 'rail' | 'bus';
  title: string;
  subtitle: string;
  provider: string;
  externalUrl: string;
  rank: number;
  /** Higher = better fit for this user/trip. */
  relevanceScore: number;
}

export interface ReservationSuggestions {
  accommodations: AccommodationSuggestion[];
  transport: TransportSuggestion[];
}

const EUROPEAN_COUNTRY_CODES = new Set([
  'DE','FR','IT','ES','PT','NL','BE','LU','CH','AT','DK','SE','NO','FI','IS','IE','GB',
  'PL','CZ','SK','HU','SI','HR','RO','BG','GR','EE','LV','LT',
]);

async function lookupIataByNameByName(cityName: string | null): Promise<string | null> {
  if (!cityName) return null;
  const { data } = await supabase
    .from('airports')
    .select('iata_code, is_major')
    .ilike('city_name', cityName)
    .order('is_major', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { iata_code: string } | null)?.iata_code ?? null;
}

export function useTripReservationSuggestions(tripId: string | undefined) {
  const { data: trip } = useTrip(tripId);
  const { data: prefs } = useUserTravelPreferences();

  return useQuery({
    queryKey: [
      'trip-reservation-suggestions',
      tripId,
      trip?.primary_city_id,
      trip?.start_date,
      trip?.end_date,
      prefs?.preferred_transport?.join(','),
      prefs?.home_city_id,
    ],
    enabled: !!tripId && !!trip?.primary_city_id,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ReservationSuggestions> => {
      if (!trip?.primary_city_id) return { accommodations: [], transport: [] };

      const [accommodations, transport] = await Promise.all([
        fetchAccommodations(trip),
        fetchTransport(trip, prefs ?? null),
      ]);
      return { accommodations, transport };
    },
  });
}

// ── Accommodations ────────────────────────────────────────────
async function fetchAccommodations(
  trip: NonNullable<ReturnType<typeof useTrip>['data']>,
): Promise<AccommodationSuggestion[]> {
  const destination = trip.primary_city_name ?? '';

  // 1) Live marketplace hotel listings for this city (if any)
  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('id, title, description, price, currency, images, external_url, source_type, location, business_name')
    .eq('status', 'active')
    .in('category', ['hotel', 'accommodation', 'stay'])
    .ilike('location', `%${destination}%`)
    .order('featured', { ascending: false })
    .limit(4);

  const fromListings: AccommodationSuggestion[] = (listings ?? []).map(
    (l: Record<string, unknown>, i: number) => ({
      id: `listing:${l.id}`,
      kind: 'accommodation',
      title: (l.title as string) ?? 'Hotel',
      description: (l.description as string | null) ?? null,
      imageUrl: (l.images as string[] | null)?.[0] ?? null,
      priceFrom: (l.price as number | null) ?? null,
      currency: (l.currency as string | null) ?? null,
      provider: (l.business_name as string | null) ?? 'Marketplace',
      externalUrl: (l.external_url as string) ?? '#',
      listingId: l.id as string,
      rank: i,
    }),
  );

  // 2) Always append a Booking.com deep-link as the "wide search" fallback
  const bookingUrl = buildBookingUrl({
    destination,
    checkIn: trip.start_date,
    checkOut: trip.end_date,
    adults: 2,
  });
  const bookingSuggestion: AccommodationSuggestion = {
    id: 'booking:wide',
    kind: 'accommodation',
    title: `Hotels in ${destination}`,
    description: 'Search live inventory on Booking.com',
    imageUrl: null,
    priceFrom: null,
    currency: null,
    provider: 'Booking.com',
    externalUrl: bookingUrl,
    listingId: null,
    rank: fromListings.length,
  };

  return [...fromListings, bookingSuggestion];
}

// ── Transport ─────────────────────────────────────────────────
async function fetchTransport(
  trip: NonNullable<ReturnType<typeof useTrip>['data']>,
  prefs: { home_city_id: string | null; preferred_transport: TransportMode[] } | null,
): Promise<TransportSuggestion[]> {
  if (!trip.primary_city_name) return [];
  const destName = trip.primary_city_name;
  const destCountry = trip.primary_country_code;

  // Origin: user's home city, otherwise nothing to anchor against → flight-wide only
  let originName: string | null = null;
  if (prefs?.home_city_id) {
    const { data } = await supabase
      .from('cities')
      .select('name')
      .eq('id', prefs.home_city_id)
      .maybeSingle();
    originName = (data as { name: string } | null)?.name ?? null;
  }

  const destIata = await lookupIataByName(trip.primary_city_name);
  const preferred = prefs?.preferred_transport ?? [];

  const suggestions: TransportSuggestion[] = [];

  // Flight — Aviasales (works with or without origin)
  if (originName || destIata) {
    let originIata: string | null = null;
    if (originName) originIata = await lookupIataByName(originName);

    if (originIata && destIata) {
      const flightUrl = getAffiliateUrl({
        origin: originIata,
        destination: destIata,
        departDate: trip.start_date,
        returnDate: trip.end_date,
      });
      suggestions.push({
        id: 'flight:aviasales',
        kind: 'flight',
        title: `Flights ${originIata} → ${destIata}`,
        subtitle: trip.start_date
          ? `${formatShort(trip.start_date)}${trip.end_date ? ` – ${formatShort(trip.end_date)}` : ''}`
          : 'Flexible dates',
        provider: 'Aviasales',
        externalUrl: flightUrl,
        rank: 0,
        relevanceScore: preferred.includes('flight') ? 10 : 6,
      });
    }
  }

  // Rail — Trainline + Omio (European context only)
  const isEuropean = destCountry ? EUROPEAN_COUNTRY_CODES.has(destCountry) : false;
  if (isEuropean && originName) {
    suggestions.push({
      id: 'rail:trainline',
      kind: 'rail',
      title: `Train ${originName} → ${destName}`,
      subtitle: trip.start_date ? formatShort(trip.start_date) : 'Flexible dates',
      provider: 'Trainline',
      externalUrl: buildTrainlineUrl({
        origin: originName,
        destination: destName,
        departDate: trip.start_date,
        returnDate: trip.end_date,
      }),
      rank: 1,
      relevanceScore: preferred.includes('rail') ? 11 : 7,
    });
    suggestions.push({
      id: 'rail:omio',
      kind: 'rail',
      title: `Compare rail · ${originName} → ${destName}`,
      subtitle: 'Omio (rail + bus)',
      provider: 'Omio',
      externalUrl: buildOmioUrl({
        origin: originName,
        destination: destName,
        departDate: trip.start_date,
        returnDate: trip.end_date,
        mode: 'trains',
      }),
      rank: 2,
      relevanceScore: preferred.includes('rail') ? 9 : 5,
    });
  }

  // Bus — FlixBus (European context only, budget-friendly)
  if (isEuropean && originName) {
    suggestions.push({
      id: 'bus:flixbus',
      kind: 'bus',
      title: `Bus ${originName} → ${destName}`,
      subtitle: trip.start_date ? formatShort(trip.start_date) : 'Flexible dates',
      provider: 'FlixBus',
      externalUrl: buildFlixbusUrl({
        origin: originName,
        destination: destName,
        departDate: trip.start_date,
        returnDate: trip.end_date,
      }),
      rank: 3,
      relevanceScore: preferred.includes('bus') ? 10 : 4,
    });
  }

  // Sort by relevance descending, reassign rank
  return suggestions
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map((s, i) => ({ ...s, rank: i }));
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
