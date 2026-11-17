import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export const SOURCE_REGISTRIES = {
  scrape_sources: 'Scrapers',
  ingestion_sources: 'API & imports',
  news_sources: 'News & feeds',
} as const;

export type SourceRegistry = keyof typeof SOURCE_REGISTRIES;
export type SourceHealth = 'disabled' | 'paused' | 'failing' | 'never' | 'stale' | 'healthy';

export interface DataSource {
  id: string;
  registry: SourceRegistry;
  name: string;
  identifier: string;
  type: string;
  url: string | null;
  target: string;
  enabled: boolean;
  schedule: string | null;
  intervalHours: number | null;
  lastRun: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  failures: number;
  fetched: number;
  autoPaused: boolean;
  pauseReason: string | null;
  edgeFunction: string | null;
  category: string | null;
  fetchFrequency: number | null;
}

type ScrapeSource = Pick<
  Tables<'scrape_sources'>,
  | 'id'
  | 'name'
  | 'slug'
  | 'url'
  | 'scrape_method'
  | 'target_table'
  | 'is_enabled'
  | 'schedule_cron'
  | 'schedule_interval_hours'
  | 'last_run_at'
  | 'last_success_at'
  | 'last_error'
  | 'consecutive_failures'
  | 'total_items_fetched'
>;
type ImportSource = Pick<
  Tables<'ingestion_sources'>,
  | 'id'
  | 'name'
  | 'slug'
  | 'source_type'
  | 'target_table'
  | 'is_enabled'
  | 'schedule'
  | 'last_run_at'
  | 'last_success_at'
  | 'last_error'
  | 'total_items_fetched'
  | 'edge_function'
>;
type NewsSource = Pick<
  Tables<'news_sources'>,
  | 'id'
  | 'name'
  | 'url'
  | 'source_type'
  | 'feed_type'
  | 'is_active'
  | 'fetch_frequency'
  | 'last_fetched_at'
  | 'last_successful_fetch'
  | 'last_error'
  | 'consecutive_failures'
  | 'articles_fetched'
  | 'auto_paused'
  | 'auto_paused_reason'
  | 'category'
>;

const PAGE_SIZE = 500;

// A registry can exceed the API's default row cap. Read every page in stable order.
export async function readSourcePages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function combineDataSources(
  scrapers: ScrapeSource[],
  imports: ImportSource[],
  news: NewsSource[],
): DataSource[] {
  return [
    ...scrapers.map((s): DataSource => ({
      id: s.id,
      registry: 'scrape_sources',
      name: s.name,
      identifier: s.slug,
      type: s.scrape_method,
      url: s.url,
      target: s.target_table,
      enabled: !!s.is_enabled,
      schedule: s.schedule_cron,
      intervalHours: s.schedule_interval_hours,
      lastRun: s.last_run_at,
      lastSuccess: s.last_success_at,
      lastError: s.last_error,
      failures: s.consecutive_failures ?? 0,
      fetched: s.total_items_fetched ?? 0,
      autoPaused: false,
      pauseReason: null,
      edgeFunction: null,
      category: null,
      fetchFrequency: null,
    })),
    ...imports.map((s): DataSource => ({
      id: s.id,
      registry: 'ingestion_sources',
      name: s.name,
      identifier: s.slug,
      type: s.source_type,
      url: null,
      target: s.target_table,
      enabled: s.is_enabled,
      schedule: s.schedule,
      intervalHours: null,
      lastRun: s.last_run_at,
      lastSuccess: s.last_success_at,
      lastError: s.last_error,
      failures: 0,
      fetched: s.total_items_fetched ?? 0,
      autoPaused: false,
      pauseReason: null,
      edgeFunction: s.edge_function,
      category: null,
      fetchFrequency: null,
    })),
    ...news.map((s): DataSource => ({
      id: s.id,
      registry: 'news_sources',
      name: s.name,
      identifier: s.id,
      type: `${s.feed_type} / ${s.source_type}`,
      url: s.url,
      target: 'news_articles',
      enabled: s.is_active,
      schedule: `Every ${s.fetch_frequency} minutes`,
      intervalHours: s.fetch_frequency / 60,
      lastRun: s.last_fetched_at,
      lastSuccess: s.last_successful_fetch,
      lastError: s.last_error,
      failures: s.consecutive_failures,
      fetched: s.articles_fetched ?? 0,
      autoPaused: s.auto_paused,
      pauseReason: s.auto_paused_reason,
      edgeFunction: null,
      category: s.category,
      fetchFrequency: s.fetch_frequency,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name) || sourceKey(a).localeCompare(sourceKey(b)));
}

export function sourceKey(source: Pick<DataSource, 'registry' | 'id'>): string {
  return `${source.registry}:${source.id}`;
}

export async function fetchDataSources(signal?: AbortSignal): Promise<DataSource[]> {
  const [scrapers, imports, news] = await Promise.all([
    readSourcePages((from, to) => {
      const query = supabase
        .from('scrape_sources')
        .select(
          'id,name,slug,url,scrape_method,target_table,is_enabled,schedule_cron,schedule_interval_hours,last_run_at,last_success_at,last_error,consecutive_failures,total_items_fetched',
        )
        .order('id')
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, 'Scrapers'),
    readSourcePages((from, to) => {
      const query = supabase
        .from('ingestion_sources')
        .select(
          'id,name,slug,source_type,target_table,is_enabled,schedule,last_run_at,last_success_at,last_error,total_items_fetched,edge_function',
        )
        .order('id')
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, 'API & imports'),
    readSourcePages((from, to) => {
      const query = supabase
        .from('news_sources')
        .select(
          'id,name,url,source_type,feed_type,is_active,fetch_frequency,last_fetched_at,last_successful_fetch,last_error,consecutive_failures,articles_fetched,auto_paused,auto_paused_reason,category',
        )
        .order('id')
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, 'News & feeds'),
  ]);
  return combineDataSources(scrapers, imports, news);
}

export function sourceHealth(source: DataSource, now = Date.now()): SourceHealth {
  if (!source.enabled) return 'disabled';
  if (source.autoPaused) return 'paused';
  if (source.lastError || source.failures > 0) return 'failing';
  if (!source.lastSuccess || !Number.isFinite(Date.parse(source.lastSuccess))) return 'never';
  const staleAfterHours = Math.max(48, (source.intervalHours ?? 0) * 2);
  return now - Date.parse(source.lastSuccess) > staleAfterHours * 3_600_000 ? 'stale' : 'healthy';
}

export interface SourceFilters {
  search: string;
  registry: string;
  type: string;
  enabled: string;
  health: string;
}

export function filterDataSources(sources: DataSource[], filters: SourceFilters): DataSource[] {
  const search = filters.search.trim().toLowerCase();
  return sources.filter(
    (s) =>
      (filters.registry === 'all' || s.registry === filters.registry) &&
      (filters.type === 'all' || s.type === filters.type) &&
      (filters.enabled === 'all' || s.enabled === (filters.enabled === 'enabled')) &&
      (filters.health === 'all' || sourceHealth(s) === filters.health) &&
      (!search ||
        [s.name, s.identifier, s.url, s.target, s.type, SOURCE_REGISTRIES[s.registry]].some(
          (value) => value?.toLowerCase().includes(search),
        )),
  );
}

async function verifyUpdate(
  result: PromiseLike<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>,
): Promise<void> {
  const { data, error } = await result;
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Source was not updated. Check your permissions and refresh.');
}

export async function setSourceEnabled(source: DataSource, enabled: boolean): Promise<void> {
  switch (source.registry) {
    case 'news_sources':
      return verifyUpdate(
        supabase
          .from('news_sources')
          .update({ is_active: enabled })
          .eq('id', source.id)
          .select('id')
          .single(),
      );
    case 'ingestion_sources':
      return verifyUpdate(
        supabase
          .from('ingestion_sources')
          .update({ is_enabled: enabled })
          .eq('id', source.id)
          .select('id')
          .single(),
      );
    case 'scrape_sources':
      return verifyUpdate(
        supabase
          .from('scrape_sources')
          .update({ is_enabled: enabled })
          .eq('id', source.id)
          .select('id')
          .single(),
      );
  }
}

export interface SourceEdits {
  name: string;
  url: string;
  category: string;
  fetchFrequency: string;
}

export async function saveSource(source: DataSource, edits: SourceEdits): Promise<void> {
  const name = edits.name.trim();
  if (!name) throw new Error('Enter a source name.');
  const url = edits.url.trim();
  if (source.registry !== 'ingestion_sources') {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Enter a valid HTTP or HTTPS URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Enter a valid HTTP or HTTPS URL.');
    }
  }
  switch (source.registry) {
    case 'news_sources': {
      const frequency = Number(edits.fetchFrequency);
      if (!Number.isSafeInteger(frequency) || frequency < 1) {
        throw new Error('Fetch frequency must be a positive whole number of minutes.');
      }
      return verifyUpdate(
        supabase
          .from('news_sources')
          .update({
            name,
            url,
            category: edits.category.trim(),
            fetch_frequency: frequency,
          })
          .eq('id', source.id)
          .select('id')
          .single(),
      );
    }
    case 'scrape_sources':
      return verifyUpdate(
        supabase
          .from('scrape_sources')
          .update({ name, url })
          .eq('id', source.id)
          .select('id')
          .single(),
      );
    case 'ingestion_sources':
      return verifyUpdate(
        supabase
          .from('ingestion_sources')
          .update({ name })
          .eq('id', source.id)
          .select('id')
          .single(),
      );
  }
}

export function supportsManualSourceRun(source: DataSource): boolean {
  return (
    source.registry === 'ingestion_sources' &&
    Boolean(source.edgeFunction) &&
    !source.edgeFunction?.startsWith('get-')
  );
}

export async function runDataSource(source: DataSource): Promise<void> {
  if (!supportsManualSourceRun(source) || !source.edgeFunction || !source.enabled) {
    throw new Error('This source does not support a manual import.');
  }
  const body: Record<string, string> = {};
  if (source.edgeFunction === 'scrape-web-sources') {
    const { data: registration, error: lookupError } = await supabase
      .from('scrape_sources')
      .select('is_enabled,last_error')
      .eq('slug', source.identifier)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!registration) throw new Error('Scraper registration not found.');
    if (!registration.is_enabled) {
      throw new Error(
        registration.last_error || 'This scraper is disabled in the scraper registry.',
      );
    }
    body.source_slug = source.identifier;
  }
  const { data, error } = await supabase.functions.invoke(source.edgeFunction, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  if (data?.skipped === true) {
    const missing = Array.isArray(data.missing_credentials)
      ? data.missing_credentials.join(', ')
      : '';
    throw new Error(`Import skipped: ${missing || data.reason || 'source unavailable'}`);
  }
  if (data?.success === false || Number(data?.errors_count) > 0 || Number(data?.items_failed) > 0) {
    throw new Error('The import reported failures. Check the source run details.');
  }
}
