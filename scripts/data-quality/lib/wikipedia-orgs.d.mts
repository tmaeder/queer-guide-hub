/**
 * Types for the Wikipedia LGBTQ advocacy import transforms. These exist so the
 * unit tests under src/ can import the .mjs the import script also uses,
 * without the module resolving to `any` (which would let the tests keep passing
 * against a signature that no longer exists). Same reason as the sibling
 * generate-tag-merge-migration.d.mts.
 */

/** A crawl record, or the collapsed entity built from several of them. */
export interface WikipediaOrgRecord {
  title: string;
  titles?: string[];
  qid?: string | null;
  wikidataLabel?: string | null;
  name?: string;
  roots?: string[];
  paths?: string[];
  categoryCountries?: string[];
  p31?: string[];
  p31Labels?: string[];
  p17?: string[];
  p17Labels?: string[];
  p856?: string[];
  p571?: string[];
  p576?: string[];
}

export type CountryStatus =
  'corroborated' | 'category_only' | 'p17_only' | 'conflict' | 'multi_country' | 'unresolved';

export interface CountryDecision {
  country: string | null;
  status: CountryStatus;
  category: string | string[] | null;
  p17: string[];
}

export interface LifespanDecision {
  foundedAt: string | null;
  dissolvedAt: string | null;
  isDefunct: boolean;
  defunctSource: 'both' | 'category' | 'p576' | null;
}

export interface MergeVerdict {
  ok: boolean;
  reason: string | null;
}

/** Hand-read exclusions: article title -> the reason it is not imported. */
export const EXCLUSIONS: Map<string, string>;

export function resolveCategoryCountry(raw: string | null | undefined): string | null;
export function countryKey(value: string | null | undefined): string;
export function nameKey(value: string | null | undefined): string;
export function wikidataDate(value: unknown): string | null;
export function decideCountry(record: Partial<WikipediaOrgRecord>): CountryDecision;
export function decideLifespan(record: Partial<WikipediaOrgRecord>): LifespanDecision;
export function mayAutoMerge(input: {
  wikiCountry: string | null;
  wikiCountryStatus: CountryStatus;
  dbCountry: string | null;
}): MergeVerdict;
export function collapseRecords(
  records: WikipediaOrgRecord[],
): (WikipediaOrgRecord & { titles: string[]; name: string })[];
