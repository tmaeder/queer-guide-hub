/**
 * Per-row entity-type classifier.
 * Pure logic — no DB, no network — so the same heuristics run inside the
 * pipeline-validate edge function (Deno) and the CSV upload preview UI
 * (Vite/Node). Keep `src/lib/entityClassifier.ts` byte-identical.
 *
 * Background (issue #113): a CSV upload routed 10k rows into `personalities`
 * with `target_table='personalities'` baked in at the job level. The mix
 * included real persons, venues, glossary terms, and postcodes. The validator
 * had no per-row entity awareness, so everything passed.
 */

export type EntityKind =
  | 'person'
  | 'venue'
  | 'event'
  | 'glossary_term'
  | 'unknown'

export interface ClassifyInput {
  name?: string | null
  bio?: string | null
  description?: string | null
  birth_date?: string | null
  death_date?: string | null
  wikidata_qid?: string | null
  profession?: string | null
  pronouns?: string | null
  image_url?: string | null
  website_url?: string | null
  external_ids?: Record<string, unknown> | null
  start_date?: string | null
  end_date?: string | null
  address?: string | null
  city?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  accommodation_type?: string | null
  event_type?: string | null
  // Anything else is ignored.
  [k: string]: unknown
}

export interface ClassifyResult {
  classified_as: EntityKind
  confidence: number              // 0–1
  scores: Record<EntityKind, number>
  signals: string[]               // human-readable reasons (best for review UI)
}

const PLACE_KEYWORDS = [
  'bar', 'club', 'sauna', 'hotel', 'hostel', 'restaurant', 'cafe', 'café',
  'bistro', 'cabaret', 'nightclub', 'disco', 'spa', 'gym', 'venue', 'store',
  'shop', 'pub', 'tavern', 'bathhouse', 'brasserie', 'kneipe', 'gasthof',
  'gasthaus', 'pizzeria', 'kebab', 'grill', 'salon', 'studio', 'boutique',
  'kino', 'theatre', 'theater', 'gallery', 'library', 'bookshop', 'bookstore',
  'darkroom', 'arcade', 'cruise lounge', 'lounge', 'inn', 'hostal', 'pension',
  'guesthouse', 'b&b', 'bnb', 'apartment', 'apartments', 'resort', 'motel',
]

const VENUE_PHRASE_PATTERNS = [
  /\blocated (?:in|at|on)\b/,
  /\bopening hours\b/,
  /\bhappy hour\b/,
  /\bentrance fee\b/,
  /\bdress code\b/,
  /\bdance ?floor\b/,
  /\bwe (?:offer|serve|welcome)\b/,
  /\bour (?:menu|guests|customers|patrons)\b/,
  /\bstreet,?\s*\d+\b/,
  /\b\d+\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?)\b/i,
]

const PERSON_PHRASE_PATTERNS = [
  /\bborn (?:in|on|to|at)\b/,
  /\bdied (?:in|on|at|aged)\b/,
  /\b(?:was|is) (?:a|an) (?:[a-z- ]+ )?(?:singer|songwriter|actor|actress|writer|author|poet|painter|artist|musician|composer|director|producer|activist|politician|scientist|engineer|athlete|dancer|model|drag (?:queen|king)|journalist|photographer|filmmaker|architect|designer|chef|comedian)\b/,
  /\bbiograph(?:er|y|ical)\b/,
  /\bautobiograph(?:y|ical)\b/,
  /\bspouse\b|\bhusband\b|\bwife\b|\bpartner of\b/,
  /\bgraduated (?:from|with)\b/,
  /\bcareer (?:as|began|started)\b/,
]

const EVENT_PHRASE_PATTERNS = [
  /\bthis year'?s\b/,
  /\bannual (?:festival|parade|march|celebration|event)\b/,
  /\bjoin us (?:on|for|at)\b/,
  /\b(?:from|between)\s+\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
]

const GLOSSARY_PHRASE_PATTERNS = [
  /^(?:a |an |the )?(?:slang )?term (?:used )?(?:to (?:describe|refer)|for)\b/i,
  /^refers to\b/i,
  /^(?:informal |colloquial |gay )?(?:slang|term|expression|phrase) for\b/i,
  /^describes (?:someone|a person|the act)\b/i,
  /^(?:a |an )?(?:colloquial |informal )?(?:word|term|expression|phrase)\b/i,
]

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const NUMERIC_NOISE_RE = /^[\d\s\-./,]{1,8}$/

function lc(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase() : ''
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function bumpSignal(scores: Record<EntityKind, number>, kind: EntityKind, weight: number, signals: string[], reason: string) {
  scores[kind] += weight
  signals.push(`${kind}:${reason} (+${weight})`)
}

export function classifyEntity(input: ClassifyInput): ClassifyResult {
  const scores: Record<EntityKind, number> = {
    person: 0, venue: 0, event: 0, glossary_term: 0, unknown: 0,
  }
  const signals: string[] = []

  const name = asString(input.name)
  const nameLc = lc(name)
  const bio = asString(input.bio)
  const description = asString(input.description)
  const text = `${name} ${bio} ${description}`.trim()
  const textLc = text.toLowerCase()
  const descLc = description.toLowerCase()

  // ---- nonsense / postcode / numeric noise — strong unknown signal ----
  if (name.length > 0 && (UK_POSTCODE_RE.test(name) || NUMERIC_NOISE_RE.test(name))) {
    bumpSignal(scores, 'unknown', 5, signals, 'name_is_postcode_or_numeric')
  }
  if (name.length > 0 && name.length <= 2) {
    bumpSignal(scores, 'unknown', 3, signals, 'name_too_short')
  }

  // ---- person signals (structured fields are very strong) ----
  const qid = asString(input.wikidata_qid)
  if (qid && /^Q\d+$/.test(qid)) bumpSignal(scores, 'person', 4, signals, 'has_wikidata_qid')
  if (asString(input.birth_date)) bumpSignal(scores, 'person', 4, signals, 'has_birth_date')
  if (asString(input.death_date)) bumpSignal(scores, 'person', 4, signals, 'has_death_date')
  if (asString(input.profession)) bumpSignal(scores, 'person', 2, signals, 'has_profession')
  const pronouns = lc(input.pronouns)
  if (pronouns && /(he\/him|she\/her|they\/them|ze\/|xe\/|ey\/em)/.test(pronouns)) {
    bumpSignal(scores, 'person', 2, signals, 'has_pronouns')
  }
  if (text.length > 0) {
    for (const re of PERSON_PHRASE_PATTERNS) {
      if (re.test(textLc)) { bumpSignal(scores, 'person', 2, signals, `phrase:${re.source.slice(0, 30)}`); break }
    }
  }
  // Two-or-more capitalised words (e.g. "Lytton Strachey", "Davis Mac-Iyalla") —
  // weak signal, easily fooled by venue names ("Sauna Tres Chic"), so only +1.
  if (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3}$/u.test(name) && !PLACE_KEYWORDS.some(k => nameLc.includes(k))) {
    bumpSignal(scores, 'person', 1, signals, 'name_looks_like_full_name')
  }

  // ---- venue signals ----
  const placeHit = PLACE_KEYWORDS.find(k => nameLc.includes(k))
  if (placeHit) bumpSignal(scores, 'venue', 4, signals, `name_contains_${placeHit}`)
  if (asString(input.address)) bumpSignal(scores, 'venue', 3, signals, 'has_address')
  if (asString(input.accommodation_type)) bumpSignal(scores, 'venue', 4, signals, 'has_accommodation_type')
  const lat = Number(input.latitude), lng = Number(input.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    bumpSignal(scores, 'venue', 2, signals, 'has_geo')
  }
  if (text.length > 0) {
    for (const re of VENUE_PHRASE_PATTERNS) {
      if (re.test(textLc)) { bumpSignal(scores, 'venue', 2, signals, `phrase:${re.source.slice(0, 30)}`); break }
    }
  }

  // ---- event signals ----
  if (asString(input.start_date) || asString(input.end_date)) {
    bumpSignal(scores, 'event', 3, signals, 'has_event_dates')
  }
  if (asString(input.event_type)) bumpSignal(scores, 'event', 3, signals, 'has_event_type')
  if (/\b(festival|parade|pride march|celebration|conference|meet ?up|gathering)\b/.test(textLc)) {
    bumpSignal(scores, 'event', 2, signals, 'event_keyword')
  }
  if (text.length > 0) {
    for (const re of EVENT_PHRASE_PATTERNS) {
      if (re.test(textLc)) { bumpSignal(scores, 'event', 1, signals, `phrase:${re.source.slice(0, 30)}`); break }
    }
  }

  // ---- glossary signals ----
  // Short, lowercase, no internal punctuation, no person markers.
  const wordCount = name.length === 0 ? 0 : name.trim().split(/\s+/).length
  const isAllLower = name.length > 0 && name === name.toLowerCase() && /[a-z]/.test(name)
  const isShortAcronym = /^[A-Z]{2,5}$/.test(name) && !asString(input.wikidata_qid)
  if (wordCount > 0 && wordCount <= 4 && (isAllLower || isShortAcronym) &&
      !asString(input.birth_date) && !asString(input.death_date) && !qid) {
    bumpSignal(scores, 'glossary_term', 3, signals, 'short_lowercase_or_acronym')
  }
  if (description) {
    for (const re of GLOSSARY_PHRASE_PATTERNS) {
      if (re.test(descLc)) { bumpSignal(scores, 'glossary_term', 4, signals, `phrase:${re.source.slice(0, 30)}`); break }
    }
  }

  // ---- pick the winner ----
  let winner: EntityKind = 'unknown'
  let topScore = 0
  for (const k of Object.keys(scores) as EntityKind[]) {
    if (scores[k] > topScore) { winner = k; topScore = scores[k] }
  }

  // Compute a confidence: distance between the top score and the runner-up,
  // saturating at 6. A clear winner with ≥4 points and a 3+-point gap is high
  // confidence; a 1-point edge is low.
  let runnerUp = 0
  for (const k of Object.keys(scores) as EntityKind[]) {
    if (k !== winner && scores[k] > runnerUp) runnerUp = scores[k]
  }
  const gap = topScore - runnerUp
  const confidence = topScore === 0 ? 0 : Math.min(1, (topScore + gap) / 12)

  // If nothing scored or it's a tie at 0, mark unknown.
  if (topScore === 0) winner = 'unknown'

  return { classified_as: winner, confidence, scores, signals }
}

/**
 * Map a `target_table` name to the EntityKind we expect rows to be.
 * Returns `null` for tables we don't classify (e.g. countries, cities).
 */
export function expectedKindForTargetTable(targetTable: string | null | undefined): EntityKind | null {
  switch ((targetTable ?? '').toLowerCase()) {
    case 'personalities': return 'person'
    case 'venues':        return 'venue'
    case 'events':        return 'event'
    case 'glossary_terms':
    case 'lgbtq_terms':
    case 'terminology':   return 'glossary_term'
    default:              return null
  }
}

/**
 * Should the validator hard-reject this row as an entity-type mismatch?
 * We require:
 *   - the target_table maps to a known kind
 *   - classification confidence ≥ MIN_CONF (so we don't reject "unknown" or
 *     low-signal rows — those go to needs_review via warnings instead)
 *   - the classifier picked a different kind than expected
 */
export function isEntityTypeMismatch(
  result: ClassifyResult,
  targetTable: string | null | undefined,
  minConfidence = 0.45,
): boolean {
  const expected = expectedKindForTargetTable(targetTable)
  if (!expected) return false
  if (result.classified_as === expected) return false
  if (result.classified_as === 'unknown') return false
  if (result.confidence < minConfidence) return false
  return true
}
