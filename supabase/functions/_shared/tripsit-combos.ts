// ============================================================
// TripSit combos.json — parse, vocabulary mapping, pair collapse.
//
// Pure and dependency-free so it can be unit-tested without a network or a
// database, the same split as `_shared/aids-ch-parse.ts`. The edge function
// `source-tripsit` owns fetching and writing; everything that decides what a
// row MEANS lives here.
//
// UPSTREAM SHAPE. `combos.json` is a nested object keyed by TripSit's own
// substance vocabulary: `combos[a][b] = { status, note? }`. It stores BOTH
// directions, so the file holds 841 directed entries over 421 unordered pairs
// (measured 2026-08-30, unchanged since the 20260909172500 import). Our table
// stores one row per unordered pair, so collapsing is this module's job.
//
// THE SLUG MAP IS EXPLICIT AND EXHAUSTIVE, AND A SLUG-EQUALS-KEY FALLBACK WAS
// MEASURED AND REJECTED. It looks safe — `unified_tags.slug` is unique, so
// there is no ambiguity to misresolve, which is the trap §2.4 of the open-data
// doc warns about. It is still wrong here, because the collision is not
// ambiguity but IDENTITY: two upstream keys resolve to slugs that exist and
// are dead.
//
//     upstream `amphetamines` → slug `amphetamines` exists, status `merged`
//                               (the live tag is `amphetamine`)
//     upstream `mushrooms`    → slug `mushrooms`    exists, status `deprecated`
//                               (we file the compound, `psilocybin`)
//
// Both were checked against production on 2026-08-30. A fallback would have
// filed interactions against those two rows and the damage would have been
// INVISIBLE: `get_substance_interactions`, `get_substance_interaction_pair`
// and `substance_interaction_matrix` all filter `unified_tags.status =
// 'active'`, so the rows would exist, satisfy every constraint, and render
// nowhere. So an unmapped upstream key is REPORTED, never guessed — a missing
// interaction is recoverable, one filed against a dead tag is not.
//
// The 31 entries below are not hand-written. They were recovered from the
// `source_pair` column of the 421 shipped rows, which exists for exactly this
// ("kept so a re-import can be diffed against what we actually stored"), and
// the recovery was consistent: every upstream key mapped to exactly one slug.
// ============================================================

export const TRIPSIT_COMBOS_URL = 'https://raw.githubusercontent.com/TripSit/drugs/main/combos.json'

/** Value of `substance_interactions.source` for every row this path owns. */
export const TRIPSIT_SOURCE = 'tripsit'

/** Value of `substance_interactions.source_url`. The poster is what people know. */
export const TRIPSIT_SOURCE_URL = 'https://combo.tripsit.me/'

/** Circuit-breaker key. Registered in the migration; an unseeded breaker never trips. */
export const TRIPSIT_CIRCUIT = 'tripsit'

/**
 * Upstream display label → our normalised status key.
 *
 * Deliberately NOT a fallback to `'unknown'`. Our `unknown` means "no rating
 * published"; silently mapping an unrecognised label onto it would turn a new
 * upstream severity tier into a shrug on a page whose whole purpose is to warn.
 * An unmapped label leaves the existing row exactly as it is and is reported.
 */
export const TRIPSIT_STATUS_MAP: Readonly<Record<string, string>> = Object.freeze({
  Dangerous: 'dangerous',
  Unsafe: 'unsafe',
  Caution: 'caution',
  'Low Risk & Decrease': 'low_risk_decrease',
  'Low Risk & No Synergy': 'low_risk_no_synergy',
  'Low Risk & Synergy': 'low_risk_synergy',
})

/**
 * Severity order, mirroring `public.substance_interaction_rank`. Lower is worse.
 * Used only to resolve a cross-direction disagreement in the worse direction.
 */
const STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  dangerous: 1,
  unsafe: 2,
  caution: 3,
  unknown: 4,
  low_risk_decrease: 5,
  low_risk_no_synergy: 6,
  low_risk_synergy: 7,
})

/**
 * TripSit substance key → `unified_tags.slug`.
 *
 * Five entries are genuine translations rather than identities, and each is the
 * decision the original import documented:
 *   `2c-x`         → `2c-b`             upstream charts the family; 2C-B is its
 *                                       archetype and already answers to "2C-x"
 *   `dox`          → `dom-doi-dob-doc`
 *   `mushrooms`    → `psilocybin`       we file the compound, not the fungus
 *   `ghb/gbl`      → `ghb`
 *   `amphetamines` → `amphetamine`
 *   `nitrous`      → `nitrous-oxide`
 */
export const TRIPSIT_SLUG_MAP: Readonly<Record<string, string>> = Object.freeze({
  '2c-t-x': '2c-t-x',
  '2c-x': '2c-b',
  '5-meo-xxt': '5-meo-xxt',
  alcohol: 'alcohol',
  amphetamines: 'amphetamine',
  amt: 'amt',
  benzodiazepines: 'benzodiazepines',
  caffeine: 'caffeine',
  cannabis: 'cannabis',
  cocaine: 'cocaine',
  dextromethorphan: 'dextromethorphan',
  diphenhydramine: 'diphenhydramine',
  dmt: 'dmt',
  dox: 'dom-doi-dob-doc',
  'ghb/gbl': 'ghb',
  ketamine: 'ketamine',
  lithium: 'lithium',
  lsd: 'lsd',
  maois: 'maois',
  mdma: 'mdma',
  mephedrone: 'mephedrone',
  mescaline: 'mescaline',
  mushrooms: 'psilocybin',
  mxe: 'mxe',
  nbomes: 'nbomes',
  nitrous: 'nitrous-oxide',
  opioids: 'opioids',
  pcp: 'pcp',
  pregabalin: 'pregabalin',
  ssris: 'ssris',
  tramadol: 'tramadol',
})

/** One collapsed, mapped pair, ready for `sync_tripsit_interactions`. */
export interface TripsitPair {
  /** `unified_tags.slug` for the upstream key that sorts first. */
  slug_a: string
  slug_b: string
  /** Our status key, or `null` when the upstream label is not in the map. */
  status: string | null
  note: string | null
  /** The upstream key pair, `a|b` in upstream sort order. Stored as `source_pair`. */
  source_pair: string
}

export interface TripsitParseResult {
  pairs: TripsitPair[]
  /** Upstream substance keys with no entry in TRIPSIT_SLUG_MAP. Never guessed. */
  unmappedKeys: string[]
  /** Upstream status labels with no entry in TRIPSIT_STATUS_MAP. */
  unmappedStatuses: string[]
  /** Pairs whose two directions published different ratings. Should stay empty. */
  disagreements: Array<{ pair: string; statuses: string[]; kept: string }>
  /** Directed entries read from the file, before collapsing. */
  directed: number
  /** Distinct upstream substance keys at the top level of the file. */
  substances: number
}

interface RawEntry {
  status?: unknown
  note?: unknown
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Collapse `combos.json` to one mapped row per unordered pair.
 *
 * DETERMINISM IS LOAD-BEARING, not tidiness. The sync stamps `updated_at` only
 * when content changed, so a rule that depends on object iteration order would
 * make two identical runs disagree and flap `updated_at` on every pass. Both
 * the kept note and the recorded `source_pair` therefore come from the
 * direction whose upstream key sorts first.
 *
 * Two upstream pairs (`amphetamines|ghb/gbl`, `amphetamines|opioids`) carry
 * genuinely different prose per direction — paraphrases of the same warning —
 * and the 2026-09 import took one of each without a rule. Applying the rule
 * rewrites exactly one stored note, which is expected on first run.
 *
 * A cross-direction STATUS disagreement is different: it is upstream
 * contradicting itself about a safety rating. There were zero of these at
 * import and zero when re-measured. If one appears the WORSE rating is kept —
 * the direction that under-warns is the one to discard — and it is reported so
 * a human sees it rather than it passing as ordinary data.
 */
export function pairsFromCombos(raw: unknown): TripsitParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('tripsit combos.json is not an object — refusing to treat that as an empty matrix')
  }
  const combos = raw as Record<string, unknown>
  const keys = Object.keys(combos)
  if (keys.length === 0) {
    throw new Error('tripsit combos.json has no substances — refusing to treat that as an empty matrix')
  }

  const unmappedKeys = new Set<string>()
  const unmappedStatuses = new Set<string>()
  const disagreements: TripsitParseResult['disagreements'] = []
  // canonical upstream pair key -> the two directed readings
  const seen = new Map<string, { lo: string; hi: string; entries: Map<string, RawEntry> }>()
  let directed = 0

  for (const a of keys) {
    const inner = combos[a]
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) continue
    for (const [b, value] of Object.entries(inner as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      directed++
      if (a === b) continue // a substance combined with itself is not a pair
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const slot = seen.get(`${lo}|${hi}`) ?? { lo, hi, entries: new Map<string, RawEntry>() }
      slot.entries.set(a, value as RawEntry)
      seen.set(`${lo}|${hi}`, slot)
    }
  }

  const pairs: TripsitPair[] = []
  for (const [pairKey, slot] of [...seen.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    const slugA = TRIPSIT_SLUG_MAP[slot.lo]
    const slugB = TRIPSIT_SLUG_MAP[slot.hi]
    if (!slugA) unmappedKeys.add(slot.lo)
    if (!slugB) unmappedKeys.add(slot.hi)
    if (!slugA || !slugB) continue

    // The `lo` direction is the deterministic primary; `hi` only fills gaps.
    const primary = slot.entries.get(slot.lo)
    const secondary = slot.entries.get(slot.hi)

    const rawStatuses = [primary, secondary]
      .map(e => text(e?.status))
      .filter((s): s is string => s !== null)
    const mapped: string[] = []
    for (const label of rawStatuses) {
      const key = TRIPSIT_STATUS_MAP[label]
      if (key) mapped.push(key)
      else unmappedStatuses.add(label)
    }

    let status: string | null = null
    if (mapped.length > 0) {
      // Worst wins. With no disagreement (the measured case) this is a no-op.
      status = mapped.reduce((worst, s) =>
        (STATUS_RANK[s] ?? 99) < (STATUS_RANK[worst] ?? 99) ? s : worst,
      )
      if (new Set(mapped).size > 1) {
        disagreements.push({ pair: pairKey, statuses: [...new Set(mapped)], kept: status })
      }
    }

    pairs.push({
      slug_a: slugA,
      slug_b: slugB,
      status,
      note: text(primary?.note) ?? text(secondary?.note),
      source_pair: pairKey,
    })
  }

  return {
    pairs,
    unmappedKeys: [...unmappedKeys].sort(),
    unmappedStatuses: [...unmappedStatuses].sort(),
    disagreements,
    directed,
    substances: keys.length,
  }
}
