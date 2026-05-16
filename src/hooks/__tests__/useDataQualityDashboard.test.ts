import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null; count?: number | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null, count: 0 };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  },
}));

vi.mock('@/i18n/languages', () => ({
  SUPPORTED_LOCALES: ['en', 'de', 'fr'],
  DEFAULT_LOCALE: 'en',
}));

import { loadDataQualityRow, DATA_QUALITY_STALE_DAYS } from '../useDataQualityDashboard';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

function venuesConfig() {
  return {
    id: 'venues',
    label: { plural: 'Venues' },
    color: '#000',
    tableName: 'venues',
    translatableFields: ['description'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'richtext', required: false },
    ],
  } as never;
}

describe('DATA_QUALITY_STALE_DAYS', () => {
  it('is 180 days', () => {
    expect(DATA_QUALITY_STALE_DAYS).toBe(180);
  });
});

describe('loadDataQualityRow — happy path', () => {
  it('counts total + workflow buckets + missing-required + stale + untranslated', async () => {
    withResults(
      { data: null, error: null, count: 50 }, // total headCount
      {
        data: [
          { workflow_state: 'published' },
          { workflow_state: 'published' },
          { workflow_state: 'draft' },
          { workflow_state: 'review' },
        ],
        error: null,
      },
      { data: null, error: null, count: 3 }, // missingRequired headCount
      { data: null, error: null, count: 1 }, // stale headCount
      { data: null, error: null, count: 2 }, // content_translations count
    );

    const row = await loadDataQualityRow(venuesConfig());
    expect(row.id).toBe('venues');
    expect(row.label).toBe('Venues');
    expect(row.total).toBe(50);
    expect(row.published).toBe(2);
    expect(row.draft).toBe(1);
    expect(row.review).toBe(1);
    expect(row.missingRequired).toBe(3);
    expect(row.staleCount).toBe(1);
    // 2 published × 1 translatable × 2 non-default locales = 4 expected, 2 have → 2 untranslated.
    expect(row.expectedTranslations).toBe(4);
    expect(row.untranslated).toBe(2);
    expect(row.error).toBeNull();
  });
});

describe('loadDataQualityRow — edge cases', () => {
  it('skips translation math when published=0', async () => {
    withResults(
      { data: null, error: null, count: 10 },
      { data: [], error: null },
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
    );

    const row = await loadDataQualityRow(venuesConfig());
    expect(row.expectedTranslations).toBe(0);
    expect(row.untranslated).toBe(0);
  });

  it('skips missingRequired when no required text field exists', async () => {
    const cfg = {
      id: 'tags',
      label: { plural: 'Tags' },
      color: '#000',
      tableName: 'unified_tags',
      fields: [
        { name: 'name', label: 'Name', type: 'select', required: true }, // not text/richtext
      ],
    } as never;

    withResults(
      { data: null, error: null, count: 100 }, // total
      { data: [], error: null }, // meta
      { data: null, error: null, count: 0 }, // stale
    );

    const row = await loadDataQualityRow(cfg);
    expect(row.missingRequired).toBe(0);
  });

  it("records error message when total count fails", async () => {
    withResults({ data: null, error: { message: 'rls denied' }, count: null });
    const row = await loadDataQualityRow(venuesConfig());
    expect(row.error).toMatch(/rls denied/);
    expect(row.total).toBe(0);
  });
});
