import { useCallback, useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { MediaItem, EntityTypeFilter } from '@/components/cms/MediaLibrary/types';

const PAGE_SIZE = 60;

interface UseImageAssetsParams {
  enabled: boolean;
  page: number;
  search: string;
  entityTypeFilter: EntityTypeFilter;
}

function formatFromUrl(url: string): string {
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'image/jpeg';
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split('/').pop() || 'image';
  } catch {
    return 'image';
  }
}

export function useImageAssets({ enabled, page, search, entityTypeFilter }: UseImageAssetsParams) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const selectExpr = entityTypeFilter !== 'all'
        ? `*, image_asset_links!inner(entity_type, entity_id)`
        : `*, image_asset_links(entity_type, entity_id)`;

      let query = untypedFrom('image_assets')
        .select(selectExpr, { count: 'exact' })
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (entityTypeFilter !== 'all') {
        query = query.eq('image_asset_links.entity_type', entityTypeFilter);
      }

      if (search) {
        query = query.ilike('url', `%${search}%`);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('image_assets query error:', error);
        setItems([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const mapped: MediaItem[] = (data || []).map((row: Record<string, unknown>) => {
        const url = row.url as string;
        const links = (row.image_asset_links || []) as Array<{ entity_type: string; entity_id: string }>;
        const entityTypes = [...new Set(links.map(l => l.entity_type))];

        return {
          id: row.id as string,
          filename: filenameFromUrl(url),
          original_filename: filenameFromUrl(url),
          mime_type: row.format ? `image/${row.format}` : formatFromUrl(url),
          file_size: (row.bytes as number) || 0,
          width: row.width as number | undefined,
          height: row.height as number | undefined,
          external_url: url,
          uploaded_by: (row.source as string) || 'system',
          created_at: row.created_at as string,
          alt_text: row.alt_text as string | undefined,
          usage_count: links.length,
          entity_types: entityTypes,
          asset_status: row.status as string,
          is_flagged: row.is_flagged as boolean,
          source: 'image_assets',
          optimized_url: row.optimized_url as string | undefined,
          thumbnail_url: row.thumbnail_url as string | undefined,
          optimization_status: (row.optimization_status as string) || 'not_optimized',
        };
      });

      setItems(mapped);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('useImageAssets error:', err);
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled, page, search, entityTypeFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  return { items, totalCount, loading, pageSize: PAGE_SIZE, refetch: fetch };
}
