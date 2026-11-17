import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  combineDataSources,
  fetchDataSources,
  filterDataSources,
  readSourcePages,
  runDataSource,
  saveSource,
  setSourceEnabled,
  sourceHealth,
  sourceKey,
  supportsManualSourceRun,
  type SourceEdits,
} from '../adminDataSources';

const db = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: db.from, functions: { invoke: db.invoke } },
}));

const scraper: Parameters<typeof combineDataSources>[0][number] = {
  id: 'same-id',
  name: 'City guide',
  slug: 'city-guide',
  url: 'https://example.com/places',
  scrape_method: 'html',
  target_table: 'venues',
  is_enabled: true,
  schedule_cron: null,
  schedule_interval_hours: 168,
  last_run_at: null,
  last_success_at: null,
  last_error: null,
  consecutive_failures: 0,
  total_items_fetched: 20,
};
const importer: Parameters<typeof combineDataSources>[1][number] = {
  id: 'same-id',
  name: 'API places',
  slug: 'api-places',
  source_type: 'api',
  target_table: 'venues',
  is_enabled: false,
  schedule: 'Daily',
  last_run_at: null,
  last_success_at: null,
  last_error: null,
  total_items_fetched: null,
  edge_function: 'source-places',
};
const feed: Parameters<typeof combineDataSources>[2][number] = {
  id: 'same-id',
  name: 'Daily news',
  url: 'https://example.org/feed',
  source_type: 'rss',
  feed_type: 'news',
  is_active: true,
  fetch_frequency: 120,
  last_fetched_at: null,
  last_successful_fetch: null,
  last_error: 'Timeout',
  consecutive_failures: 8,
  articles_fetched: 40,
  auto_paused: true,
  auto_paused_reason: 'Repeated failures',
  category: 'world',
};
const sources = () => combineDataSources([scraper], [importer], [feed]);
const edits: SourceEdits = {
  name: ' Updated source ',
  url: ' https://example.org/new-feed ',
  category: ' local ',
  fetchFrequency: '60',
};

beforeEach(() => vi.resetAllMocks());

describe('combined source registry', () => {
  it('keeps separate registrations with identical IDs and maps their native fields', () => {
    const all = sources();
    expect(new Set(all.map(sourceKey)).size).toBe(3);
    expect(all.find((s) => s.registry === 'news_sources')).toMatchObject({
      enabled: true,
      autoPaused: true,
      target: 'news_articles',
      fetched: 40,
      schedule: 'Every 120 minutes',
      lastError: 'Timeout',
    });
    expect(all.find((s) => s.registry === 'ingestion_sources')).toMatchObject({
      enabled: false,
      fetched: 0,
      edgeFunction: 'source-places',
    });
  });

  it('loads all three registries without requesting configuration or credentials', async () => {
    const rows = { scrape_sources: [scraper], ingestion_sources: [importer], news_sources: [feed] };
    const selections: string[] = [];
    db.from.mockImplementation((table: keyof typeof rows) => ({
      select: (columns: string) => {
        selections.push(columns);
        return {
          order: () => ({ range: () => Promise.resolve({ data: rows[table], error: null }) }),
        };
      },
    }));
    expect(await fetchDataSources()).toEqual(sources());
    expect(db.from.mock.calls.map(([table]) => table).sort()).toEqual(Object.keys(rows).sort());
    expect(selections.every((columns) => !/\*|config|api_key/.test(columns))).toBe(true);
  });

  it('includes records after the first API page', async () => {
    const firstPage = Array.from({ length: 500 }, (_, id) => ({ id }));
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ id: 500 }], error: null });
    expect(await readSourcePages(fetchPage, 'Scrapers')).toHaveLength(501);
    expect(fetchPage.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });

  it('rejects a failed later page instead of displaying an incomplete list', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Access denied' } });
    await expect(readSourcePages(fetchPage, 'Scrapers')).rejects.toThrow('Scrapers: Access denied');
  });

  it('combines search, registry, source type, enabled, and health filters', () => {
    const filters = {
      search: 'EXAMPLE.ORG',
      registry: 'news_sources',
      type: 'news / rss',
      enabled: 'enabled',
      health: 'paused',
    };
    expect(filterDataSources(sources(), filters).map((s) => s.name)).toEqual(['Daily news']);
    expect(filterDataSources(sources(), { ...filters, enabled: 'disabled' })).toEqual([]);
  });

  it('distinguishes disabled, paused, failing, never-run and stale sources', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const base = sources().find((s) => s.registry === 'scrape_sources')!;
    expect(sourceHealth({ ...base, enabled: false, lastError: 'Error' }, now)).toBe('disabled');
    expect(sourceHealth({ ...base, autoPaused: true }, now)).toBe('paused');
    expect(sourceHealth({ ...base, failures: 1 }, now)).toBe('failing');
    expect(sourceHealth(base, now)).toBe('never');
    expect(sourceHealth({ ...base, lastSuccess: 'invalid' }, now)).toBe('never');
    // Weekly sources do not become stale after just two days.
    expect(sourceHealth({ ...base, lastSuccess: '2026-11-10T12:00:00Z' }, now)).toBe('healthy');
    expect(sourceHealth({ ...base, lastSuccess: '2026-10-01T12:00:00Z' }, now)).toBe('stale');
  });
});

describe('source management', () => {
  const update = vi.fn();
  const eq = vi.fn();
  const single = vi.fn();
  beforeEach(() => {
    single.mockReset().mockResolvedValue({ data: { id: 'same-id' }, error: null });
    eq.mockReset().mockReturnValue({ select: () => ({ single }) });
    update.mockReset().mockReturnValue({ eq });
    db.from.mockReturnValue({ update });
  });

  it.each(['scrape_sources', 'ingestion_sources', 'news_sources'] as const)(
    'writes the correct status column and verifies the row for %s',
    async (registry) => {
      const source = sources().find((s) => s.registry === registry)!;
      await setSourceEnabled(source, false);
      expect(db.from).toHaveBeenCalledWith(registry);
      expect(update).toHaveBeenCalledWith(
        registry === 'news_sources' ? { is_active: false } : { is_enabled: false },
      );
      expect(eq).toHaveBeenCalledWith('id', 'same-id');
      expect(single).toHaveBeenCalled();
    },
  );

  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'Permission denied' } },
  ])('does not report success when an update is rejected or affects no row', async (result) => {
    single.mockResolvedValue(result);
    await expect(setSourceEnabled(sources()[0], true)).rejects.toThrow();
  });

  it('saves news fields with validated frequency without clearing its automatic health pause', async () => {
    await saveSource(
      sources().find((s) => s.registry === 'news_sources')!,
      edits,
    );
    expect(update).toHaveBeenCalledWith({
      name: 'Updated source',
      url: 'https://example.org/new-feed',
      category: 'local',
      fetch_frequency: 60,
    });
  });

  it('only edits supported fields on import registrations', async () => {
    await saveSource(
      sources().find((s) => s.registry === 'ingestion_sources')!,
      edits,
    );
    expect(update).toHaveBeenCalledWith({ name: 'Updated source' });
  });

  it('updates scraper name and URL without changing schedule metadata', async () => {
    await saveSource(
      sources().find((s) => s.registry === 'scrape_sources')!,
      edits,
    );
    expect(update).toHaveBeenCalledWith({
      name: 'Updated source',
      url: 'https://example.org/new-feed',
    });
  });

  it.each([
    { name: ' ' },
    { url: 'javascript:alert(1)' },
    { url: 'not a URL' },
    { fetchFrequency: '0' },
    { fetchFrequency: '1.5' },
    { fetchFrequency: '' },
  ])('rejects invalid source edits before making a request: %s', async (invalid) => {
    await expect(
      saveSource(
        sources().find((s) => s.registry === 'news_sources')!,
        { ...edits, ...invalid },
      ),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('runs enabled import integrations and surfaces application-level failures', async () => {
    const source = { ...sources().find((s) => s.registry === 'ingestion_sources')!, enabled: true };
    db.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    await runDataSource(source);
    expect(db.invoke).toHaveBeenCalledWith('source-places', { body: {} });
    db.invoke.mockResolvedValueOnce({ data: { error: 'Missing API key' }, error: null });
    await expect(runDataSource(source)).rejects.toThrow('Missing API key');
  });

  it('rejects unsupported or disabled manual runs', async () => {
    for (const source of sources()) await expect(runDataSource(source)).rejects.toThrow();
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it('targets only the selected enabled scraper registration', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ data: { is_enabled: true, last_error: null }, error: null });
    const where = vi.fn().mockReturnValue({ maybeSingle: lookup });
    db.from.mockReturnValueOnce({ select: () => ({ eq: where }) });
    db.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    const source = {
      ...sources().find((s) => s.registry === 'ingestion_sources')!,
      enabled: true,
      identifier: 'selected-scraper',
      edgeFunction: 'scrape-web-sources',
    };
    await runDataSource(source);
    expect(db.from).toHaveBeenCalledWith('scrape_sources');
    expect(where).toHaveBeenCalledWith('slug', 'selected-scraper');
    expect(db.invoke).toHaveBeenCalledExactlyOnceWith('scrape-web-sources', {
      body: { source_slug: 'selected-scraper' },
    });
  });

  it.each([
    { data: { is_enabled: false, last_error: 'Retired: licence required' }, error: null },
    { data: null, error: null },
    { data: null, error: { message: 'Permission denied' } },
  ])(
    'does not bypass disabled, missing, or inaccessible scraper registrations: %s',
    async (result) => {
      db.from.mockReturnValueOnce({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }),
      });
      await expect(
        runDataSource({
          ...sources().find((s) => s.registry === 'ingestion_sources')!,
          enabled: true,
          edgeFunction: 'scrape-web-sources',
        }),
      ).rejects.toThrow();
      expect(db.invoke).not.toHaveBeenCalled();
    },
  );

  it.each([
    { skipped: true, missing_credentials: ['SHOPIFY_SHOP_DOMAIN'] },
    { success: false },
    { success: true, errors_count: 1 },
    { success: true, items_failed: 1 },
  ])(
    'surfaces skipped or failed import outcomes instead of reporting success: %s',
    async (data) => {
      db.invoke.mockResolvedValueOnce({ data, error: null });
      await expect(
        runDataSource({
          ...sources().find((s) => s.registry === 'ingestion_sources')!,
          enabled: true,
        }),
      ).rejects.toThrow();
    },
  );

  it('does not offer an entity-specific enrichment endpoint as a manual import', async () => {
    const source = {
      ...sources().find((s) => s.registry === 'ingestion_sources')!,
      enabled: true,
      edgeFunction: 'get-wikipedia-info',
    };
    expect(supportsManualSourceRun(source)).toBe(false);
    await expect(runDataSource(source)).rejects.toThrow('does not support a manual import');
    expect(db.invoke).not.toHaveBeenCalled();
  });
});
