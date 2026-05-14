import { z } from 'zod';
import type { PersonalityFilters, PersonalitySort } from '@/hooks/usePersonalities';

export const SORTS = ['featured', 'az', 'za', 'popular', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

const LETTER_RE = /^[A-Z]$|^#$/;

export const STATUSES = ['living', 'historical'] as const;
export type Status = (typeof STATUSES)[number];

export const VIEWS = ['grid', 'timeline', 'map'] as const;
export type View = (typeof VIEWS)[number];

/** Curated era presets — birth year ranges that map to meaningful chapters of LGBTQ+ history. */
export const ERAS = {
  'pre-stonewall': { label: 'Pre-Stonewall', min: 1800, max: 1944 },
  'mid-century': { label: 'Mid-century (1945–68)', min: 1945, max: 1968 },
  'stonewall': { label: 'Stonewall era (1969–80)', min: 1969, max: 1980 },
  'aids-crisis': { label: 'AIDS crisis (1981–96)', min: 1981, max: 1996 },
  'modern': { label: 'Modern (1997–)', min: 1997, max: 2099 },
} as const;
export type EraKey = keyof typeof ERAS;

const sortSchema = z.enum(SORTS).catch('featured');
const viewSchema = z.enum(VIEWS).catch('grid');
const eraSchema = z
  .string()
  .refine((v) => v in ERAS)
  .catch(undefined as unknown as EraKey);
const letterSchema = z
  .string()
  .transform((v) => v.toUpperCase())
  .refine((v) => LETTER_RE.test(v))
  .catch(undefined as unknown as string);
const statusSchema = z.enum(STATUSES).catch(undefined as unknown as Status);
const boolFlagSchema = z.literal('1').catch(undefined as unknown as '1');
const querySchema = z.string().trim().min(1).max(100).catch(undefined as unknown as string);
const professionSchema = z.string().trim().min(1).max(60).catch(undefined as unknown as string);
const tagSchema = z.string().trim().min(1).max(60).catch(undefined as unknown as string);

export interface ParseResult {
  filters: PersonalityFilters;
  view: View;
  era?: EraKey;
  changed: boolean; // true if input URL had values that got coerced/dropped
}

/**
 * Parse and validate URL search params into PersonalityFilters.
 *
 * - Unknown sort, malformed letter, or profession not in the provided allowlist
 *   are dropped silently.
 * - When validProfessions is null, profession is accepted unchecked (the caller
 *   can re-validate once facets load).
 * - `changed` is true if the canonical serialization differs from the input,
 *   so the caller can rewrite the URL with `setSearchParams(replace: true)`.
 */
export function parseFilters(
  searchParams: URLSearchParams,
  validProfessions: ReadonlyArray<string> | null = null,
): ParseResult {
  const rawProfession = searchParams.get('profession') ?? undefined;
  const rawQ = searchParams.get('q') ?? undefined;
  const rawLetter = searchParams.get('letter') ?? undefined;
  const rawSort = searchParams.get('sort') ?? undefined;
  const rawStatus = searchParams.get('status') ?? undefined;
  const rawFeatured = searchParams.get('featured') ?? undefined;
  const rawIncludeAdult = searchParams.get('include_adult') ?? undefined;
  const rawView = searchParams.get('view') ?? undefined;
  const rawEra = searchParams.get('era') ?? undefined;
  const rawTag = searchParams.get('tag') ?? undefined;

  const sort: Sort = rawSort ? (sortSchema.parse(rawSort) ?? 'featured') : 'featured';
  const view: View = rawView ? (viewSchema.parse(rawView) ?? 'grid') : 'grid';
  const era: EraKey | undefined = rawEra ? (eraSchema.parse(rawEra) as EraKey | undefined) : undefined;
  const tag = rawTag ? tagSchema.parse(rawTag) : undefined;
  const letter = rawLetter ? letterSchema.parse(rawLetter) : undefined;
  const status = rawStatus ? statusSchema.parse(rawStatus) : undefined;
  const featured = rawFeatured ? boolFlagSchema.parse(rawFeatured) : undefined;
  const includeAdult = rawIncludeAdult ? boolFlagSchema.parse(rawIncludeAdult) : undefined;
  const q = rawQ ? querySchema.parse(rawQ) : undefined;
  let profession: string | undefined = rawProfession
    ? professionSchema.parse(rawProfession)
    : undefined;

  if (profession && validProfessions) {
    const match = validProfessions.find(
      (p) => p.toLowerCase() === profession!.toLowerCase(),
    );
    profession = match ?? undefined;
  }

  const filters: PersonalityFilters = {
    sortBy: sort,
    profession,
    search: q,
    name_starts_with: letter,
    is_living: status === 'living' ? true : status === 'historical' ? false : undefined,
    featured_only: featured === '1' ? true : undefined,
    exclude_adult: includeAdult === '1' ? false : true,
    birth_year_min: era ? ERAS[era].min : undefined,
    birth_year_max: era ? ERAS[era].max : undefined,
    tag,
  };

  const known = new Set([
    'profession',
    'q',
    'letter',
    'sort',
    'status',
    'featured',
    'include_adult',
    'view',
    'era',
    'tag',
    'page',
  ]);
  const out = serializeFilters(filters);
  let changed = false;
  // Any unknown key in the URL means we want to rewrite it away.
  for (const [k] of searchParams) {
    if (!known.has(k)) {
      changed = true;
      break;
    }
  }
  // Any known key whose canonical value differs from the raw input also counts.
  if (!changed) {
    for (const k of known) {
      if (k === 'page') continue; // page is managed separately
      const raw = searchParams.get(k);
      const canonical = out.get(k);
      if ((raw ?? '') !== (canonical ?? '')) {
        changed = true;
        break;
      }
    }
  }
  return { filters, view, era, changed };
}

/** Reverse-lookup an EraKey from a min/max year pair, for keeping URL canonical. */
export function eraFromYears(min?: number, max?: number): EraKey | undefined {
  if (typeof min !== 'number' || typeof max !== 'number') return undefined;
  return (Object.keys(ERAS) as EraKey[]).find(
    (k) => ERAS[k].min === min && ERAS[k].max === max,
  );
}

export function serializeFilters(
  filters: PersonalityFilters,
  options: { view?: View } = {},
): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.profession) p.set('profession', filters.profession);
  if (filters.search) p.set('q', filters.search);
  if (filters.name_starts_with) p.set('letter', filters.name_starts_with);
  if (filters.sortBy && filters.sortBy !== 'featured') p.set('sort', filters.sortBy);
  if (filters.is_living === true) p.set('status', 'living');
  if (filters.is_living === false) p.set('status', 'historical');
  if (filters.featured_only) p.set('featured', '1');
  if (filters.exclude_adult === false) p.set('include_adult', '1');
  const era = eraFromYears(filters.birth_year_min, filters.birth_year_max);
  if (era) p.set('era', era);
  if (filters.tag) p.set('tag', filters.tag);
  if (options.view && options.view !== 'grid') p.set('view', options.view);
  return p;
}

export type { PersonalityFilters, PersonalitySort };
