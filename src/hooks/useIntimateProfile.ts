import { MATCHING_QUERY_KEYS } from '@/lib/intimate/matching';
import { useDatingProfile } from '@/hooks/useDatingMatching';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { IntimateProfile, IntimateDiscoveryCard } from '@/lib/intimate/types';
import type { TablesInsert } from '@/integrations/supabase/types';

const SELECT =
  'id, opted_in_at, consent_18plus_at, genitalia, genital_pictogram_key, size_cm, erection_angle_deg, body_pictogram_key, body_type, height_cm, age_band, role, into_tags, safer_sex_prefs, discovery_city_id, discovery_active_until, moderation_status, last_active_at, dating_prefs';

export function useMyIntimateProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-profile', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<IntimateProfile | null> => {
      if (!user) return null;
      // Own row only: whether the presence safety notice was accepted is not
      // something other members need to read.
      const { data, error } = await untypedFrom('intimate_profiles')
        .select(`${SELECT}, presence_safety_acknowledged_at`)
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as IntimateProfile | null;
    },
  });
}

/**
 * True when the dating layer of `userId`'s profile may be shown to the viewer:
 * the viewer is opted in and RLS (`intimate_profiles_mutual_read`: opted-in,
 * approved, unblocked) returns the target's row. A failed read hides the tab.
 */
export function useDatingLayerVisible(userId: string | undefined) {
  const { data } = useDatingProfile(userId);
  return !!data;
}

/**
 * Which of `userIds` the viewer may see as dating profiles. Empty unless the
 * viewer is opted in; RLS (intimate_profiles_mutual_read) returns only rows of
 * opted-in, approved, unblocked members, so this never reveals anyone else.
 */
export function useDatingMarks(userIds: string[]) {
  const { data: me } = useMyIntimateProfile();
  const ids = [...new Set(userIds)].sort();
  return useQuery({
    queryKey: ['intimate-dating-marks', ids],
    enabled: !!me?.opted_in_at && ids.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('intimate_profiles')
        .select('id')
        .in('id', ids)
        .not('opted_in_at', 'is', null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id));
    },
  });
}

export function useIntimateProfile(userId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-profile', user?.id, userId],
    enabled: !!user && !!userId,
    queryFn: async (): Promise<IntimateProfile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('intimate_profiles')
        .select(SELECT)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as IntimateProfile | null;
    },
  });
}

export interface DiscoveryFilters {
  cityId?: string | null;
  roles?: string[];
  intoTags?: string[];
  ageBands?: string[];
  bodyTypes?: string[];
  kinkItemSlugs?: string[];
  /** Not in the discovery view; filtered here against intimate_profiles, which
   *  opted-in members can already read (the detail page shows it). */
  genitalia?: string[];
  /** Wanted hanky colours (variant id → pocket). Matched against members'
   *  'members_adult' signals; a 'both' on either side matches any pocket. */
  hanky?: Record<string, 'left' | 'right' | 'both'>;
}

/** One server result owns reciprocal requirements, filters, order and limits. */
export function useIntimateDiscovery(filters: DiscoveryFilters) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-discovery', user?.id, filters],
    enabled: !!user,
    queryFn: async (): Promise<IntimateDiscoveryCard[]> => {
      const { data, error } = await untypedRpc<IntimateDiscoveryCard[]>('dating_discovery', {
        p_filters: filters,
        p_limit: 200,
      });
      if (error) throw new Error(error.message);
      // Signals are presentation only. Eligibility and any hanky filters are
      // already applied by the server before the result limit.
      if (!data?.length) return [];
      const { data: signals } = await untypedFrom('user_hanky_signals')
        .select('user_id,variant_id,side')
        .in(
          'user_id',
          data.map((card) => card.user_id),
        )
        .is('revoked_at', null);
      return data.map((card) => ({
        ...card,
        hanky: Object.fromEntries(
          (signals ?? [])
            .filter((s) => s.user_id === card.user_id)
            .map((s) => [s.variant_id, s.side]),
        ) as Record<string, 'left' | 'right' | 'both'>,
      }));
    },
  });
}

export function useUpsertIntimateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<IntimateProfile>) => {
      if (!user) throw new Error('not signed in');
      const { data, error } = await supabase
        .from('intimate_profiles')
        // dating_prefs is jsonb (`Json` in the generated types); our shape is a
        // narrower object, so widen it for the client.
        .upsert({ id: user.id, ...patch } as TablesInsert<'intimate_profiles'>, {
          onConflict: 'id',
        })
        .select(SELECT)
        .single();
      if (error) throw error;
      return data as IntimateProfile;
    },
    onSuccess: () => {
      MATCHING_QUERY_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      qc.invalidateQueries({ queryKey: ['intimate-profile', 'me'] });
    },
  });
}

export function useOptOutIntimateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (opts: { hardDelete?: boolean } = {}) => {
      if (!user) throw new Error('not signed in');
      if (opts.hardDelete) {
        const { error } = await supabase.from('intimate_profiles').delete().eq('id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('intimate_profiles')
          .update({ opted_in_at: null })
          .eq('id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      MATCHING_QUERY_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      qc.invalidateQueries({ queryKey: ['intimate-profile'] });
    },
  });
}

export function useIntimateKinkTags() {
  return useQuery({
    queryKey: ['intimate-kink-tags'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('slug, name')
        .eq('category', 'intimate_kink')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { slug: string; name: string }[];
    },
  });
}

export function useMyIntimateText() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-text', 'me', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('intimate_get_my_text');
      if (error) throw error;
      const row = (data ?? [])[0] as
        { about_intimate: string | null; looking_for: string | null } | undefined;
      return row ?? { about_intimate: null, looking_for: null };
    },
  });
}

export function useSetIntimateText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { aboutIntimate: string | null; lookingFor: string | null }) => {
      const { error } = await supabase.rpc('intimate_set_text', {
        p_about: args.aboutIntimate,
        p_looking: args.lookingFor,
      });
      if (error) throw error;

      // Fire-and-forget moderation scan. Failures shouldn't block the user.
      const combined = [args.aboutIntimate, args.lookingFor].filter(Boolean).join('\n');
      if (combined.trim()) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          supabase.functions
            .invoke('intimate-moderation', {
              body: {
                user_id: u.user.id,
                about_intimate: args.aboutIntimate ?? '',
                looking_for: args.lookingFor ?? '',
              },
            })
            .catch(() => undefined);
        }
      }
    },
    onSuccess: () => {
      MATCHING_QUERY_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      qc.invalidateQueries({ queryKey: ['intimate-text'] });
    },
  });
}

export function useReportIntimateProfile() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { targetId: string; reason: string; details?: string }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('intimate_reports').insert({
        reporter_id: user.id,
        target_id: args.targetId,
        reason: args.reason,
        details: args.details ?? null,
      });
      if (error) throw error;
    },
  });
}
