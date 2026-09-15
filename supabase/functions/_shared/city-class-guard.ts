/**
 * Class gate for the city -> Wikidata link.
 *
 * WHY THIS EXISTS. `cities_due_for_refresh(p_scope => 'qid_gap')` selects every
 * city carrying no `wikidata_qid`, ordered by POPULATION DESCENDING. That
 * ordering systematically front-loads the rows that are not cities at all: a
 * country or a first-level subdivision always out-populates a city, so the head
 * of that work list reads `Grossbritannien` (63.8M), `Illinois`, `Queensland`,
 * `Yorkshire`, `Long Island`, `Indiana`, `Tennessee` before it reaches a real
 * town. Those rows come from `data_source='personality-birth-place'`, a path
 * that mints a `cities` row from a personality's birth-place FREE TEXT.
 *
 * The link phase's pre-existing suspect-name heuristic cannot stop them. It
 * tests the name against `countries.name` + `regions.name`, and those columns
 * are ENGLISH: `Grossbritannien` matches nothing, exactly as CLAUDE.md already
 * records for `Hessen`, `Russland` and `Singapur`. Measured over the live
 * `qid_gap` top 1000, that heuristic flags 1 row.
 *
 * A wrong QID here is PERMANENT and self-reinforcing: `city_factual_sparql`
 * and `city-corroboration` rebuild facts from the identifier every week, so a
 * plausible-but-wrong link regenerates wrong data forever while a null one
 * regenerates nothing. Prefer NULL to a guess.
 *
 * WHY A WHITELIST AND NOT A DENYLIST. `tag-wiki-guard.ts` refuses IMPLAUSIBLE
 * classes, which is right for a glossary term: there the harm of a miss is a
 * missing link. Here the harm is asymmetric and permanent — publishing a US
 * state as a city on a travel platform, and re-deriving its "facts" weekly —
 * so this module inverts the polarity and adopts ONLY on a class it positively
 * recognises as a settlement. Under-reaching costs throughput on a cohort that
 * has produced zero resolutions in 45 days; over-reaching cannot be undone by
 * the engine that caused it.
 *
 * An unrecognised class is therefore REFUSED, and the caller reports the label
 * verbatim. That is the point: a systematic gap in this vocabulary has to show
 * up as a rising count of named labels a human can extend, never as silence.
 * Same reasoning as the `implausible_scalars` and `logodev_unauthorized`
 * tallies — a refusal nobody can see is indistinguishable from nothing to
 * refuse.
 */

/**
 * English P31 labels that mean "this entity is a populated place".
 *
 * Matched case-insensitively as substrings, because Wikidata spells the class
 * per country: `city of China`, `commune of France`, `municipality of Brazil`,
 * `city with county rights`, `urban-type settlement`. Anchoring would refuse
 * most of the world.
 */
const SETTLEMENT_PATTERNS: readonly RegExp[] = [
  /\bcity\b/i,
  /\btown\b/i,
  /\bvillage\b/i,
  /\bmunicipalit/i,
  /\bcommune\b/i,
  /\bsettlement\b/i,
  /\bhamlet\b/i,
  /\bborough\b/i,
  /\bmetropolis\b/i,
  /\bmegacity\b/i,
  /\bcapital\b/i,
  /\bsuburb\b/i,
  /\burban area\b/i,
  /\blocality\b/i,
]

/**
 * Labels that must refuse EVEN WHEN a settlement pattern also matches.
 *
 * Wikidata gives many administrative units a class whose label contains a
 * settlement word — `city-state`, `capital city of a country` on a country
 * row, `county seat`. The dangerous shape in this corpus is the entity that is
 * BOTH: `Distrito Federal`, `city-state`, `Stadtstaat`. A plain whitelist would
 * adopt them on the settlement word alone, so the override runs first.
 *
 * `county seat` is here rather than in the whitelist for the reason the capital
 * -scope work recorded: a bare `seat of` let Delphi's "seat of Pythia" pass as
 * a settlement. A seat IS usually a town, but the class is about the ROLE, and
 * this gate only ever needs to be right about the class it adopts on.
 */
const OVERRIDE_REFUSE_PATTERNS: readonly RegExp[] = [
  /\bcity-state\b/i,
  /\bcity state\b/i,
  /\bsovereign state\b/i,
  /\bcountry\b/i,
  /\bfederal state\b/i,
  /\bfederal district\b/i,
  /\bfederal entity\b/i,
  /\bstate of the united states\b/i,
  /\bu\.s\. state\b/i,
  /\bprovince\b/i,
  /\bprefecture\b/i,
  /\boblast\b/i,
  /\bvoivodeship\b/i,
  /\bcanton\b/i,
  /\bbundesland\b/i,
  /\bconstituent (state|country)\b/i,
  /\bcontinent\b/i,
  /\bisland\b/i,
  /\barchipelago\b/i,
  /\bpeninsula\b/i,
  /\bhistorical region\b/i,
  /\bgeographic region\b/i,
  /\badministrative territorial entity of\b/i,
  /\bfirst-level administrative\b/i,
]

export type CityClassVerdict =
  /** A recognised settlement class. The QID may be adopted. */
  | 'settlement'
  /** Read successfully and is not a settlement, or is a class we do not know. */
  | 'refused'
  /**
   * The class COULD NOT BE READ — no QID to ask about, or the wbgetentities
   * call failed. Distinct from `refused` on purpose: see `cityClassVerdict`.
   */
  | 'undetermined'

export interface CityClassOutcome {
  verdict: CityClassVerdict
  /** Machine-readable cause, e.g. `override:province` or `unrecognised`. */
  reason: string | null
  /** The label that decided it, verbatim, for the run report. */
  label: string | null
}

/**
 * Decide whether a resolved Wikidata entity may be adopted as a city's identity.
 *
 * `p31Labels === null` means the class could not be determined and returns
 * `undetermined` rather than `refused`. THE CALLER MUST TREAT THE TWO
 * DIFFERENTLY: both refuse to adopt the QID, but only `refused` may count an
 * attempt toward the terminal `data_unavailable` sentinel. Counting a transport
 * failure would let one Wikidata outage permanently write off every row the
 * sweep happened to touch — the logo.dev failure, where 6,498 venues were
 * stamped `logo_fetched_at` while the token was dead and an unknown share were
 * never really probed. Absence of evidence must not be recorded as evidence of
 * absence.
 *
 * `[]` is a DIFFERENT answer from `null` and is refused normally: the entity was
 * read and genuinely carries no non-deprecated P31, which is not a settlement
 * claim we can stand behind.
 */
export function cityClassVerdict(
  p31Labels: readonly string[] | null,
): CityClassOutcome {
  if (p31Labels === null) {
    return { verdict: 'undetermined', reason: 'class_unreadable', label: null }
  }
  if (p31Labels.length === 0) {
    return { verdict: 'refused', reason: 'no_class', label: null }
  }
  // The override runs over EVERY label before any whitelist match, so an entity
  // carrying both `megacity` and `federal entity of Mexico` refuses.
  for (const label of p31Labels) {
    for (const re of OVERRIDE_REFUSE_PATTERNS) {
      if (re.test(label)) {
        return { verdict: 'refused', reason: `override:${re.source}`, label }
      }
    }
  }
  for (const label of p31Labels) {
    if (SETTLEMENT_PATTERNS.some((re) => re.test(label))) {
      return { verdict: 'settlement', reason: null, label }
    }
  }
  return { verdict: 'refused', reason: 'unrecognised', label: p31Labels[0] }
}

/**
 * Scopes `public.cities_due_for_refresh(p_limit, p_scope)` implements.
 *
 * Read off the live function definition, not guessed. This constant exists
 * because the edge function's own allowlist silently REWROTE any scope outside
 * it to `content_first`: `city_qid_gap_link` and `city_alias_harvest` both post
 * a scope that was missing from that list, so both crons spent their whole life
 * re-working the `content_first` list while returning 200 and booking
 * `last_run_status='success'`. Measured consequence: the 1,538 unlinked
 * birth-place cities the `qid_gap` scope ranks first had ZERO `wikidata_link`
 * attempts on record — not a miss, not a terminal stamp, never once processed.
 *
 * Keep this in step with the selector. `cityScopeDrift.test.ts` fails if a
 * registered cron posts a scope that is not here.
 */
export const CITY_REFRESH_SCOPES = [
  'content_first',
  'content_only',
  'all',
  'qid_gap',
  'alias_gap',
] as const

export type CityRefreshScope = typeof CITY_REFRESH_SCOPES[number]

export function isCityRefreshScope(s: string | undefined): s is CityRefreshScope {
  return CITY_REFRESH_SCOPES.includes((s ?? '') as CityRefreshScope)
}
