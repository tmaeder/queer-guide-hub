import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type {
  UnifiedMediaItem,
  SortBy,
  SortDir,
  StatusFilter,
  EntityTypeFilter,
  FormatFilter,
  SourceTypeFilter,
  AccessLevelFilter,
  BrandCategoryFilter,
} from '@/components/cms/MediaLibrary/types';

const PAGE_SIZE = 60;

export interface UnifiedMediaParams {
  page: number;
  search: string;
  statusFilter: StatusFilter;
  entityTypeFilter: EntityTypeFilter;
  formatFilter: FormatFilter;
  sourceTypeFilter: SourceTypeFilter;
  accessFilter: AccessLevelFilter;
  brandCategoryFilter: BrandCategoryFilter;
  tagFilter: string[];
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
    tags: string[];
    access?: string;
    cat?: string;
  } = { text: '', tags: [] };

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
    } else if (lower.startsWith('tag:')) {
      const t = part.slice(4).toLowerCase();
      if (t) filters.tags.push(t);
    } else if (lower.startsWith('access:')) {
      filters.access = part.slice(7).toLowerCase();
    } else if (lower.startsWith('cat:')) {
      filters.cat = part.slice(4).toLowerCase();
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
  const { page, search, statusFilter, entityTypeFilter, formatFilter, sourceTypeFilter, accessFilter, brandCategoryFilter, tagFilter, sortBy, sortDir } = params;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = untypedFrom('admin_media_unified')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(from, to);

  // Tag filters combine the structured `tag:` tokens with explicit chip selections.
  const tagSet = new Set<string>(tagFilter.map((t) => t.toLowerCase()));

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
    parsed.tags.forEach((t) => tagSet.add(t));
    if (parsed.access) {
      query = query.eq('access_level', parsed.access);
    }
    if (parsed.cat) {
      query = query.eq('brand_category', parsed.cat);
    }
  }

  if (accessFilter !== 'all') {
    query = query.eq('access_level', accessFilter);
  }
  if (brandCategoryFilter !== 'all') {
    query = query.eq('brand_category', brandCategoryFilter);
  }
  if (tagSet.size > 0) {
    // Array-contains: rows whose tags[] include every selected slug.
    query = query.contains('tags', Array.from(tagSet));
  }

  switch (statusFilter) {
    case 'optimized':
      query = query.in('optimization_status', ['optimized', 'cdn_optimized']);
      break;
    case 'pending':
      query = query.eq('optimization_status', 'pending');
      break;
    case 'processing':
      query = query.eq('optimization_status', 'processing');
      break;
    case 'failed':
      query = query.eq('optimization_status', 'failed');
      break;
    case 'skipped':
      query = query.eq('optimization_status', 'skipped');
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
    case 'no_alt':
      query = query.is('alt_text', null);
      break;
  }

  if (entityTypeFilter !== 'all') {
    query = query.contains('entity_types', [entityTypeFilter]);
  }

  if (formatFilter !== 'all') {
    query = query.eq('format', formatFilter);
  }

  if (sourceTypeFilter !== 'all') {
    query = query.eq('source_type', sourceTypeFilter);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: (data || []) as UnifiedMediaItem[],
    totalCount: count ?? 0,
  };
}

export function useUnifiedMedia(params: UnifiedMediaParams) {
  const { page, search, statusFilter, entityTypeFilter, formatFilter, sourceTypeFilter, accessFilter, brandCategoryFilter, tagFilter, sortBy, sortDir, enabled = true } = params;

  return useQuery({
    queryKey: ['unified-media', page, search, statusFilter, entityTypeFilter, formatFilter, sourceTypeFilter, accessFilter, brandCategoryFilter, tagFilter.join(','), sortBy, sortDir],
    queryFn: () => fetchUnifiedMedia(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export { PAGE_SIZE };
