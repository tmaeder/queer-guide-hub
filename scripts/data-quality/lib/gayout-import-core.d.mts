export interface GayOutVenueSeed {
  source_id: string;
  url: string;
  lastmod: string | null;
  region_slug: string;
  country_slug: string;
  city_slug: string;
  section: string;
  category: string;
  name_fallback: string;
}

export interface GayOutVenueFacts extends Partial<GayOutVenueSeed> {
  source_id: string;
  url: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  website?: string;
  same_as?: string[];
  schema_types?: string[];
  detail_status?: string;
  final_url?: string;
  official_evidence?: string;
  source_reported_address?: string;
  coordinate_evidence?: string;
  coordinate_withheld_reason?: string;
  gayout_numeric_id?: string | number | null;
}

export interface NormalizedGayOutVenue {
  entityType: 'venue';
  sourceId: string;
  sourceName: 'gayout';
  name: string | undefined;
  category: string;
  location: { city?: string; country?: string; address?: string; lat?: number; lng?: number };
  contacts?: { phone?: string; email?: string; website?: string };
  tags: string[];
  metadata: Record<string, unknown>;
}

export const GAYOUT_SECTIONS: Set<string>;
export function titleCaseSlug(value: unknown): string;
export function parseVenueUrl(input: string, lastmod?: string | null): GayOutVenueSeed | null;
export function parseSitemap(text: string): GayOutVenueSeed[];
export function parseVenueHtml(html: string, seed: GayOutVenueSeed): GayOutVenueSeed & GayOutVenueFacts;
export function toNormalizedVenue(record: GayOutVenueFacts): NormalizedGayOutVenue;
