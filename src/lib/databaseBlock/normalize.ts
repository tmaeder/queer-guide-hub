/**
 * The one record shape all five layouts consume, plus the derivations each
 * layout needs (kanban grouping, timeline intervals, calendar day buckets).
 *
 * PORTABILITY CONTRACT — relative imports only (see ./schema). The edge
 * pre-hydrator normalizes rows with exactly this code so the seeded payload is
 * byte-identical to what the client would have produced.
 *
 * Generalizes `PickEntityDisplay` (src/lib/guidePickAdapters.ts) with the three
 * affordances the new layouts need: a resolvable group value, a millisecond
 * interval, and a gated flag.
 */

import {
  type DateFieldId,
  type EntityType,
  type GroupByField,
  isEntityType,
} from './schema';

export interface EntityCard {
  /** `${entityType}:${entityId}` — React key and dedupe key. */
  docId: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  /** Null when no valid detail route exists. Render unlinked; never fabricate. */
  href: string | null;
  imageUrl: string | null;
  description: string | null;
  categoryLabel: string | null;
  city: string | null;
  country: string | null;
  /** Timeline + calendar. Null when the chosen date field is empty. */
  startMs: number | null;
  /** Equals startMs for point-in-time records, so a timeline can still place them. */
  endMs: number | null;
  isFeatured: boolean;
  livenessStatus: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
  facets: Record<string, unknown>;
  /** True when the entity is only visible to signed-in users. */
  isGated: boolean;
  updatedAtMs: number;
}

/* ------------------------------------------------------------------ */
/*  Row → card                                                         */
/* ------------------------------------------------------------------ */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // PostgREST returns `numeric` as a string to preserve precision.
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

function toMs(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Detail routes per entity type. Mirrors src/lib/searchRoutes.ts, duplicated
 * deliberately: that module is not import-safe from the Cloudflare bundle, and
 * this table must produce identical hrefs on both sides of the boundary.
 */
const ROUTE_PREFIX: Record<EntityType, string> = {
  venue: '/venues',
  event: '/events',
  marketplace: '/marketplace',
  city: '/city',
  country: '/country',
  queer_village: '/villages',
  personality: '/people',
  news: '/news',
  milestone: '/milestones',
  group: '/groups',
  organization: '/organizations',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Slug-only. A UUID in the slug position produces a 404 on these routes, so
 * return null and let the caller render the card unlinked.
 */
export function detailHrefFor(entityType: EntityType, slug: string | null): string | null {
  if (!slug || UUID_RE.test(slug)) return null;
  const prefix = ROUTE_PREFIX[entityType];
  if (!prefix) return null;
  return `${prefix}/${slug}`;
}

export interface NormalizeOptions {
  dateStartField?: DateFieldId;
  dateEndField?: DateFieldId;
}

/** Returns null for unusable rows (unknown type, no id, no title) — caller drops. */
export function normalizeEntityCard(
  row: unknown,
  options: NormalizeOptions = {},
): EntityCard | null {
  if (!isRecord(row)) return null;

  const entityType = row.entity_type;
  if (!isEntityType(entityType)) return null;

  const entityId = str(row.entity_id);
  if (!entityId) return null;

  const title = str(row.title);
  if (!title) return null;

  const facets = isRecord(row.facets) ? row.facets : {};
  const slug = str(row.slug);

  const startField: DateFieldId = options.dateStartField ?? 'start_date';
  const endField: DateFieldId = options.dateEndField ?? 'end_date';

  const startMs = toMs(row[startField]);
  const rawEndMs = toMs(row[endField]);
  // A point-in-time record gets endMs === startMs so timelines can place it.
  // An inverted range is clamped rather than dropped: bad source data should
  // render as a zero-width marker, not vanish.
  const endMs =
    startMs === null ? rawEndMs : rawEndMs === null ? startMs : Math.max(startMs, rawEndMs);

  return {
    docId: `${entityType}:${entityId}`,
    entityType,
    entityId,
    title,
    href: detailHrefFor(entityType, slug),
    imageUrl: str(row.image_url),
    description: str(row.description),
    categoryLabel: str(facets.category) ?? str(facets.event_type) ?? null,
    city: str(row.city),
    country: str(row.country),
    startMs,
    endMs,
    isFeatured: row.is_featured === true,
    livenessStatus: str(row.liveness_status),
    priceMin: num(row.price_min),
    priceMax: num(row.price_max),
    isFree: typeof row.is_free === 'boolean' ? row.is_free : null,
    facets,
    isGated: row.is_gated === true || row.safety_gated === true,
    updatedAtMs: toMs(row.updated_at) ?? 0,
  };
}

export function normalizeEntityCards(
  rows: unknown,
  options: NormalizeOptions = {},
): EntityCard[] {
  if (!Array.isArray(rows)) return [];
  const out: EntityCard[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const card = normalizeEntityCard(row, options);
    if (!card || seen.has(card.docId)) continue;
    seen.add(card.docId);
    out.push(card);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Kanban grouping                                                    */
/* ------------------------------------------------------------------ */

/** Column label for records with no value for the grouping field. */
export const UNGROUPED_LABEL = 'Ungrouped';

const MONTH_FMT = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Null means "no value" — the caller buckets these into UNGROUPED_LABEL. */
export function groupValueOf(card: EntityCard, field: GroupByField): string | null {
  switch (field) {
    case 'entity_type':
      return card.entityType;
    case 'city':
      return card.city;
    case 'country':
      return card.country;
    case 'category':
      return card.categoryLabel;
    case 'liveness_status':
      return card.livenessStatus;
    case 'is_featured':
      return card.isFeatured ? 'Featured' : 'Not featured';
    case 'start_month': {
      if (card.startMs === null) return null;
      const d = new Date(card.startMs);
      return `${MONTH_FMT[d.getMonth()]} ${d.getFullYear()}`;
    }
    default:
      return null;
  }
}

export interface KanbanColumn {
  key: string;
  label: string;
  cards: EntityCard[];
}

/**
 * Groups cards into columns.
 *
 * Column order is stable across renders: first appearance in the input order,
 * with the ungrouped column always last so an incomplete-data bucket never
 * pushes real columns off-screen.
 */
export function toKanbanColumns(cards: EntityCard[], field: GroupByField): KanbanColumn[] {
  const columns = new Map<string, KanbanColumn>();
  const ungrouped: EntityCard[] = [];

  for (const card of cards) {
    const value = groupValueOf(card, field);
    if (value === null) {
      ungrouped.push(card);
      continue;
    }
    const existing = columns.get(value);
    if (existing) existing.cards.push(card);
    else columns.set(value, { key: value, label: value, cards: [card] });
  }

  const out = [...columns.values()];
  if (ungrouped.length) {
    out.push({ key: '__ungrouped__', label: UNGROUPED_LABEL, cards: ungrouped });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Timeline                                                           */
/* ------------------------------------------------------------------ */

export interface TimelineItem {
  card: EntityCard;
  startMs: number;
  endMs: number;
}

export interface TimelineData {
  items: TimelineItem[];
  /** Cards with no usable date. Surfaced separately, never silently dropped. */
  undated: EntityCard[];
  rangeStartMs: number | null;
  rangeEndMs: number | null;
}

export function toTimelineData(cards: EntityCard[]): TimelineData {
  const items: TimelineItem[] = [];
  const undated: EntityCard[] = [];

  for (const card of cards) {
    if (card.startMs === null) {
      undated.push(card);
      continue;
    }
    items.push({ card, startMs: card.startMs, endMs: card.endMs ?? card.startMs });
  }

  items.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  return {
    items,
    undated,
    rangeStartMs: items.length ? items[0].startMs : null,
    rangeEndMs: items.length ? Math.max(...items.map((i) => i.endMs)) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Calendar                                                           */
/* ------------------------------------------------------------------ */

/**
 * Local-time day key, `YYYY-MM-DD`. Matches the convention used by
 * src/components/hub/calendar (localDayKey) so both calendars bucket alike.
 * Deliberately local rather than UTC: an event at 23:00 local belongs to the
 * day the reader is living in.
 */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Bound on how many days one record may occupy, so a bad end date can't hang render. */
export const MAX_SPAN_DAYS = 366;

/**
 * Buckets cards by day. A multi-day record appears on every day it spans, which
 * is what makes a festival read correctly on a month grid.
 */
export function toCalendarBuckets(cards: EntityCard[]): Map<string, EntityCard[]> {
  const buckets = new Map<string, EntityCard[]>();

  const push = (key: string, card: EntityCard) => {
    const list = buckets.get(key);
    if (list) list.push(card);
    else buckets.set(key, [card]);
  };

  for (const card of cards) {
    if (card.startMs === null) continue;

    const start = new Date(card.startMs);
    const end = new Date(card.endMs ?? card.startMs);

    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    let days = 0;
    while (cursor.getTime() <= last.getTime() && days < MAX_SPAN_DAYS) {
      push(localDayKey(cursor), card);
      cursor.setDate(cursor.getDate() + 1);
      days += 1;
    }
  }

  return buckets;
}
