import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserGamification {
  user_id: string;
  points: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  total_checkins: number;
  total_venues: number;
  updated_at: string;
}

export interface UserAchievement {
  achievement_slug: string;
  earned_at: string;
}

export interface AchievementCatalogEntry {
  slug: string;
  name: string;
  description: string;
  icon: string;
  points_reward: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  criteria: Record<string, unknown>;
  sort_order: number;
}

const LEVEL_NAMES = [
  'Newcomer',
  'Explorer',
  'Local',
  'Regular',
  'Curator',
  'Champion',
  'Ambassador',
  'Insider',
  'Legend',
  'Icon',
];

export function levelName(level: number): string {
  return LEVEL_NAMES[Math.min(Math.max(1, level), 10) - 1];
}

export function pointsForLevel(level: number): number {
  // inverse of compute_level: level = floor(sqrt(points / 50)) + 1
  return Math.pow(Math.max(0, level - 1), 2) * 50;
}

export function progressToNextLevel(points: number, level: number): number {
  if (level >= 10) return 1;
  const floor = pointsForLevel(level);
  const ceil = pointsForLevel(level + 1);
  return Math.min(1, Math.max(0, (points - floor) / (ceil - floor)));
}

export function useGamification() {
  const { user } = useAuth();
  const [data, setData] = useState<UserGamification | null>(null);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [catalog, setCatalog] = useState<AchievementCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setData(null);
      setAchievements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [g, a, c] = await Promise.all([
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('user_gamification' as any)
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('user_achievements' as any)
          .select('achievement_slug, earned_at')
          .eq('user_id', user.id),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('achievements' as any)
          .select('*')
          .order('sort_order', { ascending: true }),
      ]);
      if (cancelled) return;
      setData((g.data as UserGamification | null) ?? null);
      setAchievements((a.data as UserAchievement[]) ?? []);
      setCatalog((c.data as AchievementCatalogEntry[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { data, achievements, catalog, loading };
}
