import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import type { Tables } from '@/integrations/supabase/types';

export const NEWS_SOURCE_PAGE_SIZE = 50;
export type SourceRecord = Tables<'news_sources'> & {
  article_count: number;
  publisher_name: string | null;
  publisher_status: string | null;
};
export type SourceForm = Pick<
  SourceRecord,
  | 'name'
  | 'url'
  | 'category'
  | 'source_type'
  | 'feed_type'
  | 'fetch_frequency'
  | 'is_active'
  | 'auto_publish'
  | 'organization_id'
> & { keywords: string[] } & ListenLinks;
/** Podcast platform links. Not handled by admin_news_source_save; written separately. */
export interface ListenLinks {
  apple_podcasts_url: string;
  spotify_url: string;
  youtube_url: string;
}
const LISTEN_KEYS = ['apple_podcasts_url', 'spotify_url', 'youtube_url'] as const;
export interface SourceFilters {
  search: string;
  state: string;
  organizationId?: string;
  unlinked: boolean;
  page: number;
}
export interface SourcePage {
  rows: SourceRecord[];
  total: number;
}
export interface PublisherOption {
  id: string;
  name: string;
  website: string | null;
  website_domain: string | null;
  status: string;
  domain_match: boolean;
}
export interface SourceArticle {
  id: string;
  title: string;
  published_at: string | null;
  quality_status: string | null;
  publisher_name: string | null;
}

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const query = untypedSupabase.rpc(name, args).returns<T>();
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  return data as T;
}
export function useNewsSourcesAdmin(filters: SourceFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin-news-sources', filters],
    enabled,
    queryFn: ({ signal }) =>
      rpc<SourcePage>(
        'admin_news_sources_browse',
        {
          p_search: filters.search,
          p_state: filters.state,
          p_organization_id: filters.organizationId ?? null,
          p_unlinked: filters.unlinked,
          p_offset: filters.page * NEWS_SOURCE_PAGE_SIZE,
        },
        signal,
      ),
  });
}
export function useSourcePublishers(search: string, url: string, enabled = true) {
  return useQuery({
    queryKey: ['admin-news-source-publishers', search, url],
    enabled,
    queryFn: ({ signal }) =>
      rpc<PublisherOption[]>(
        'admin_news_source_publishers',
        { p_search: search, p_url: url },
        signal,
      ),
  });
}
export function useSourceArticles(sourceId: string | null, page: number) {
  return useQuery({
    queryKey: ['admin-news-source-articles', sourceId, page],
    enabled: !!sourceId,
    queryFn: ({ signal }) =>
      rpc<{ rows: SourceArticle[]; total: number }>(
        'admin_news_source_articles',
        { p_source_id: sourceId, p_offset: page * NEWS_SOURCE_PAGE_SIZE },
        signal,
      ),
  });
}
export function useSaveNewsSource() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, form }: { source?: SourceRecord; form: SourceForm }) => {
      const saved = await rpc<SourceRecord>('admin_news_source_save', {
        p_id: source?.id ?? null,
        p_data: form,
        p_expected_updated_at: source?.updated_at ?? null,
      });
      // Admins/moderators UPDATE news_sources directly under RLS. Blank -> NULL,
      // and only write when something changed, so a news feed save stays one write.
      const links = Object.fromEntries(
        LISTEN_KEYS.map((k) => [k, form[k].trim() || null]),
      ) as Record<(typeof LISTEN_KEYS)[number], string | null>;
      const changed = LISTEN_KEYS.some((k) => links[k] !== (source?.[k] ?? null));
      if (!changed || !saved?.id) return saved;
      const { data, error } = await untypedFrom('news_sources')
        .update(links)
        .eq('id', saved.id)
        .select()
        .single();
      if (error) throw error;
      return { ...saved, ...(data as Partial<SourceRecord>) } as SourceRecord;
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['admin-news-sources'] });
    },
  });
}
export function useResumeNewsSource() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (source: SourceRecord) =>
      rpc<SourceRecord>('admin_news_source_resume', {
        p_id: source.id,
        p_expected_updated_at: source.updated_at,
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['admin-news-sources'] });
    },
  });
}
export function useCreateSourcePublisher() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ name, website }: { name: string; website: string }) =>
      rpc<{ id: string; name: string }>('admin_news_source_create_publisher', {
        p_name: name,
        p_website: website,
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['admin-news-source-publishers'] });
    },
  });
}
export function sourceForm(source?: SourceRecord, organizationId?: string): SourceForm {
  return {
    name: source?.name ?? '',
    url: source?.url ?? '',
    category: source?.category ?? 'general',
    source_type: source?.source_type ?? 'rss',
    feed_type: source?.feed_type ?? 'news',
    fetch_frequency: source?.fetch_frequency ?? 120,
    is_active: source?.is_active ?? true,
    auto_publish: source?.auto_publish ?? false,
    keywords: source?.keywords ?? [],
    organization_id: organizationId ?? source?.organization_id ?? null,
    apple_podcasts_url: source?.apple_podcasts_url ?? '',
    spotify_url: source?.spotify_url ?? '',
    youtube_url: source?.youtube_url ?? '',
  };
}
export function sourceError(error: unknown) {
  return error instanceof Error
    ? error.message
    : ((error as { message?: string })?.message ?? 'Could not save this source. Try again.');
}

export function useDeleteNewsSource() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (source: SourceRecord) =>
      rpc<string>('admin_news_source_delete', {
        p_id: source.id,
        p_expected_updated_at: source.updated_at,
        p_expected_article_count: source.article_count,
      }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-news-sources'] }),
        cache.invalidateQueries({ queryKey: ['admin-news-source-articles'] }),
      ]);
    },
  });
}
/**
 * Every source matching the list's current filters, for export. The browse
 * RPC is paged at NEWS_SOURCE_PAGE_SIZE, so this walks the pages until the
 * reported total is reached (or a short page ends it).
 */
export async function fetchAllNewsSources(
  filters: Omit<SourceFilters, 'page'>,
): Promise<SourceRecord[]> {
  const rows: SourceRecord[] = [];
  for (let page = 0; ; page++) {
    const res = await rpc<SourcePage>('admin_news_sources_browse', {
      p_search: filters.search,
      p_state: filters.state,
      p_organization_id: filters.organizationId ?? null,
      p_unlinked: filters.unlinked,
      p_offset: page * NEWS_SOURCE_PAGE_SIZE,
    });
    const batch = res?.rows ?? [];
    rows.push(...batch);
    if (batch.length < NEWS_SOURCE_PAGE_SIZE || rows.length >= (res?.total ?? 0)) return rows;
  }
}
