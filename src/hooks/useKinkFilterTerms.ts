/**
 * Kink & feature filter terms (darkroom, sling, fisting, …) with live counts.
 *
 * Read through `kink_filter_terms_list()`, a SECURITY DEFINER RPC that serves
 * REGISTRY tags only. Most of these tags are `is_sensitive`, which hides them
 * from anon on `unified_tags` itself; the RPC is the narrow door. Showing kink
 * terms is gated on the 18+ confirmation by the caller (`KinkFilterGroup`).
 */

import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { orderCardTags } from '@/lib/kinkCardTags';

export type KinkTermGroup = 'feature' | 'kink';
export type KinkTarget = 'events' | 'venues';

export interface KinkFilterTerm {
  slug: string;
  name: string;
  label: string;
  short_description: string | null;
  term_group: KinkTermGroup;
  sort: number;
  applies_to: KinkTarget[];
  public_without_18: boolean;
  event_count: number;
  venue_count: number;
}

export function useKinkFilterTerms() {
  return useQuery({
    queryKey: ['kink-filter-terms'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<KinkFilterTerm[]>('kink_filter_terms_list');
      if (error) throw new Error(error.message);
      return (data ?? []).map((t) => ({
        ...t,
        event_count: Number(t.event_count ?? 0),
        venue_count: Number(t.venue_count ?? 0),
      }));
    },
  });
}

/** Terms for one target, plus the count that matters there. */
export function termsFor(terms: KinkFilterTerm[] | undefined, target: KinkTarget) {
  return (terms ?? [])
    .filter((t) => t.applies_to.includes(target))
    .map((t) => ({ ...t, count: target === 'events' ? t.event_count : t.venue_count }));
}

export interface KinkFilterTermRow {
  tag_id: string;
  slug: string;
  name: string;
  label: string;
  short_description: string | null;
  term_group: KinkTermGroup;
  public_without_18: boolean;
}

/**
 * One registry term by slug. Used by /tags/:slug when the glossary row itself
 * is hidden from a signed-out reader (sensitive tag) but the reader has
 * confirmed 18+: the term's parties and venues can still be listed.
 */
export function useKinkFilterTerm(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['kink-filter-term', slug],
    enabled: enabled && !!slug,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<KinkFilterTermRow[]>('kink_filter_term', {
        p_slug: slug,
      });
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },
  });
}

/** Card tag chips: filter terms first, 18+ terms hidden until confirmed. */
export function useKinkCardTags(tags: string[] | null | undefined) {
  const { data } = useKinkFilterTerms();
  const { affirmed } = useAgeAffirmation();
  return orderCardTags(tags, data, affirmed);
}
