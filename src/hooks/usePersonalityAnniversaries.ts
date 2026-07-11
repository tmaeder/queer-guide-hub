import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface PersonalityAnniversary {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  profession: string | null;
  anniversary: 'born' | 'died';
  occurs_on: string; // YYYY-MM-DD
  years_ago: number;
  featured: boolean;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;

/**
 * Queer-history layer: birth/death anniversaries of public personalities in
 * [from, to] via the personalities_anniversaries RPC (range-capped at 62 days
 * server-side). Public data — no auth requirement.
 */
export function usePersonalityAnniversaries(from: Date, to: Date, enabled: boolean) {
  const query = useQuery({
    queryKey: ['calendar-history', dayKey(from), dayKey(to)],
    enabled,
    staleTime: 60 * 60_000, // anniversaries don't move
    queryFn: async () => {
      const { data, error } = await untypedRpc<PersonalityAnniversary[]>(
        'personalities_anniversaries',
        { p_from: dayKey(from), p_to: dayKey(to) },
      );
      if (error) throw error;
      return data ?? [];
    },
  });
  return { items: query.data ?? [], loading: query.isLoading };
}
