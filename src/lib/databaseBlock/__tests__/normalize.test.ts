import { describe, expect, it } from 'vitest';
import {
  UNGROUPED_LABEL,
  detailHrefFor,
  groupValueOf,
  localDayKey,
  normalizeEntityCard,
  normalizeEntityCards,
  toCalendarBuckets,
  toKanbanColumns,
  toTimelineData,
  type EntityCard,
} from '../normalize';

/** Shaped like a real public.v_entity_cards row. */
function row(over: Record<string, unknown> = {}) {
  return {
    doc_id: 'venue:11111111-1111-4111-8111-111111111111',
    entity_type: 'venue',
    entity_id: '11111111-1111-4111-8111-111111111111',
    slug: 'berghain',
    title: 'Berghain',
    description: 'Club',
    image_url: 'https://img/x.jpg',
    city: 'Berlin',
    country: 'Germany',
    start_date: null,
    end_date: null,
    is_free: false,
    price_min: '12.50',
    price_max: null,
    is_featured: true,
    quality_score: 80,
    liveness_status: 'live',
    facets: { category: 'club' },
    is_gated: false,
    updated_at: '2026-07-01T10:00:00Z',
    ...over,
  };
}

const card = (over: Partial<EntityCard> = {}): EntityCard => ({
  docId: 'venue:a',
  entityType: 'venue',
  entityId: 'a',
  title: 'A',
  href: null,
  imageUrl: null,
  description: null,
  categoryLabel: null,
  city: null,
  country: null,
  startMs: null,
  endMs: null,
  isFeatured: false,
  livenessStatus: null,
  priceMin: null,
  priceMax: null,
  isFree: null,
  facets: {},
  isGated: false,
  updatedAtMs: 0,
  ...over,
});

describe('normalizeEntityCard', () => {
  it('maps a full row', () => {
    const c = normalizeEntityCard(row());
    expect(c).toMatchObject({
      docId: 'venue:11111111-1111-4111-8111-111111111111',
      entityType: 'venue',
      title: 'Berghain',
      href: '/venues/berghain',
      city: 'Berlin',
      categoryLabel: 'club',
      isFeatured: true,
      isGated: false,
    });
  });

  it('parses numeric columns PostgREST returns as strings', () => {
    expect(normalizeEntityCard(row())?.priceMin).toBe(12.5);
  });

  it('drops rows that cannot render', () => {
    expect(normalizeEntityCard(row({ entity_type: 'not_a_type' }))).toBeNull();
    expect(normalizeEntityCard(row({ entity_id: null }))).toBeNull();
    expect(normalizeEntityCard(row({ title: '' }))).toBeNull();
    expect(normalizeEntityCard(null)).toBeNull();
  });

  it('reads gatedness from either column name', () => {
    expect(normalizeEntityCard(row({ is_gated: true }))?.isGated).toBe(true);
    expect(normalizeEntityCard(row({ is_gated: undefined, safety_gated: true }))?.isGated).toBe(true);
  });

  it('deduplicates by docId and skips unusable rows', () => {
    const cards = normalizeEntityCards([row(), row(), row({ title: '' })]);
    expect(cards).toHaveLength(1);
  });

  it('returns a null href rather than fabricating a 404 link', () => {
    expect(detailHrefFor('venue', null)).toBeNull();
    // A UUID in the slug position 404s on these routes.
    expect(detailHrefFor('venue', '11111111-1111-4111-8111-111111111111')).toBeNull();
    expect(detailHrefFor('city', 'berlin')).toBe('/city/berlin');
  });
});

describe('timeline date extraction', () => {
  const START = '2026-06-01T10:00:00Z';
  const END = '2026-06-05T10:00:00Z';

  it('gives a point-in-time record endMs === startMs so it can still be placed', () => {
    const c = normalizeEntityCard(row({ start_date: START, end_date: null }));
    expect(c?.startMs).toBe(Date.parse(START));
    expect(c?.endMs).toBe(Date.parse(START));
  });

  it('keeps a real interval', () => {
    const c = normalizeEntityCard(row({ start_date: START, end_date: END }));
    expect(c?.endMs).toBe(Date.parse(END));
    expect(c!.endMs! - c!.startMs!).toBeGreaterThan(0);
  });

  it('clamps an inverted range instead of dropping the record', () => {
    const c = normalizeEntityCard(row({ start_date: END, end_date: START }));
    expect(c?.endMs).toBe(Date.parse(END));
  });

  it('honours a non-default date field', () => {
    const c = normalizeEntityCard(row({ start_date: null, updated_at: START }), {
      dateStartField: 'updated_at',
      dateEndField: 'updated_at',
    });
    expect(c?.startMs).toBe(Date.parse(START));
  });

  it('surfaces undated records separately rather than silently dropping them', () => {
    const data = toTimelineData([
      card({ docId: 'a', startMs: Date.parse(START), endMs: Date.parse(END) }),
      card({ docId: 'b', startMs: null }),
    ]);
    expect(data.items).toHaveLength(1);
    expect(data.undated.map((c) => c.docId)).toEqual(['b']);
  });

  it('sorts items and reports the overall range', () => {
    const later = Date.parse('2026-08-01T00:00:00Z');
    const earlier = Date.parse('2026-01-01T00:00:00Z');
    const data = toTimelineData([
      card({ docId: 'late', startMs: later, endMs: later }),
      card({ docId: 'early', startMs: earlier, endMs: earlier }),
    ]);
    expect(data.items.map((i) => i.card.docId)).toEqual(['early', 'late']);
    expect(data.rangeStartMs).toBe(earlier);
    expect(data.rangeEndMs).toBe(later);
  });

  it('ignores unparseable dates', () => {
    expect(normalizeEntityCard(row({ start_date: 'not a date' }))?.startMs).toBeNull();
  });
});

describe('kanban grouping', () => {
  it('resolves every grouping field', () => {
    const c = card({
      entityType: 'event',
      city: 'Berlin',
      country: 'Germany',
      categoryLabel: 'club',
      livenessStatus: 'live',
      isFeatured: true,
      startMs: Date.parse('2026-06-15T00:00:00Z'),
    });
    expect(groupValueOf(c, 'entity_type')).toBe('event');
    expect(groupValueOf(c, 'city')).toBe('Berlin');
    expect(groupValueOf(c, 'country')).toBe('Germany');
    expect(groupValueOf(c, 'category')).toBe('club');
    expect(groupValueOf(c, 'liveness_status')).toBe('live');
    expect(groupValueOf(c, 'is_featured')).toBe('Featured');
    expect(groupValueOf(c, 'start_month')).toBe('June 2026');
  });

  it('returns null when the field has no value', () => {
    expect(groupValueOf(card(), 'city')).toBeNull();
    expect(groupValueOf(card(), 'start_month')).toBeNull();
  });

  it('buckets valueless cards into a single Ungrouped column placed last', () => {
    const columns = toKanbanColumns(
      [
        card({ docId: '1', city: 'Berlin' }),
        card({ docId: '2', city: null }),
        card({ docId: '3', city: 'Paris' }),
        card({ docId: '4', city: null }),
      ],
      'city',
    );
    expect(columns.map((c) => c.label)).toEqual(['Berlin', 'Paris', UNGROUPED_LABEL]);
    expect(columns[2].cards).toHaveLength(2);
  });

  it('omits the Ungrouped column entirely when every card has a value', () => {
    const columns = toKanbanColumns([card({ city: 'Berlin' })], 'city');
    expect(columns.map((c) => c.label)).toEqual(['Berlin']);
  });

  it('orders columns by first appearance, stably across calls', () => {
    const cards = [
      card({ docId: '1', city: 'Zurich' }),
      card({ docId: '2', city: 'Amsterdam' }),
      card({ docId: '3', city: 'Zurich' }),
    ];
    const first = toKanbanColumns(cards, 'city').map((c) => c.label);
    const second = toKanbanColumns(cards, 'city').map((c) => c.label);
    // First-appearance order, NOT alphabetical — columns must not jump around.
    expect(first).toEqual(['Zurich', 'Amsterdam']);
    expect(second).toEqual(first);
  });
});

describe('calendar bucketing', () => {
  it('places a single-day record on exactly one day', () => {
    const ms = new Date(2026, 5, 15, 12).getTime();
    const buckets = toCalendarBuckets([card({ startMs: ms, endMs: ms })]);
    expect([...buckets.keys()]).toEqual(['2026-06-15']);
  });

  it('places a multi-day record on every day it spans, inclusive', () => {
    const buckets = toCalendarBuckets([
      card({ startMs: new Date(2026, 5, 15, 20).getTime(), endMs: new Date(2026, 5, 18, 4).getTime() }),
    ]);
    expect([...buckets.keys()]).toEqual(['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']);
  });

  it('skips undated records', () => {
    expect(toCalendarBuckets([card({ startMs: null })]).size).toBe(0);
  });

  it('caps a pathological span instead of hanging', () => {
    const buckets = toCalendarBuckets([
      card({ startMs: new Date(2026, 0, 1).getTime(), endMs: new Date(2999, 0, 1).getTime() }),
    ]);
    expect(buckets.size).toBeLessThanOrEqual(366);
  });

  it('uses local days, so a late-evening record lands on the reader’s day', () => {
    expect(localDayKey(new Date(2026, 5, 15, 23, 30))).toBe('2026-06-15');
  });
});
