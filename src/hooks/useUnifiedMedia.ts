import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type {
  UnifiedMediaItem,
  SortBy,
  SortDir,
  StatusFilter,
  EntityTypeFilter,
} from '@/components/cms/MediaLibrary/types';

const PAGE_SIZE = 60;

export interface UnifiedMediaParams {
  page: number;
  search: string;
  statusFilter: StatusFilter;
  entityTypeFilter: EntityTypeFilter;
  sortBy: SortBy;
  sortDir: SortDir;
  enabled?: boolean;
}

function parseStructuredSearch(raw: string) {
  const filters: {
    text: string;
    alt?: string;
    format?: string;
    minSize?: number;
    maxSize?: number;
    minWidth?: number;
  } = { text: '' };

  const parts = raw.split(/\s+/);
  const textParts: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.startsWith('alt:')) {
      filters.alt = part.slice(4);
    } else if (lower.startsWith('format:')) {
      filters.format = part.slice(7).toLowerCase();
    } else if (lower.startsWith('size:>')) {
      filters.minSize = parseSizeStr(part.slice(6));
    } else if (lower.startsWith('size:<')) {
      filters.maxSize = parseSizeStr(part.slice(6));
    } else if (lower.startsWith('dim:>')) {
      filters.minWidth = parseInt(part.slice(5), 10) || undefined;
    } else {
      textParts.push(part);
    }
  }

  filters.text = textParts.join(' ');
  return filters;
}

function parseSizeStr(s: string): number | undefined {
  const match = s.match(/^(\d+(?:\.\d+)?)(kb|mb|gb)?$/i);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'gb') return num * 1024 * 1024 * 1024;
  if (unit === 'mb') return num * 1024 * 1024;
  if (unit === 'kb') return num * 1024;
  return num;
}

async function fetchUnifiedMedia(params: UnifiedMediaParams) {
  const { page, search, statusFilter, entityTypeFilter, sortBy, sortDir } = params;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = untypedFrom('admin_media_unified')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(from, to);

  if (search) {
    const parsed = parseStructuredSearch(search);

    if (parsed.text) {
      query = query.or(
        `display_name.ilike.%${parsed.text}%,alt_text.ilike.%${parsed.text}%,url.ilike.%${parsed.text}%`
      );
    }
    if (parsed.alt) {
      query = query.ilike('alt_text', `%${parsed.alt}%`);
    }
    if (parsed.format) {
      query = query.ilike('format', parsed.format);
    }
    if (parsed.minSize) {
      query = query.gte('file_size', parsed.minSize);
    }
    if (parsed.maxSize) {
      query = query.lte('file_size', parsed.maxSize);
    }
    if (parsed.minWidth) {
      query = query.gte('width', parsed.minWidth);
    }
  }

  switch (statusFilter) {
    case 'optimized':
      query = query.in('optimization_status', ['optimized', 'cdn_optimized']);
      break;
    case 'pending':
      query = query.eq('optimization_status', 'pending');
      break;
    case 'failed':
      query = query.eq('optimization_status', 'failed');
      break;
    case 'flagged':
      query = query.eq('is_flagged', true);
      break;
    case 'starred':
      query = query.eq('starred', true);
      break;
    case 'unused':
      query = query.eq('usage_count', 0);
      break;
  }

  if (entityTypeFilter !== 'all') {
    query = query.contains('entity_types', [entityTypeFilter]);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: (data || []) as UnifiedMediaItem[],
    totalCount: count ?? 0,
  };
}

export function useUnifiedMedia(params: UnifiedMediaParams) {
  const { page, search, statusFilter, entityTypeFilter, sortBy, sortDir, enabled = true } = params;

  return useQuery({
    queryKey: ['unified-media', page, search, statusFilter, entityTypeFilter, sortBy, sortDir],
    queryFn: () => fetchUnifiedMedia(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export { PAGE_SIZE };
