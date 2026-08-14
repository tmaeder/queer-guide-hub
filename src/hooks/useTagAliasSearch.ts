/**
 * Alias-aware tag search.
 *
 * Wraps the `search_tags_with_aliases` RPC, which had been in the database with
 * zero call sites. It finds two things a substring filter over tag names
 * structurally cannot: a term reached by one of its `tag_aliases` ("NB" →
 * "non-binary"), and a trigram-similar misspelling ("lesbain" → "Lesbian").
 *
 * ── The RPC's ordering is broken, and this hook compensates ────────────────
 *
 * Its final clause is:
 *
 *     SELECT DISTINCT ON (id) … FROM combined
 *     ORDER BY id, match_score DESC NULLS LAST
 *     LIMIT p_limit
 *
 * `DISTINCT ON` forces the outer `ORDER BY` to lead with `id`, so the result
 * set comes back ordered by **uuid** and `LIMIT` then truncates an arbitrary
 * uuid-ordered slice. `p_limit: 20` does NOT return the twenty best matches —
 * it returns twenty effectively random ones.
 *
 * So: ask for the whole plausible match set and re-sort by `match_score` here.
 * Treat the RPC as a *recall* device, not a ranker. Fixing it server-side means
 * wrapping the DISTINCT ON in a subquery and re-ordering outside it; that is a
 * migration, and this hook has to be correct either way.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { MIN_SERVER_QUERY } from '@/lib/tags/tagsIndexState';

export interface TagAliasHit {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  image_url: string | null;
  is_sensitive: boolean | null;
  verification_status: string | null;
  /** `alias` means the query matched a synonym, not the canonical name. */
  match_via: 'canonical' | 'alias';
  match_score: number;
}

/** The whole plausible match set — see the ordering note above. Not a page
 *  size: the caller slices after re-sorting. */
const RECALL_LIMIT = 200;

export async function searchTagsWithAliases(
  q: string,
  limit = RECALL_LIMIT,
): Promise<TagAliasHit[]> {
  const query = q.trim();
  if (query.length < MIN_SERVER_QUERY) return [];

  const { data, error } = await supabase.rpc('search_tags_with_aliases', {
    q: query,
    p_limit: limit,
  });
  if (error) {
    console.error('search_tags_with_aliases failed:', error);
    return [];
  }

  // Re-sort client-side. The rows arrive in uuid order.
  return [...((data ?? []) as TagAliasHit[])].sort(
    (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0),
  );
}

export function useTagAliasSearch(query: string, limit = RECALL_LIMIT) {
  const debounced = useDebounce(query.trim(), 250);
  const enabled = debounced.length >= MIN_SERVER_QUERY;

  const { data, isFetching } = useQuery({
    queryKey: ['tag-alias-search', debounced, limit],
    queryFn: () => searchTagsWithAliases(debounced, limit),
    enabled,
    staleTime: 60 * 1000,
    // Without this the list blanks between keystrokes, which reads as "no
    // results" for the ~250ms the next request is in flight.
    placeholderData: keepPreviousData,
  });

  return { hits: data ?? [], loading: enabled && isFetching };
}
