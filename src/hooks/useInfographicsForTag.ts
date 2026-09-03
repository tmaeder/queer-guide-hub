/**
 * Resolves the glossary terms a set of figures references.
 *
 * There is no `tag_infographics` table and no new column: the binding is
 * declared in the code registry, and this hook only asks the database what it
 * already knows about those slugs. That matters because several figures
 * deliberately teach terms the glossary has not got yet — `safeword`,
 * `hard-limit` and `sex-assigned-at-birth` are on the backfill list precisely
 * BECAUSE a figure needs them — and because a handful of the terms they teach
 * are `deprecated` or `merged`.
 *
 * So a figure must never be able to emit a dead link. Three outcomes:
 *
 *  - **absent**  → no row; the chip prints the term unlinked and dashed.
 *  - **merged**  → follow `merged_into_id` and link to the canonical term.
 *  - **live / deprecated** → link to it.
 *
 * Lives in `src/hooks/` because `supabase.from()` is only legal there
 * (`queerguide/no-supabase-from-in-pages`).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ResolvedTerm } from '@/components/tags/infographics/types';

export type ResolvedTerms = Readonly<Record<string, ResolvedTerm | undefined>>;

interface TagRow {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  is_adult: boolean | null;
  merged_into_id: string | null;
}

export function useInfographicsForTag(slugs: readonly string[]) {
  // Sorted so the key is stable whatever order the registry hands them over
  // in — otherwise two figures teaching the same terms would miss each
  // other's cache entry.
  const key = [...slugs].sort();

  return useQuery({
    queryKey: ['infographic-terms', key],
    enabled: key.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ResolvedTerms> => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('id, name, slug, status, is_adult, merged_into_id')
        .in('slug', key);
      if (error) throw error;

      const rows = (data ?? []) as TagRow[];

      // A merged row points at its canonical term by id, so the canonical
      // slug has to be looked up. Only fetch the ids we actually need.
      const mergedTargets = [
        ...new Set(rows.map((r) => r.merged_into_id).filter((x): x is string => !!x)),
      ];
      let canonicalById = new Map<string, string>();
      if (mergedTargets.length > 0) {
        const { data: canon } = await supabase
          .from('unified_tags')
          .select('id, slug')
          .in('id', mergedTargets);
        canonicalById = new Map((canon ?? []).map((c) => [c.id as string, c.slug as string]));
      }

      const out: Record<string, ResolvedTerm> = {};
      for (const row of rows) {
        out[row.slug] = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          status: row.status ?? 'active',
          canonicalSlug: row.merged_into_id ? canonicalById.get(row.merged_into_id) : undefined,
          isAdult: row.is_adult ?? false,
        };
      }
      return out;
    },
  });
}
