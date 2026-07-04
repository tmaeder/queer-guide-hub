/**
 * useDuplicateCheck — non-blocking "is this already in Queer Guide?" lookup for the
 * submission forms. Debounces the typed title/name and calls the shared `find_duplicates`
 * RPC (trigram over search_documents). Returns matches the UI surfaces as a soft warning;
 * it never blocks submission.
 */

import { useEffect, useState } from 'react';
import { untypedRpc } from '@/integrations/supabase/untyped';

/** Submission type id → search_documents.entity_type. Types absent here are not indexed
 *  for duplicate detection (place, feedback) and are skipped. */
const SEARCH_ENTITY_TYPE: Record<string, string | undefined> = {
  venue: 'venue',
  hotel: 'venue',
  event: 'event',
  product: 'marketplace',
  personality: 'personality',
  news: 'news',
  tag: 'tag',
};

export interface DuplicateMatch {
  id: string;
  title: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  image_url: string | null;
  title_sim: number;
  vec_sim: number | null;
  match: 'title' | 'vector' | 'both';
}

/** The search entity_type for a submission type, or undefined when not indexed. */
export function duplicateEntityType(submissionTypeId: string): string | undefined {
  return SEARCH_ENTITY_TYPE[submissionTypeId];
}

export function useDuplicateCheck(submissionTypeId: string, title: string) {
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [loading, setLoading] = useState(false);

  const entityType = duplicateEntityType(submissionTypeId);
  const trimmed = title.trim();

  useEffect(() => {
    const valid = !!entityType && trimmed.length >= 3;
    let cancelled = false;

    const timer = setTimeout(
      async () => {
        if (!valid) {
          if (!cancelled) setMatches([]);
          return;
        }
        setLoading(true);
        // entityType is guaranteed defined at runtime (via `valid`) but TS can't
        // narrow it, so the generated p_content_type: string arg would type-error —
        // route through untypedRpc.
        const { data, error } = await untypedRpc('find_duplicates', {
          p_content_type: entityType,
          p_title: trimmed,
          p_limit: 5,
        });
        if (cancelled) return;
        setLoading(false);
        setMatches(!error && Array.isArray(data) ? (data as DuplicateMatch[]) : []);
      },
      valid ? 500 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [entityType, trimmed]);

  return { matches, loading };
}
