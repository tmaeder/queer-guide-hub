// Per-row CSV entity-type classifier — frontend mirror of
// supabase/functions/_shared/entity-type-classifier.ts. Used by the CSV
// upload preview to show users where each row would be routed before they
// commit. (Issue #113)
//
// Keep this in sync with the Deno-side module. Both files are pure heuristics;
// the duplication exists because edge functions and the React app are
// compiled in different toolchains and don't share modules today.

export type EntityType = 'personality' | 'venue' | 'event' | 'tag' | 'unknown';

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
};

const VENUE_PATTERN =
  /\b(bar|club|sauna|hotel|hostel|restaurant|cafe|café|bistro|cabaret|nightclub|disco|spa|gym|venue|store|shop|center|centre|pub|tavern|bathhouse|brasserie|kneipe|gasthof|gasthaus|pizzeria|kebab|grill|salon|studio|boutique|kino|theatre|theater|gallery|library|bookshop|bookstore|cruising|darkroom|dance ?floor|drag show|karaoke|happy hour|entrance fee|located in|located at|located on|opening hours|open from)\b/;

const PERSON_PATTERN =
  /\b(born|died|biography|activist|writer|author|actor|actress|singer|musician|politician|playwright|poet|painter|drag queen|drag king|novelist|journalist|filmmaker|director|composer|dancer)\b/;

const EVENT_PATTERN =
  /\b(pride parade|pride march|festival|symposium|gala|workshop|screening|conference|protest march)\b/;

export interface ClassifyResult {
  entityType: EntityType;
  reason: string;
  fromHint: boolean;
}

function readHint(row: Record<string, unknown>): EntityType | null {
  const candidates = [
    row._entity_type,
    row.entity_type,
    (row as Record<string, unknown>)['Entity Type'],
    (row as Record<string, unknown>)['EntityType'],
  ];
  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    const v = String(raw).trim().toLowerCase();
    if (!v) continue;
    if (HINT_ALIASES[v]) return HINT_ALIASES[v];
  }
  return null;
}

function valueOf(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function classifyEntityType(row: Record<string, unknown>): ClassifyResult {
  const hint = readHint(row);
  if (hint) {
    return { entityType: hint, reason: `explicit hint: "${hint}"`, fromHint: true };
  }

  const name = String(row.name ?? row.title ?? row.Name ?? row.Title ?? '').trim();
  const bio = String(row.bio ?? row.description ?? row.content ?? row.Description ?? '').trim();
  const haystack = `${name} ${bio}`.toLowerCase();

  const personMarker = !!(
    valueOf(row, 'birth_date') ||
    valueOf(row, 'death_date') ||
    valueOf(row, 'wikidata_qid') ||
    valueOf(row, 'profession')
  );
  const eventMarker = !!(
    valueOf(row, 'start_date') ||
    valueOf(row, 'end_date') ||
    valueOf(row, 'event_date') ||
    valueOf(row, 'event_type')
  );
  const venueMarker = !!(
    valueOf(row, 'address') ||
    valueOf(row, 'opening_hours') ||
    valueOf(row, 'venue_type') ||
    valueOf(row, 'accommodation_type')
  );

  if (personMarker) {
    return {
      entityType: 'personality',
      reason: 'has person markers (birth/death/qid/profession)',
      fromHint: false,
    };
  }
  if (eventMarker) {
    return { entityType: 'event', reason: 'has event markers (start/end date)', fromHint: false };
  }

  const looksLikeJunk =
    !name ||
    name.length <= 2 ||
    /^[\d\s]+[a-z]?$/i.test(name) ||
    /^[A-Z0-9]{2,4}\s+[A-Z0-9]{2,4}$/.test(name);
  if (looksLikeJunk) {
    return { entityType: 'unknown', reason: 'name is empty/numeric/postcode-like', fromHint: false };
  }

  if (venueMarker || VENUE_PATTERN.test(haystack)) {
    return {
      entityType: 'venue',
      reason: 'venue/place language or address column',
      fromHint: false,
    };
  }
  if (EVENT_PATTERN.test(haystack)) {
    return { entityType: 'event', reason: 'event language in name or bio', fromHint: false };
  }
  if (PERSON_PATTERN.test(haystack)) {
    return { entityType: 'personality', reason: 'person language in bio', fromHint: false };
  }

  return { entityType: 'unknown', reason: 'no clear entity-type signal', fromHint: false };
}

const TABLE_BY_TYPE: Record<EntityType, string> = {
  personality: 'personalities',
  venue: 'venues',
  event: 'events',
  tag: 'unified_tags',
  unknown: '',
};

export function entityTypeToTable(type: EntityType): string {
  return TABLE_BY_TYPE[type] ?? '';
}

/** What the import-type key in ImportJobCreator says it'll route to. */
const TARGET_BY_IMPORT_KEY: Record<string, EntityType> = {
  'personalities-csv': 'personality',
  'venues-csv': 'venue',
  'events-csv': 'event',
  'tags-csv': 'tag',
};

export function expectedEntityTypeFor(importTypeKey: string): EntityType | null {
  return TARGET_BY_IMPORT_KEY[importTypeKey] ?? null;
}

export interface DetectionSummary {
  byType: Record<EntityType, number>;
  rows: ClassifyResult[];
  /** Rows whose detected type differs from `expected` (and isn't 'unknown'). */
  mismatches: number;
  /** Rows the classifier couldn't place — fall back to job-level type. */
  unknownCount: number;
}

export function summarizeDetections(
  rows: Array<Record<string, unknown>>,
  expected: EntityType | null,
): DetectionSummary {
  const detections = rows.map(classifyEntityType);
  const byType: Record<EntityType, number> = {
    personality: 0,
    venue: 0,
    event: 0,
    tag: 0,
    unknown: 0,
  };
  let mismatches = 0;
  for (const d of detections) {
    byType[d.entityType] += 1;
    if (
      expected &&
      d.entityType !== 'unknown' &&
      d.entityType !== expected
    ) {
      mismatches += 1;
    }
  }
  return {
    byType,
    rows: detections,
    mismatches,
    unknownCount: byType.unknown,
  };
}
