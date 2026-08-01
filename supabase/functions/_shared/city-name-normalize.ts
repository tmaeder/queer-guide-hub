// City name → external-lookup query candidates.
//
// Why this exists: 43% of `cities` rows came from bulk imports
// (data_source='personality-birth-place', nominatim geocodes) that stored a
// qualified, often German-localized label rather than a toponym —
// "Kapstadt, Südafrika", "El Cajon, Kalifornien, USA", "Arles,
// Provence-Alpes-Côte-d'Azur". Those strings 404 the Wikipedia REST title
// endpoint and return zero wbsearchentities hits, so city-factual-backfill
// filled nothing for 36 days while re-visiting the same ~545 rows.
//
// The fix is only comma-stripping. Verified against the live API:
//   wbsearchentities?search=Kapstadt,+Südafrika&language=en -> []
//   wbsearchentities?search=Kapstadt&language=en            -> Q5465 "Cape Town",
//                                        "city in the Western Cape, South Africa"
// `language=en` already resolves German exonyms and returns English
// descriptions, so the caller's existing place-type + country matcher works
// unchanged. No translation layer is needed — and `cities.name_en` is filled on
// 7 of 5,113 rows, so preferring it would be a no-op.
//
// Pure, no I/O. Unit-tested in city-name-normalize.test.ts.

import { COUNTRY_ALIASES } from './geo-normalize.ts'

export type SuspectReason = 'numeric' | 'placeholder' | 'too_short' | 'country_or_region_only'

export interface CityNameCandidates {
  /** Ordered lookup attempts, most-specific first, deduped, never empty. */
  queries: string[]
  /** The bare toponym with region/country qualifiers removed. */
  base: string
  /** True when the row does not look like a city at all. Advisory only. */
  suspect: boolean
  suspectReason?: SuspectReason
}

export interface CityNameOptions {
  /** English country name from countries.name — used to disambiguate. */
  country?: string | null
  /** Lowercased names of known countries + regions, for the suspect check. */
  knownPlaceNames?: Set<string>
}

const SEGMENT_SPLIT = /\s*(?:,|\s[-–—]\s)\s*/
const PLACEHOLDER_RE = /^[\s—–-]*n\s*\/?\s*a[\s.]*$/i
const DASHES_ONLY_RE = /^[\s—–-]+$/
const LEADING_NUMBER_RE = /^\d/
const TRAILING_PAREN_RE = /\s*\([^()]*\)\s*$/

/** Trim, collapse internal whitespace, NFC-normalize, drop a trailing parenthetical. */
function tidy(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(TRAILING_PAREN_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isKnownPlaceName(candidate: string, known?: Set<string>): boolean {
  const key = candidate.toLowerCase()
  if (known?.has(key)) return true
  // COUNTRY_ALIASES keys are lowercase local names / ISO-2 / demonyms.
  // A city row literally named "Indonesien" or "Baskenland" is not a city.
  return Object.prototype.hasOwnProperty.call(COUNTRY_ALIASES, key)
}

export function cityNameCandidates(
  name: string | null | undefined,
  opts: CityNameOptions = {},
): CityNameCandidates {
  const original = tidy(name ?? '')
  const segments = original.split(SEGMENT_SPLIT).map(s => s.trim()).filter(Boolean)
  const base = segments[0] ?? ''

  const queries: string[] = []
  const push = (q: string) => {
    const v = q.trim()
    if (v && !queries.includes(v)) queries.push(v)
  }
  const country = opts.country?.trim()
  // Country-qualified first (disambiguates "Springfield"), then the bare
  // toponym (this is the one that recovers exonyms), then the raw string.
  if (base && country) push(`${base}, ${country}`)
  push(base)
  push(original)

  let suspectReason: SuspectReason | undefined
  if (!original || PLACEHOLDER_RE.test(original) || DASHES_ONLY_RE.test(original)) {
    suspectReason = 'placeholder'
  } else if (LEADING_NUMBER_RE.test(base)) {
    suspectReason = 'numeric'
  } else if (base.length < 2) {
    suspectReason = 'too_short'
  } else if (isKnownPlaceName(base, opts.knownPlaceNames)) {
    suspectReason = 'country_or_region_only'
  }

  return { queries, base, suspect: suspectReason !== undefined, suspectReason }
}
