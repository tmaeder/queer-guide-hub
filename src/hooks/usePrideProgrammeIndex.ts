import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ProgrammeChild } from '@/utils/prideProgramme';

/**
 * Every programme child of a set of umbrellas, in ONE request, indexed by parent.
 *
 * `/pride` renders up to a few hundred umbrellas; asking `event_programme` per
 * row would be a few hundred round trips for a date line. This is the batched
 * shape instead — and it stays a plain PostgREST read on `events`, so the
 * safety-gating RLS filters gated children exactly as it does everywhere else.
 *
 * The id list is capped: a PostgREST `in()` is serialised into the URL and
 * starts failing silently somewhere past ~600 ids (the same cap `useEvents`
 * applies to venue ids). A year holds far fewer prides than that, so the cap is
 * a guard rail, not a limit anyone meets.
 */
export function usePrideProgrammeIndex(parentIds: string[], enabled = true) {
  const ids = parentIds.slice(0, 400);
  return useQuery({
    queryKey: ['pride-programme-index', ids],
    enabled: enabled && ids.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Map<string, ProgrammeChild[]>> => {
      const { data, error } = await supabase
        .from('events')
        .select(
          `id, slug, title, start_date, end_date, pride_subtypes, event_type,
           venue_name, address, ticket_url, is_free, status, parent_event_id`,
        )
        .in('parent_event_id', ids)
        .is('duplicate_of_id', null)
        .neq('status', 'archived')
        .order('start_date', { ascending: true });

      if (error) throw error;
      const out = new Map<string, ProgrammeChild[]>();
      for (const row of data ?? []) {
        const parent = row.parent_event_id;
        if (!parent) continue;
        const bucket = out.get(parent);
        if (bucket) bucket.push(row as ProgrammeChild);
        else out.set(parent, [row as ProgrammeChild]);
      }
      return out;
    },
  });
}
