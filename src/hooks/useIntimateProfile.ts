import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { IntimateProfile, IntimateDiscoveryCard } from '@/lib/intimate/types';

const SELECT = 'id, opted_in_at, consent_18plus_at, genitalia, genital_pictogram_key, size_cm, erection_angle_deg, body_pictogram_key, body_type, height_cm, age_band, role, into_tags, limits, safer_sex_prefs, discovery_city_id, discovery_active_until, moderation_status, last_active_at';

export function useMyIntimateProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-profile', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<IntimateProfile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('intimate_profiles')
        .select(SELECT)
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as IntimateProfile | null;
    },
  });
}

export function useIntimateProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['intimate-profile', userId],
    enabled: !!userId,
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
}

export function useIntimateDiscovery(filters: DiscoveryFilters) {
  return useQuery({
    queryKey: ['intimate-discovery', filters],
    queryFn: async (): Promise<IntimateDiscoveryCard[]> => {
      let q = supabase.from('intimate_discovery_v').select('*').limit(200);
      if (filters.cityId) q = q.eq('discovery_city_id', filters.cityId);
      if (filters.roles?.length) q = q.overlaps('role', filters.roles);
      if (filters.intoTags?.length) q = q.overlaps('into_tags', filters.intoTags);
      if (filters.ageBands?.length) q = q.in('age_band', filters.ageBands);
      if (filters.bodyTypes?.length) q = q.in('body_type', filters.bodyTypes);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IntimateDiscoveryCard[];
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
        .upsert({ id: user.id, ...patch }, { onConflict: 'id' })
        .select(SELECT)
        .single();
      if (error) throw error;
      return data as IntimateProfile;
    },
    onSuccess: () => {
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
        const { error } = await supabase
          .from('intimate_profiles')
          .delete()
          .eq('id', user.id);
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
      const row = (data ?? [])[0] as { about_intimate: string | null; looking_for: string | null } | undefined;
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
          supabase.functions.invoke('intimate-moderation', {
            body: {
              user_id: u.user.id,
              about_intimate: args.aboutIntimate ?? '',
              looking_for: args.lookingFor ?? '',
            },
          }).catch(() => undefined);
        }
      }
    },
    onSuccess: () => {
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
