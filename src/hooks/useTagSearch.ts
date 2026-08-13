/**
 * Imperative tag lookup for the follow-a-tag picker (`FollowedTagsRail`).
 *
 * This used to be a direct `unified_tags` select filtered on `is_active` — a
 * column that does not exist; the flag is `status`. PostgREST returned an
 * error, `data` came back null, `setResults(null ?? [])` made that look like
 * "no matches", and the picker found nothing for its entire life.
 *
 * Rather than fix the column and keep a second search path, it now runs through
 * `searchTagsWithAliases` like the glossary index does, so "NB" finds
 * "non-binary" here too. The `{results, loading, search, clear}` API is
 * unchanged so the caller needed no edit.
 */

import { useState, useCallback } from 'react';
import { searchTagsWithAliases } from '@/hooks/useTagAliasSearch';

export interface TagSearchResult {
  id: string;
  name: string;
  slug: string | null;
}

/** A picker list, not a result page. */
const PICKER_LIMIT = 10;

export function useTagSearch() {
  const [results, setResults] = useState<TagSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const hits = await searchTagsWithAliases(q);
      setResults(hits.slice(0, PICKER_LIMIT).map(({ id, name, slug }) => ({ id, name, slug })));
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}
