import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface NewsAuthorRow {
  author: string;
  article_count: number;
}
export const AUTHOR_PAGE_SIZE = 50;

export function useNewsAuthorsAdmin(search: string, page: number, enabled = true) {
  return useQuery({
    queryKey: ['admin-news-authors', search, page],
    enabled,
    queryFn: async () => {
      const { data, error } = await untypedRpc<NewsAuthorRow[]>('admin_news_authors', {
        p_search: search,
        p_offset: page * AUTHOR_PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface AuthorArticlePage {
  rows: Array<{
    id: string;
    title: string;
    published_at: string | null;
    quality_status: string | null;
    publisher_name: string | null;
    archived_at: string | null;
    duplicate_of_id: string | null;
  }>;
  total: number;
}
export function useNewsAuthorArticles(author: string | null, page: number) {
  return useQuery({
    queryKey: ['admin-news-author-articles', author, page],
    enabled: author !== null,
    queryFn: async () => {
      const { data, error } = await untypedRpc<AuthorArticlePage>('admin_news_author_articles', {
        p_author: author,
        p_offset: page * AUTHOR_PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? { rows: [], total: 0 };
    },
  });
}

export function useChangeNewsAuthor() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (change: {
      source: string;
      target: string;
      merge: boolean;
      count: number;
    }) => {
      const { data, error } = await untypedRpc<number>('admin_news_author_change', {
        p_source: change.source,
        p_target: change.target,
        p_merge: change.merge,
        p_expected_count: change.count,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-news-authors'] }),
        client.invalidateQueries({ queryKey: ['admin-news-author-articles'] }),
        client.invalidateQueries({
          predicate: (query) =>
            query.queryKey.some(
              (key) => typeof key === 'string' && /news|content-list|cms/.test(key),
            ),
        }),
      ]);
    },
  });
}

/**
 * Every author matching `search`, for export. admin_news_authors returns
 * AUTHOR_PAGE_SIZE rows per call and no total, so this pages until a short
 * page ends the list.
 */
export async function fetchAllNewsAuthors(search: string): Promise<NewsAuthorRow[]> {
  const rows: NewsAuthorRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await untypedRpc<NewsAuthorRow[]>('admin_news_authors', {
      p_search: search,
      p_offset: page * AUTHOR_PAGE_SIZE,
    });
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < AUTHOR_PAGE_SIZE) return rows;
  }
}
