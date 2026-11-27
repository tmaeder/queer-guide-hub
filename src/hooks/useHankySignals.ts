import { MATCHING_QUERY_KEYS } from '@/lib/intimate/matching';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type HankySide = 'left' | 'right' | 'both';

export interface HankyVariant {
  /** cultural_variants.id — what user_hanky_signals stores. */
  variantId: string;
  /** HANKY_CODE id, i.e. the node slug without its `hanky-` prefix. */
  colorId: string;
}

/** The 16 published hanky colours, keyed back to the HANKY_CODE reference rows. */
export function useHankyVariants() {
  return useQuery({
    queryKey: ['hanky-variants'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<HankyVariant[]> => {
      const { data, error } = await untypedFrom('cultural_variants')
        .select('id, cultural_nodes!inner(slug, artifact_kind)')
        .eq('cultural_nodes.artifact_kind', 'hanky_code');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        variantId: r.id as string,
        colorId: String((r.cultural_nodes as unknown as { slug: string }).slug).replace(
          /^hanky-/,
          '',
        ),
      }));
    },
  });
}

/** The signed-in user's active hanky signals: variant id → side. */
export function useMyHankySignals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['hanky-signals', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, HankySide>> => {
      const { data, error } = await untypedFrom('user_hanky_signals')
        .select('variant_id, side')
        .eq('user_id', user!.id)
        .is('revoked_at', null);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((r) => [r.variant_id as string, r.side as HankySide]),
      );
    },
  });
}

/** Another member's visible signals. RLS returns them only when both of you
 *  are opted-in intimate members. */
export function useMemberHankySignals(userId: string | undefined) {
  return useQuery({
    queryKey: ['hanky-signals', 'member', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, HankySide>> => {
      const { data, error } = await untypedFrom('user_hanky_signals')
        .select('variant_id, side')
        .eq('user_id', userId!)
        .is('revoked_at', null);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((r) => [r.variant_id as string, r.side as HankySide]),
      );
    },
  });
}

/** Wear a colour on a side (side=null takes it off). Every change is a fresh
 *  consent row in user_hanky_consent_events, written by the table's trigger. */
export function useSetHankySignal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ variantId, side }: { variantId: string; side: HankySide | null }) => {
      if (!user) throw new Error('not signed in');
      const now = new Date().toISOString();
      const { error } = side
        ? await untypedFrom('user_hanky_signals').upsert(
            {
              user_id: user.id,
              variant_id: variantId,
              side,
              // Opted-in members can read 'members_adult' signals (RLS
              // user_hanky_signals_members_read); discovery matches on them.
              visibility: 'members_adult',
              consented_at: now,
              revoked_at: null,
            },
            { onConflict: 'user_id,variant_id' },
          )
        : await untypedFrom('user_hanky_signals')
            .update({ revoked_at: now })
            .eq('user_id', user.id)
            .eq('variant_id', variantId)
            .is('revoked_at', null);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['hanky-signals'] }),
        ...MATCHING_QUERY_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })),
      ]),
  });
}

/** Pockets → the role vocabulary: left = top, right = bottom, both = vers. */
export function roleFromHanky(signals: Record<string, HankySide>): string[] {
  const sides = new Set(Object.values(signals));
  const roles: string[] = [];
  if (sides.has('both') || (sides.has('left') && sides.has('right'))) roles.push('vers');
  else if (sides.has('left')) roles.push('top');
  else if (sides.has('right')) roles.push('bottom');
  return roles;
}
