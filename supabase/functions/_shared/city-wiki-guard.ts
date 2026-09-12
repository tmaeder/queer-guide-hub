// Guards for adopting a Wikipedia article as the grounding source for a CITY.
//
// WHY THIS EXISTS. `city-agentic-enrich` fetches its grounding extract with
// `action=query&prop=extracts&redirects=1&titles=<cities.name>` and adopts whatever
// comes back. The API follows redirects and a disambiguation page carries a perfectly
// long extract, so a city whose `wikipedia_title` was never cached silently inherits
// the identity of whatever article owns its bare name. Measured on prod 2026-09-12
// across the 79 agentic-enriched cities with no `wikidata_qid`, 14 were wrong:
//
//   Daphne, Alabama    -> the Greek myth       ("a figure in Greek mythology")
//   Delphi, Indiana    -> the Greek sanctuary  ("an ancient sacred precinct")
//   Parma, Ohio        -> Parma, Italy         ("prosciutto, cheese")
//   Brisbane, Calif.   -> Brisbane, Australia
//   Highland, Calif.   -> the common noun      ("areas of high elevation")
//   West, Texas        -> the compass point    ("one of the four cardinal directions")
//   Englewood, Colo.   -> the etymology of the NAME
//   + 7 disambiguation pages (Ephrata, Milton, Morton, Spooner, Point Pleasant,
//     Castle Rock, Fairview Heights)
//
// This is the namesake chimera `tag-wiki-guard.ts` documents for glossary tags, one
// entity type over — and it is WORSE here, because `cities.description` is not
// review-gated: it auto-publishes at confidence >= 0.8 onto an `seo_indexable` page.
// /city/daphne served the Apollo myth to crawlers.
//
// **The refusal prose was a SYMPTOM, not a separate defect.** Milton, Morton and
// Spooner published "the sources do not provide any information about LGBTQ+..." —
// the model was handed a disambiguation page, correctly found no city in it, and said
// so. Sealing the source removes the cause; no separate output filter is needed.
//
// THE FIX IS RESOLUTION, NOT REFUSAL. Every one of the 14 has a correct article under
// its region-qualified title ("Daphne, Alabama", "Morton, Illinois"), so the caller
// retries there before giving up. Measured: 14 of 14 corrected — 13 rescued onto the
// right article, 1 (Esmeralda, Camagüey — no such English article) correctly refused.
//
// Collateral is ZERO BY CONSTRUCTION rather than by measurement: the retry is reachable
// only where the existing path ALREADY failed a gate, so the 64 cities that resolve
// correctly today are not touched by this code at all.

/** Lowercase and strip diacritics. Not alphanumeric-only: word boundaries matter here. */
export function foldText(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * A disambiguation page. Detected from the extract's own opening rather than
 * `pageprops`, because the extract is already in hand and this costs no second request.
 * Real leads from the audit: "Ephrata may refer to:", "Milton may refer to:".
 */
const DISAMBIGUATION = /\b(?:may|can) (?:also )?refer to\s*:/i

/**
 * Vocabulary a settlement article uses about ITSELF in its first sentence. Derived
 * from the 79-row audit, not invented: every correctly-resolved city in that set
 * matches one of these in its lead, and the seven wrong-subject articles match none.
 *
 * `island country` and `city-state` are here because a city-state is a city —
 * without them Singapore's own article ("is an island country in Southeast Asia")
 * is refused, which was a measured false block. `local board` likewise: Auckland's
 * Henderson-Massey is a real row whose article opens "is one of the 21 local boards".
 */
const PLACE_LEAD = new RegExp(
  '\\b(' + [
    'cit(?:y|ies)', 'city-state', 'town', 'village', 'borough',
    'municipalit(?:y|ies)', 'commune', 'township', 'hamlet',
    'census-designated place', 'cdp', 'district', 'suburb', 'parish',
    'localit(?:y|ies)', 'settlement', 'count(?:y|ies)', 'prefecture', 'ward',
    'neighbourhood', 'neighborhood', 'province', 'capital', 'metropolis',
    'urban area', 'kommun', 'vald', 'unitary authority', 'local board',
    'regional municipality', 'island country', 'sovereign state',
    // `county seat`, never a bare `seat of`: Delphi's article calls the sanctuary
    // "the seat of Pythia, the major oracle", which let an ancient Greek precinct
    // pass the place gate for Delphi, Indiana.
    'county seat', 'seat of government', 'port city', 'resort town', 'spa town',
  ].join('|') + ')\\b',
)

/**
 * How much of the extract counts as the lead. A place article states what it is and
 * where it is in its first sentence or two; searching the WHOLE extract instead was
 * measured and REJECTED — the Brisbane, Australia article mentions "United States"
 * somewhere further down, which silently corroborated it for Brisbane, California.
 */
export const LEAD_CHARS = 400

/**
 * A region value we can compare. Mirrors the stance of `city-collision-guard.ts`:
 * an opaque numeric code ("07") or an unexpanded short code carries no signal, so it
 * is absence of evidence rather than a contradiction.
 */
export function usableRegion(region: string | null | undefined): string | null {
  const r = (region ?? '').trim()
  if (!r || /^\d+$/.test(r) || r.length <= 3) return null
  return r
}

export interface CityIdentity {
  name: string
  region_name?: string | null
  /** English country name, for corroboration when the region is unusable. */
  countryName?: string | null
}

export type CityWikiRefusal = 'disambiguation' | 'not-place' | 'uncorroborated' | 'no-extract'

export interface CityWikiVerdict {
  adopt: boolean
  reason: 'ok' | CityWikiRefusal
  detail?: string
}

/**
 * May this extract ground enrichment for this city?
 *
 * Three gates, all of which must pass. Note that title agreement is deliberately NOT
 * one of them: asking for "Daphne" and being served the article *titled* "Daphne" is
 * exactly what this failure looks like, so name agreement is the bug's signature
 * rather than evidence against it — the same reason `tag-wiki-guard.ts` refuses to
 * rest on its title gate alone.
 */
export function cityWikiVerdict(
  extract: string | null | undefined,
  city: CityIdentity,
): CityWikiVerdict {
  if (!extract || !extract.trim()) return { adopt: false, reason: 'no-extract' }

  const lead = extract.slice(0, LEAD_CHARS)
  if (DISAMBIGUATION.test(lead)) return { adopt: false, reason: 'disambiguation' }

  const folded = foldText(lead)
  if (!PLACE_LEAD.test(folded)) {
    return { adopt: false, reason: 'not-place', detail: lead.slice(0, 80).trim() }
  }

  // Corroboration: the lead must place the subject where we think this city is.
  // Either signal suffices — a US city's lead names its state far more often than
  // "United States", while "Genève" has no usable region and its article names
  // Switzerland.
  const region = usableRegion(city.region_name)
  const country = (city.countryName ?? '').trim()
  const corroborated =
    (!!country && folded.includes(foldText(country))) ||
    (!!region && folded.includes(foldText(region)))
  if (!corroborated) {
    return {
      adopt: false,
      reason: 'uncorroborated',
      detail: `lead names neither ${region ?? '(no region)'} nor ${country || '(no country)'}`,
    }
  }

  return { adopt: true, reason: 'ok' }
}

/**
 * The title to retry when the bare name was refused: Wikipedia's own convention for
 * a name shared by several places. Returns null when the row has no usable region,
 * because "Genève, " is not a title and guessing one is what this module exists to stop.
 */
export function regionQualifiedTitle(city: CityIdentity): string | null {
  const region = usableRegion(city.region_name)
  if (!region) return null
  const name = (city.name ?? '').trim()
  if (!name) return null
  // Already qualified ("Brisbane, California") — retrying would build a double comma.
  if (foldText(name).includes(`, ${foldText(region)}`)) return null
  return `${name}, ${region}`
}
