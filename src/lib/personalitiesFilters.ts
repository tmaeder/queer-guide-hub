import { z } from 'zod';
import type { PersonalityFilters, PersonalitySort } from '@/hooks/usePersonalities';

export const SORTS = ['featured', 'az', 'za', 'popular', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

const LETTER_RE = /^[A-Z]$|^#$/;

export const STATUSES = ['living', 'historical'] as const;
export type Status = (typeof STATUSES)[number];

const sortSchema = z.enum(SORTS).catch('featured');
const letterSchema = z
  .string()
  .transform((v) => v.toUpperCase())
  .refine((v) => LETTER_RE.test(v))
  .catch(undefined as unknown as string);
const statusSchema = z.enum(STATUSES).catch(undefined as unknown as Status);
const boolFlagSchema = z.literal('1').catch(undefined as unknown as '1');
const querySchema = z.string().trim().min(1).max(100).catch(undefined as unknown as string);
const professionSchema = z.string().trim().min(1).max(60).catch(undefined as unknown as string);

export interface ParseResult {
  filters: PersonalityFilters;
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

  const sort: Sort = rawSort ? (sortSchema.parse(rawSort) ?? 'featured') : 'featured';
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
  };

  const known = new Set([
    'profession',
    'q',
    'letter',
    'sort',
    'status',
    'featured',
    'include_adult',
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
      const raw = searchParams.get(k);
      const canonical = out.get(k);
      if ((raw ?? '') !== (canonical ?? '')) {
        changed = true;
        break;
      }
    }
  }
  return { filters, changed };
}

export function serializeFilters(filters: PersonalityFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.profession) p.set('profession', filters.profession);
  if (filters.search) p.set('q', filters.search);
  if (filters.name_starts_with) p.set('letter', filters.name_starts_with);
  if (filters.sortBy && filters.sortBy !== 'featured') p.set('sort', filters.sortBy);
  if (filters.is_living === true) p.set('status', 'living');
  if (filters.is_living === false) p.set('status', 'historical');
  if (filters.featured_only) p.set('featured', '1');
  if (filters.exclude_adult === false) p.set('include_adult', '1');
  return p;
}

export type { PersonalityFilters, PersonalitySort };
