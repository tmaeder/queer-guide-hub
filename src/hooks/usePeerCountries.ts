import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PeerCountry {
  id: string;
  name: string;
  slug: string | null;
  code: string | null;
  flag_emoji: string | null;
  equality_score: number | null;
}

/** equality_score is 0-100. Peers sit within this many points of the anchor. */
const PEER_BAND = 5;

/**
 * Returns up to 3 peer countries within ±5 equality_score of the anchor —
 * used by CompareRightsSideBySide to render a small "you vs. neighbors" matrix.
 *
 * The band was `Math.min(10, score + 2)` until 2026-08-07: a leftover from a
 * retired 0-10 scale. On the 0-100 scale any anchor above 12 produced
 * `min > max`, the `.gte().lte()` pair matched zero rows, and the component
 * returned null for effectively every country on the site. It failed silently
 * because "no peers found" is a legitimate state that renders nothing.
 */
export function usePeerCountries({
  anchorCountryId,
  anchorEqualityScore,
}: {
  anchorCountryId: string;
  anchorEqualityScore: number | null;
}) {
  const range = useMemo(() => {
    if (anchorEqualityScore == null) return null;
    return {
      min: Math.max(0, anchorEqualityScore - PEER_BAND),
      max: Math.min(100, anchorEqualityScore + PEER_BAND),
    };
  }, [anchorEqualityScore]);

  return useQuery({
    queryKey: ['peer-countries', anchorCountryId, range],
    enabled: Boolean(anchorCountryId),
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<PeerCountry[]> => {
      let q = supabase
        .from('countries')
        .select('id, name, slug, code, flag_emoji, equality_score')
        .neq('id', anchorCountryId)
        .not('equality_score', 'is', null);
      if (range) {
        q = q.gte('equality_score', range.min).lte('equality_score', range.max);
      }
      const { data, error } = await q.order('equality_score', { ascending: false }).limit(3);
      if (error) throw error;
      return (data ?? []) as PeerCountry[];
    },
  });
}
