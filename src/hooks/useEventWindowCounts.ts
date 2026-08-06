import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getPresetDateRange, type EventPresetId } from '@/components/events/PresetChips';

export type WindowPresetId = Extract<
  EventPresetId,
  'tonight' | 'this-weekend' | 'next-7-days' | 'pride'
>;

export type EventWindowCounts = Partial<Record<WindowPresetId, number>> & {
  /** Everything from now onward, regardless of window. */
  upcoming: number;
};

const WINDOW_PRESETS: WindowPresetId[] = ['tonight', 'this-weekend', 'next-7-days', 'pride'];

/**
 * How many events each time-window quick filter would actually return.
 *
 * `/events` offered "Tonight / This weekend / Next 7 days" over a corpus with
 * 315 future events — 18 of them inside the next seven days, spread across 130
 * cities. Every one of those chips was a dead end for almost every visitor, and
 * a chip that returns nothing reads as "the scene is dead" rather than "we have
 * no listings".
 *
 * Counting is cheap: `head: true` with `count: 'exact'` transfers no rows, and
 * the result is cached for five minutes. The counts let the UI disable an empty
 * window and say plainly how thin the data is, instead of letting the reader
 * discover it one click at a time.
 *
 * Deliberately scoped to the TIME windows. `free`, `featured` and `near-me`
 * depend on filters we cannot count without the user's location or a much wider
 * query, and `new-this-week` filters on `created_at` rather than a date window.
 */
export function useEventWindowCounts(city?: string | null) {
  return useQuery({
    queryKey: ['event-window-counts', city ?? null],
    staleTime: 300_000,
    queryFn: async (): Promise<EventWindowCounts> => {
      const base = () => {
        let q = supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .is('duplicate_of_id', null);
        if (city) q = q.eq('city', city);
        return q;
      };

      const nowIso = new Date().toISOString();
      const [upcomingRes, ...windowRes] = await Promise.all([
        base().gte('start_date', nowIso),
        ...WINDOW_PRESETS.map((id) => {
          const range = getPresetDateRange(id);
          if (!range) return Promise.resolve({ count: null });
          return base()
            .gte('start_date', range.start.toISOString())
            .lte('start_date', range.end.toISOString());
        }),
      ]);

      const out: EventWindowCounts = { upcoming: upcomingRes.count ?? 0 };
      WINDOW_PRESETS.forEach((id, i) => {
        const c = (windowRes[i] as { count: number | null })?.count;
        if (typeof c === 'number') out[id] = c;
      });
      return out;
    },
  });
}
