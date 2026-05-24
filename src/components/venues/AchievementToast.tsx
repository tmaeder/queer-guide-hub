/* eslint-disable queerguide/no-supabase-from-in-pages -- realtime channel listener; not a data query */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface AchievementMeta {
  slug: string;
  name: string;
  description: string;
  points_reward: number;
}

/**
 * Listens for newly-inserted rows in user_achievements for the current user
 * and surfaces a toast. Mounted once at the /venues root.
 */
export function AchievementToast() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    // Seed seen set so we don't re-toast on mount for historical unlocks.
    (async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_achievements' as any)
        .select('achievement_slug')
        .eq('user_id', userId);
      for (const row of (data as Array<{ achievement_slug: string }>) ?? []) {
        seenRef.current.add(row.achievement_slug);
      }
    })();

    const channel = supabase
      .channel(`user-achievements-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const slug = (payload.new as { achievement_slug?: string }).achievement_slug;
          if (!slug || seenRef.current.has(slug)) return;
          seenRef.current.add(slug);
          const { data: meta } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('achievements' as any)
            .select('slug, name, description, points_reward')
            .eq('slug', slug)
            .maybeSingle();
          const m = (meta as AchievementMeta | null) ?? null;
          toast({
            title: t('venues.achievementToast.unlocked', { name: m?.name ?? slug, defaultValue: 'Unlocked: {{name}}' }),
            description:
              m?.description
                ? `${m.description} (+${m.points_reward} pts)`
                : t('venues.achievementToast.fallback', 'New achievement earned'),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast, t]);

  return null;
}
