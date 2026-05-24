import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_read_date: string | null;
}

export function useReadingStreak() {
  const { user } = useAuth();
  const [streak, setStreak] = useState<StreakRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setStreak(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('news_reading_streak' as never, {
        p_user: user.id,
      } as never);
      if (cancelled) return;
      if (error || !data) {
        setStreak({ current_streak: 0, longest_streak: 0, last_read_date: null });
      } else {
        const row = Array.isArray(data) ? (data[0] as StreakRow | undefined) : (data as StreakRow);
        setStreak(
          row ?? { current_streak: 0, longest_streak: 0, last_read_date: null },
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { streak, loading };
}
