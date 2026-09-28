export interface GayOutVenueRecord {
  source_id: string;
  url: string;
  name: string;
  section: string;
  category: string;
  region_slug?: string;
  country_slug?: string;
  city_slug?: string;
  country?: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  lastmod?: string | null;
  detail_status?: string;
  [key: string]: unknown;
}

export interface NormalizedGayOutVenue {
  entityType: 'venue';
  sourceName: 'gayout';
  sourceId: string;
  name: string;
  category: string;
  location: Record<string, unknown>;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export const GAYOUT_SECTIONS: ReadonlySet<string>;
export function titleCaseSlug(value: unknown): string;
export function parseVenueUrl(input: string, lastmod?: string | null): GayOutVenueRecord | null;
export function parseSitemap(text: string): GayOutVenueRecord[];
export function parseVenueHtml(html: string, seed: GayOutVenueRecord): GayOutVenueRecord;
export function toNormalizedVenue(record: GayOutVenueRecord): NormalizedGayOutVenue;
