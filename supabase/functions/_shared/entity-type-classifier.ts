// ============================================================
// Entity-type classifier for CSV upload routing.
//
// Used by source-csv-upload to route each row to the correct
// staging target (entity_type + target_table) instead of stamping
// the whole batch with the job-level type. The same heuristic is
// mirrored in src/lib/entityTypeClassifier.ts so the upload UI can
// preview detected types before commit.
//
// Issue #113: a CSV upload routed 10k venues / glossary terms /
// junk into ingestion_staging with target_table=personalities
// because target_table was a job-level constant. Per-row
// classification (with explicit _entity_type override) keeps each
// row on its correct branch.
// ============================================================

export type EntityType = 'personality' | 'venue' | 'event' | 'tag' | 'unknown'

export const ENTITY_TYPES: readonly EntityType[] = [
  'personality', 'venue', 'event', 'tag', 'unknown',
] as const

const HINT_ALIASES: Record<string, EntityType> = {
  personality: 'personality',
  person: 'personality',
  people: 'personality',
  adult_model: 'personality',
  venue: 'venue',
  venues: 'venue',
  place: 'venue',
  business: 'venue',
  event: 'event',
  events: 'event',
  tag: 'tag',
  tags: 'tag',
  category: 'tag',
}

const VENUE_PATTERN = /\b(bar|club|sauna|hotel|hostel|restaurant|cafe|café|bistro|cabaret|nightclub|disco|spa|gym|venue|store|shop|center|centre|pub|tavern|bathhouse|brasserie|kneipe|gasthof|gasthaus|pizzeria|kebab|grill|salon|studio|boutique|kino|theatre|theater|gallery|library|bookshop|bookstore|cruising|darkroom|dance ?floor|drag show|karaoke|happy hour|entrance fee|located in|located at|located on|opening hours|open from)\b/

const PERSON_PATTERN = /\b(born|died|biography|activist|writer|author|actor|actress|singer|musician|politician|playwright|poet|painter|drag queen|drag king|novelist|journalist|filmmaker|director|composer|dancer)\b/

const EVENT_PATTERN = /\b(pride parade|pride march|festival|symposium|gala|workshop|screening|conference|protest march)\b/

export interface ClassifyResult {
  entityType: EntityType
  reason: string
  fromHint: boolean
}

/** Read an explicit per-row entity-type column, if present. */
function readHint(row: Record<string, unknown>): EntityType | null {
  const candidates = [
    row._entity_type, row.entity_type,
    (row as { ['Entity Type']?: unknown })['Entity Type'],
    (row as { ['EntityType']?: unknown })['EntityType'],
  ]
  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue
    const v = String(raw).trim().toLowerCase()
    if (!v) continue
    if (HINT_ALIASES[v]) return HINT_ALIASES[v]
  }
  return null
}

/**
 * Classify a single CSV row into an entity type.
 *
 * Precedence:
 *   1. Explicit per-row hint column (_entity_type, entity_type, …)
 *   2. Strong structural markers (birth_date, start_date, address …)
 *   3. Linguistic heuristics in name/bio
 *   4. 'unknown' — caller should fall back to job-level type
 */
export function classifyEntityType(row: Record<string, unknown>): ClassifyResult {
  const hint = readHint(row)
  if (hint) {
    return { entityType: hint, reason: `explicit hint: "${hint}"`, fromHint: true }
  }

  const name = String(row.name ?? row.title ?? row.Name ?? row.Title ?? '').trim()
  const bio = String(row.bio ?? row.description ?? row.content ?? row.Description ?? '').trim()
  const haystack = `${name} ${bio}`.toLowerCase()

  const personMarker = !!(
    valueOf(row, 'birth_date') ||
    valueOf(row, 'death_date') ||
    valueOf(row, 'wikidata_qid') ||
    valueOf(row, 'profession')
  )
  const eventMarker = !!(
    valueOf(row, 'start_date') ||
    valueOf(row, 'end_date') ||
    valueOf(row, 'event_date') ||
    valueOf(row, 'event_type')
  )
  const venueMarker = !!(
    valueOf(row, 'address') ||
    valueOf(row, 'opening_hours') ||
    valueOf(row, 'venue_type') ||
    valueOf(row, 'accommodation_type')
  )

  if (personMarker) {
    return { entityType: 'personality', reason: 'has person markers (birth/death/qid/profession)', fromHint: false }
  }
  if (eventMarker) {
    return { entityType: 'event', reason: 'has event markers (start/end date)', fromHint: false }
  }

  const looksLikeJunk = !name || name.length <= 2
    || /^[\d\s]+[a-z]?$/i.test(name)
    || /^[A-Z0-9]{2,4}\s+[A-Z0-9]{2,4}$/.test(name)
  if (looksLikeJunk) {
    return { entityType: 'unknown', reason: 'name is empty/numeric/postcode-like', fromHint: false }
  }

  if (venueMarker || VENUE_PATTERN.test(haystack)) {
    return { entityType: 'venue', reason: 'venue/place language or address column', fromHint: false }
  }
  if (EVENT_PATTERN.test(haystack)) {
    return { entityType: 'event', reason: 'event language in name or bio', fromHint: false }
  }
  if (PERSON_PATTERN.test(haystack)) {
    return { entityType: 'personality', reason: 'person language in bio', fromHint: false }
  }

  return { entityType: 'unknown', reason: 'no clear entity-type signal', fromHint: false }
}

function valueOf(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

const TABLE_BY_TYPE: Record<EntityType, string> = {
  personality: 'personalities',
  venue: 'venues',
  event: 'events',
  tag: 'unified_tags',
  unknown: '',
}

/**
 * Map entity type → ingestion_staging.target_table. Returns the empty string
 * for 'unknown' so the caller falls back to the job-level target_table.
 */
export function entityTypeToTable(type: EntityType | string): string {
  return TABLE_BY_TYPE[type as EntityType] ?? ''
}

export interface RoutedGroup<T> {
  /** 'fallback' → the row classified as 'unknown' and was routed to the job-level type. */
  entityType: EntityType | 'fallback'
  targetTable: string
  items: T[]
  /** Up to 20 (sourceId, classifier reason) pairs for telemetry. */
  sampleReasons: { sourceId: string; reason: string }[]
}

/**
 * Group items by classified entity type. Items the classifier returns as
 * 'unknown' fall back to the caller-provided job-level type / target_table.
 *
 * Generic over item shape so it can be used both with raw CSV adapter items
 * (which carry .data / .sourceId) and with plain rows in the upload-preview UI.
 */
export function routeRows<T>(
  items: T[],
  pick: (item: T) => { row: Record<string, unknown>; sourceId: string },
  fallback: { entityType: string; targetTable: string },
): RoutedGroup<T>[] {
  const groups = new Map<string, RoutedGroup<T>>()
  for (const item of items) {
    const { row, sourceId } = pick(item)
    const result = classifyEntityType(row)
    let key: string
    let entityType: EntityType | 'fallback'
    let targetTable: string

    if (result.entityType === 'unknown') {
      key = `fallback:${fallback.entityType}:${fallback.targetTable}`
      entityType = 'fallback'
      targetTable = fallback.targetTable
    } else {
      const table = entityTypeToTable(result.entityType) || fallback.targetTable
      key = `${result.entityType}:${table}`
      entityType = result.entityType
      targetTable = table
    }

    let group = groups.get(key)
    if (!group) {
      group = { entityType, targetTable, items: [], sampleReasons: [] }
      groups.set(key, group)
    }
    group.items.push(item)
    if (group.sampleReasons.length < 20) {
      group.sampleReasons.push({ sourceId, reason: result.reason })
    }
  }
  return [...groups.values()]
}
