import { useQuery } from '@tanstack/react-query';
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
 *
 * Adult performers are ALWAYS excluded, and that is not configurable here.
 *
 * This query had no `is_adult` predicate at all until 2026-08-14, while
 * /personalities rendered "Hiding adult performers" directly above the strips
 * it feeds — the page stated a guarantee its own rails did not keep. Measured
 * that day: the ±3-day pool of 500 held 43-45 adult rows and the "Remembered
 * this week" strip was publicly showing one. `view_count DESC` makes it worse
 * rather than better, since those profiles draw traffic and so crowd the top
 * of the pool the window is taken from.
 *
 * No opt-in parameter, deliberately, because there is no state in which one
 * would be honoured: `EditorialEntries` is gated on `!hasAnyFilter`, and
 * `exclude_adult === false` counts toward `activeFilterCount`, so clicking
 * "Show all" unmounts these strips outright. The same hook also feeds
 * `HomeBornThisWeek` on the anonymous homepage, which has no toggle at all.
 *
 * `.eq('is_adult', false)` also drops NULLs. Verified safe: 0 of 1,612 public
 * personalities have a NULL `is_adult` (45 true / 1,567 false), so this loses
 * nobody legitimate. If the column ever becomes nullable in practice, prefer
 * `.not('is_adult', 'is', true)` over relaxing the check.
 */
export function useBornThisWeek(limit = 6, mode: 'born' | 'died' = 'born') {
  // react-query, not useEffect: this pulls 500 rows to filter a ±3-day window
  // client-side, and it used to do that on EVERY mount — including every
  // navigation back to the homepage. The window only turns over at midnight,
  // so an hour of cache costs nothing and saves 500 rows per remount.
  const query = useQuery({
    queryKey: ['born-this-week', limit, mode],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Personality[]> => {
      const dateCol = mode === 'born' ? 'birth_date' : 'death_date';
      const { data, error } = await supabase
        .from('personalities')
        .select('id,slug,name,image_url,profession,birth_date,death_date,is_living,view_count')
        .eq('visibility', 'public')
        .eq('is_adult', false)
        .is('duplicate_of_id', null)
        .not(dateCol, 'is', null)
        .order('view_count', { ascending: false })
        .limit(500);

      if (error) throw error;
      if (!data) return [];

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

      return filtered;
    },
  });

  // Same `{ items, loading }` shape the callers already destructure. A failed
  // query reads as "nothing this week", which is the correct render for a
  // self-hiding rail.
  return { items: query.data ?? [], loading: query.isLoading } satisfies State;
}
