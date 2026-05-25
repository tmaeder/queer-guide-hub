import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  communityLevel,
  communityTierName,
  progressToNextCommunityLevel,
  pointsToNextLevel,
  type CommunityDomain,
} from '@/lib/score';

export interface CommunityScoreRow {
  user_id: string;
  total_points: number;
  weekly_delta: number;
  monthly_delta: number;
  level: number;
  domain_breakdown: Partial<Record<CommunityDomain, number>>;
  last_event_at: string | null;
  updated_at: string;
}

export interface CommunityScoreView extends CommunityScoreRow {
  tier: string;
  progress: number; // 0..1 to next level
  pointsToNext: number;
}

function enrich(row: CommunityScoreRow): CommunityScoreView {
  return {
    ...row,
    tier: communityTierName(row.level),
    progress: progressToNextCommunityLevel(row.total_points, row.level),
    pointsToNext: pointsToNextLevel(row.total_points, row.level),
  };
}

function emptyRow(userId: string): CommunityScoreRow {
  return {
    user_id: userId,
    total_points: 0,
    weekly_delta: 0,
    monthly_delta: 0,
    level: 1,
    domain_breakdown: {},
    last_event_at: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Subscribes to the current user's row in user_community_score. Realtime
 * updates when triggers bump the score (e.g. after a venue checkin).
 */
export function useCommunityScore(): {
  data: CommunityScoreView | null;
  loading: boolean;
} {
  const { user } = useAuth();
  const [row, setRow] = useState<CommunityScoreRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_community_score' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setRow((data as CommunityScoreRow | null) ?? emptyRow(user.id));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`community-score:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_community_score',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = (payload.new as CommunityScoreRow | null) ?? null;
          if (next) setRow(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const view = useMemo(() => (row ? enrich(row) : null), [row]);
  return { data: view, loading };
}

/**
 * Convenience: derives level/tier/progress from any points value, without
 * needing a database row. Useful for previewing "you'd be level N" UX.
 */
export function deriveCommunityScore(points: number): {
  level: number;
  tier: string;
  progress: number;
  pointsToNext: number;
} {
  const lvl = communityLevel(points);
  return {
    level: lvl,
    tier: communityTierName(lvl),
    progress: progressToNextCommunityLevel(points, lvl),
    pointsToNext: pointsToNextLevel(points, lvl),
  };
}
