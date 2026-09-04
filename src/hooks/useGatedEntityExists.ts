import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type GatedEntityType =
  'venue' | 'event' | 'organization' | 'milestone' | 'queer_village' | 'tag';

/**
 * "Does an anon-hidden row exist at this slug?" — the one query behind both
 * `GatedDetailFallback` and any page meta that has to say WHICH of the two
 * answers it is looking at.
 *
 * It lives in its own file rather than beside the component for the reason
 * eslint gives: `react-refresh/only-export-components` — a component module
 * that also exports a hook breaks Fast Refresh for every consumer.
 *
 * It is a shared hook rather than a second `useQuery` because the page and the
 * fallback MUST NOT be able to disagree: React Query dedupes on the key, so two
 * observers cost one request, and there is no second copy of the RPC name, the
 * argument names or the staleTime to drift out of step.
 *
 * `enabled` composes with — never replaces — the signed-out check. A signed-in
 * reader was already shown the row by RLS if it existed, so asking is pointless
 * and would spend a request on every 404.
 *
 * CALLER BEWARE: `isPending` is NOT "in flight". A disabled React Query sits at
 * status 'pending' forever, and this query is disabled for every signed-in
 * reader — so a caller that keys UI on `isPending` alone will strand them.
 * Test `fetchStatus !== 'idle'` for a request that is genuinely out.
 */
export function useGatedEntityExists(
  entityType: GatedEntityType,
  slug: string | undefined,
  enabled = true,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['gated-entity-exists', entityType, slug ?? null],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await untypedRpc('gated_entity_exists', {
        p_entity_type: entityType,
        p_slug: slug,
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled: enabled && !user && !!slug,
    staleTime: 5 * 60 * 1000,
  });
}
