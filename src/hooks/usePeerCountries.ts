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

/**
 * Returns up to 3 peer countries within ±2 equality_score of the anchor —
 * used by CompareRightsSideBySide to render a small "you vs. neighbors" matrix.
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
      min: Math.max(0, anchorEqualityScore - 2),
      max: Math.min(10, anchorEqualityScore + 2),
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
