export interface HotelVibe {
  slug: string;
  label: string;
}

// Curated v1. Slug must match a row in unified_tags for the chip to filter.
// Order is the display order in the chip row.
export const HOTEL_VIBES: readonly HotelVibe[] = [
  { slug: 'beach', label: 'Beach' },
  { slug: 'design', label: 'Design' },
  { slug: 'boutique', label: 'Boutique' },
  { slug: 'party', label: 'Party' },
  { slug: 'wellness', label: 'Wellness' },
  { slug: 'romantic', label: 'Romantic' },
  { slug: 'family', label: 'Family' },
  { slug: 'adults-only', label: 'Adults-only' },
];

export const HOTEL_VIBE_LABEL: Record<string, string> = Object.fromEntries(
  HOTEL_VIBES.map((v) => [v.slug, v.label]),
);
