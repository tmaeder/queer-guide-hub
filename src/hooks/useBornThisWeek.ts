import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Personality } from '@/hooks/usePersonalities';

interface State {
  items: Personality[];
  loading: boolean;
}

/** Day-of-year (1-366) so the +/- 3 day window wraps cleanly across year boundaries. */
function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = d.getTime() - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Returns popular personalities whose birth/death day falls within +/-3 days
 * of today.
 *
 * Implementation: fetches the top ~500 personalities by view_count that have
 * the relevant date, then filters client-side. Cheap (one round-trip, ~500
 * rows) and needs no schema changes. Promote to a server-side RPC if the
 * list grows.
 */
export function useBornThisWeek(limit = 6, mode: 'born' | 'died' = 'born') {
  const [state, setState] = useState<State>({ items: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dateCol = mode === 'born' ? 'birth_date' : 'death_date';
      const { data, error } = await supabase
        .from('personalities')
        .select('id,slug,name,image_url,profession,birth_date,death_date,is_living,view_count')
        .eq('visibility', 'public')
        .is('duplicate_of_id', null)
        .not(dateCol, 'is', null)
        .order('view_count', { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (error || !data) {
        setState({ items: [], loading: false });
        return;
      }

      const today = new Date();
      const todayDoy = dayOfYear(today);
      const inWindow = (iso: string) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return false;
        const doy = dayOfYear(new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
        const diff = Math.min(
          Math.abs(doy - todayDoy),
          365 - Math.abs(doy - todayDoy),
        );
        return diff <= 3;
      };

      const filtered = data
        .filter((row) => {
          const v = mode === 'born' ? row.birth_date : row.death_date;
          return v && inWindow(v as string);
        })
        .slice(0, limit)
        // Match Personality interface shape closely enough for the card preview.
        .map((row) => ({
          ...row,
          fields: [],
          achievements: [],
          social_links: {},
          tags: [],
          verification_status: 'pending' as const,
          visibility: 'public' as const,
          is_featured: false,
          created_at: '',
          updated_at: '',
          view_count: row.view_count ?? 0,
        })) as unknown as Personality[];

      setState({ items: filtered, loading: false });
    })().catch(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });
    return () => {
      cancelled = true;
    };
  }, [limit, mode]);

  return state;
}
