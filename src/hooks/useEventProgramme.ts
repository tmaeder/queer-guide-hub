import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ProgrammeChild } from '@/utils/prideProgramme';

export interface ProgrammeUmbrella {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  country: string | null;
  event_type: string | null;
  pride_subtypes: string[] | null;
}

export interface EventProgramme {
  umbrella: ProgrammeUmbrella | null;
  children: ProgrammeChild[];
}

const EMPTY: EventProgramme = { umbrella: null, children: [] };

/**
 * The programme of a Pride edition — the umbrella plus its parade / festival /
 * week children.
 *
 * Accepts EITHER the umbrella's id or any child's id; the RPC resolves to the
 * root either way, so a child page can render "the rest of the programme"
 * without a second round trip.
 *
 * `event_programme` is SECURITY INVOKER, so a safety-gated child in a
 * criminalizing country stays invisible to anon exactly as it does everywhere
 * else — the gating is not re-implemented here.
 */
export function useEventProgramme(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-programme', eventId],
    enabled: enabled && !!eventId,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<EventProgramme> => {
      if (!eventId) return EMPTY;
      const { data, error } = await supabase.rpc('event_programme', { p_event_id: eventId });
      if (error) throw error;
      const parsed = data as unknown as EventProgramme | null;
      if (!parsed || typeof parsed !== 'object') return EMPTY;
      return {
        umbrella: parsed.umbrella ?? null,
        children: Array.isArray(parsed.children) ? parsed.children : [],
      };
    },
  });
}
