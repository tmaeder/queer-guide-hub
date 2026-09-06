import { useQuery } from '@tanstack/react-query';

import { untypedRpc } from '@/integrations/supabase/untyped';
import type {
  CompetitionGrid,
  CompetitionHistoryEntry,
  CompetitionOverview,
  RosterEntry,
} from '@/types/competition';

/**
 * Data access for the competition spine (Drag Race franchises + the titleholder
 * pageant circuit).
 *
 * RPC-first, following `useMilestones.ts`: the RPCs already filter the
 * personality link to public rows, so nothing here has to remember to.
 *
 * The corpus is static reference data — a season that aired in 2012 does not
 * change — so everything is cached for an hour and fetched WHOLE, then filtered
 * client-side. That is the same strategy `/tags/interactions` and
 * `cities_directory()` use; 1,019 roster rows is well inside the proven ceiling.
 */

const HOUR = 60 * 60_000;

export function useCompetitionOverview() {
  return useQuery({
    queryKey: ['competition-overview'],
    staleTime: HOUR,
    queryFn: async (): Promise<CompetitionOverview> => {
      const { data, error } = await untypedRpc<CompetitionOverview>('competition_overview');
      if (error) throw error;
      return data ?? { competitions: [] };
    },
  });
}

export function useCompetitionRoster() {
  return useQuery({
    queryKey: ['competition-roster'],
    staleTime: HOUR,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data, error } = await untypedRpc<RosterEntry[]>('competition_roster');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * One edition's placement grid. Returns null (not an empty envelope) when the
 * slug does not resolve, so the caller can tell "no such season" from "a season
 * with no grid".
 */
export function useCompetitionGrid(editionSlug: string | undefined) {
  return useQuery({
    queryKey: ['competition-grid', editionSlug],
    enabled: !!editionSlug,
    staleTime: HOUR,
    queryFn: async (): Promise<CompetitionGrid | null> => {
      const { data, error } = await untypedRpc<CompetitionGrid | null>('competition_grid', {
        p_edition_slug: editionSlug,
      });
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Backs the Drag Race / pageant panel on a personality page. */
export function useCompetitionHistory(personalityId: string | undefined) {
  return useQuery({
    queryKey: ['competition-history', personalityId],
    enabled: !!personalityId,
    staleTime: HOUR,
    queryFn: async (): Promise<CompetitionHistoryEntry[]> => {
      const { data, error } = await untypedRpc<CompetitionHistoryEntry[]>(
        'competition_history_for_personality',
        { p_personality_id: personalityId },
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}
