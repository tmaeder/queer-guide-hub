/* eslint-disable queerguide/no-supabase-from-in-pages -- realtime channel listener; not a data query */
import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { communityTierName } from '@/lib/score';

interface ScoreRow {
  user_id: string;
  level: number;
  total_points: number;
}

/**
 * Listens for level increases on user_community_score for the current user
 * and surfaces a toast on level-up. Distinct from AchievementToast — that one
 * fires per-achievement, this one fires when the Community Score crosses a
 * level threshold (from any contributing event).
 *
 * Mounted once near the app root so it fires anywhere a user does something
 * that bumps their score.
 */
export function CommunityLevelUpToast() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const lastLevelRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      lastLevelRef.current = null;
      return;
    }
    const userId = user.id;

    // Seed the baseline so we don't toast on mount for the user's current
    // level (only future bumps should fire).
    (async () => {
      const { data } = await untypedFrom('user_community_score')
        .select('level')
        .eq('user_id', userId)
        .maybeSingle();
      const lvl = (data as { level?: number } | null)?.level ?? null;
      if (lvl !== null) lastLevelRef.current = lvl;
    })();

    const channel = supabase
      .channel(`community-score-levelup-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_community_score',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = (payload.new as ScoreRow | null) ?? null;
          if (!next) return;
          const prev = lastLevelRef.current;
          lastLevelRef.current = next.level;
          if (prev === null || next.level <= prev) return;
          const tier = communityTierName(next.level);
          toast({
            title: t('score.levelUp.title', {
              level: next.level,
              defaultValue: 'Level {{level}} unlocked',
            }),
            description: t('score.levelUp.body', {
              tier,
              defaultValue: 'You reached {{tier}}.',
            }),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast, t]);

  // Decorative export so consumers can render the icon inline if needed; no DOM
  // for the toast itself — the toast portal handles rendering.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  Sparkles;
  return null;
}
