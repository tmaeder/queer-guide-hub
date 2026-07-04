import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import {
  communityLevel,
  communityTierName,
  progressToNextCommunityLevel,
  pointsToNextLevel,
  type CommunityDomain,
} from '@/lib/score';

interface PublicScoreRow {
  user_id: string;
  total_points: number;
  level: number;
  weekly_delta: number;
  domain_breakdown: Partial<Record<CommunityDomain, number>> | null;
  last_event_at: string | null;
}

export interface PublicScoreView {
  total_points: number;
  level: number;
  tier: string;
  progress: number;
  pointsToNext: number;
  weekly_delta: number;
  domain_breakdown: Partial<Record<CommunityDomain, number>>;
  last_event_at: string | null;
}

/**
 * Reads another user's Community Score. user_community_score has a public-read
 * RLS policy so this works for both signed-in and anonymous viewers.
 */
export function usePublicCommunityScore(userId: string | null | undefined): {
  score: PublicScoreView | null;
  loading: boolean;
} {
  const [row, setRow] = useState<PublicScoreRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await untypedFrom('user_community_score')
        .select(
          'user_id, total_points, level, weekly_delta, domain_breakdown, last_event_at',
        )
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setRow((data as PublicScoreRow | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!row) {
    return { score: null, loading };
  }
  const lvl = row.level || communityLevel(row.total_points);
  const view: PublicScoreView = {
    total_points: row.total_points,
    level: lvl,
    tier: communityTierName(lvl),
    progress: progressToNextCommunityLevel(row.total_points, lvl),
    pointsToNext: pointsToNextLevel(row.total_points, lvl),
    weekly_delta: row.weekly_delta,
    domain_breakdown: row.domain_breakdown ?? {},
    last_event_at: row.last_event_at,
  };
  return { score: view, loading };
}
