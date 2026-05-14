import type { VenueWithRelations } from './VenueDetail.parts';

const MAX_DESC = 155;
const PLACE_CATEGORIES = new Set(['park', 'beach', 'monument', 'landmark', 'museum']);

const truncate = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;

export interface VenueMeta {
  title: string;
  description: string;
  ogImage: string;
  canonicalPath: string;
}

export function buildVenueMeta(venue: VenueWithRelations): VenueMeta {
  const cityName = venue.cities?.name ?? venue.city ?? null;
  const countryName = venue.countries?.name ?? venue.country ?? null;
  const category = venue.category?.toLowerCase() ?? 'venue';
  const fallbackDesc = `Queer-friendly ${category}${cityName ? ` in ${cityName}` : ''}${
    countryName ? `, ${countryName}` : ''
  }.`;
  const description = truncate(venue.description?.trim() || fallbackDesc, MAX_DESC);
  const ogImage = venue.images?.[0] ?? '/images/og-image.png';
  const canonicalPath = `/venues/${venue.slug ?? venue.id}`;

  return {
    title: cityName ? `${venue.name} — ${cityName}` : venue.name,
    description,
    ogImage,
    canonicalPath,
  };
}

export interface RatingSummary {
  ratingValue: number;
  ratingCount: number;
}

export function buildVenueJsonLd(
  venue: VenueWithRelations,
  rating: RatingSummary,
): Record<string, unknown> {
  const cityName = venue.cities?.name ?? venue.city ?? undefined;
  const countryName = venue.countries?.name ?? venue.country ?? undefined;
  const category = venue.category?.toLowerCase() ?? '';
  const isPlace = PLACE_CATEGORIES.has(category);
  const url = `https://queer.guide/venues/${venue.slug ?? venue.id}`;

  const address: Record<string, string> = { '@type': 'PostalAddress' };
  if (venue.address) address.streetAddress = venue.address;
  if (cityName) address.addressLocality = cityName;
  if (countryName) address.addressCountry = countryName;
  if (venue.postal_code) address.postalCode = venue.postal_code;

  const sameAs: string[] = [];
  if (venue.instagram) sameAs.push(`https://instagram.com/${venue.instagram}`);

  const openingHoursSpec = buildOpeningHoursSpec(
    venue.hours && typeof venue.hours === 'object' && !Array.isArray(venue.hours)
      ? (venue.hours as Record<string, unknown>)
      : null,
  );

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': isPlace ? 'Place' : 'LocalBusiness',
    name: venue.name,
    url,
  };
  if (venue.description) ld.description = venue.description;
  if (venue.images?.length) ld.image = venue.images;
  if (Object.keys(address).length > 1) ld.address = address;
  if (typeof venue.latitude === 'number' && typeof venue.longitude === 'number') {
    ld.geo = {
      '@type': 'GeoCoordinates',
      latitude: venue.latitude,
      longitude: venue.longitude,
    };
  }
  if (venue.phone) ld.telephone = venue.phone;
  if (venue.website) ld.url = venue.website;
  if (venue.price_range) ld.priceRange = '$'.repeat(venue.price_range);
  if (sameAs.length) ld.sameAs = sameAs;
  if (openingHoursSpec.length) ld.openingHoursSpecification = openingHoursSpec;
  if (rating.ratingCount > 0) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(rating.ratingValue.toFixed(2)),
      ratingCount: rating.ratingCount,
    };
  }
  return ld;
}

const DAY_KEYS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function buildOpeningHoursSpec(hours: Record<string, unknown> | null): unknown[] {
  if (!hours || typeof hours !== 'object') return [];
  const out: unknown[] = [];
  for (const [day, schemaDay] of Object.entries(DAY_KEYS)) {
    const value = hours[day];
    if (typeof value !== 'string' || !value) continue;
    const match = value.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    if (!match) continue;
    out.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: schemaDay,
      opens: match[1],
      closes: match[2],
    });
  }
  return out;
}
