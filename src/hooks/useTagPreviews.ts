import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isAdultTag } from '@/components/resources/categoryMeta';

/**
 * Lightweight glossary previews for tag chips, rails and the homepage band.
 * One columns list shared by every preview surface so the per-slug cache
 * entries seeded by the batch hook are interchangeable with single fetches.
 */
export const TAG_PREVIEW_COLUMNS =
  'id,slug,name,short_description,description,category,is_adult,is_sensitive,image_url,usage_count';

export interface TagPreview {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  category: string | null;
  is_adult: boolean;
  is_sensitive: boolean | null;
  image_url: string | null;
  usage_count: number | null;
}

const STALE_TIME = 30 * 60_000;

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Batched preview fetch. Misses (free-text tags with no glossary entry) are
 * simply absent from the result — never an error.
 */
export async function fetchTagPreviews(slugs: string[]): Promise<TagPreview[]> {
  const normalized = [...new Set(slugs.map(normalizeSlug).filter(Boolean))];
  if (normalized.length === 0) return [];
  const { data, error } = await supabase
    .from('unified_tags')
    .select(TAG_PREVIEW_COLUMNS)
    .in('slug', normalized)
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []) as TagPreview[];
}

/**
 * Single-slug preview, lazy by default — pass `enabled` from the hover-card
 * open state so no request fires before the card actually opens.
 */
export function useTagPreview(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
  const normalized = normalizeSlug(slug);
  return useQuery({
    queryKey: ['tag-preview', normalized],
    queryFn: async () => (await fetchTagPreviews([normalized]))[0] ?? null,
    enabled: enabled && normalized.length > 0,
    staleTime: STALE_TIME,
  });
}

/**
 * Deterministic term-of-the-day rotation: the same date shows the same terms
 * for everyone (no Math.random — testable, hydration-safe). Wraps around the
 * pool so every term gets its day.
 */
export function pickOfTheDay<T>(pool: T[], date: Date, count: number): T[] {
  if (pool.length === 0) return [];
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000);
  const start = dayOfYear % pool.length;
  return Array.from(
    { length: Math.min(count, pool.length) },
    (_, i) => pool[(start + i) % pool.length],
  );
}

/**
 * Quality-ranked, non-adult, defined-term pool for the homepage glossary
 * band. The adult-category predicate is applied client-side too, catching
 * rows whose is_adult flag lags their category.
 */
export function useHomeGlossaryPool() {
  return useQuery({
    queryKey: ['home-glossary-pool'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select(TAG_PREVIEW_COLUMNS)
        .eq('status', 'active')
        .eq('is_adult', false)
        .eq('seo_indexable', true)
        .not('short_description', 'is', null)
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(24);
      if (error) throw error;
      return ((data ?? []) as TagPreview[]).filter((p) => !isAdultTag(p));
    },
    staleTime: 24 * 60 * 60_000,
  });
}

/**
 * Batch previews for a rail. Seeds the per-slug cache so a later chip hover
 * on the same page is free.
 */
export function useTagPreviews(slugs: string[]) {
  const queryClient = useQueryClient();
  const normalized = [...new Set(slugs.map(normalizeSlug).filter(Boolean))].sort();
  return useQuery({
    queryKey: ['tag-previews', normalized.join('|')],
    queryFn: async () => {
      const rows = await fetchTagPreviews(normalized);
      for (const row of rows) {
        queryClient.setQueryData(['tag-preview', row.slug.toLowerCase()], row);
      }
      return rows;
    },
    enabled: normalized.length > 0,
    staleTime: STALE_TIME,
  });
}
