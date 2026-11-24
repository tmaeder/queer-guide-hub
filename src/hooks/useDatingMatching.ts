import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import {
  DEFAULT_MATCHING_SETTINGS,
  MATCHING_QUERY_KEYS,
  matchingSettingsError,
  type DatingMatchingSettings,
} from '@/lib/intimate/matching';

export function useDatingMatchingSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dating-matching-settings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DatingMatchingSettings> => {
      if (!user) throw new Error('Sign in required');
      const { data, error } = await untypedFrom('dating_matching_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data ? (data as unknown as DatingMatchingSettings) : { ...DEFAULT_MATCHING_SETTINGS };
    },
  });
}

export function useSaveDatingMatchingSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DatingMatchingSettings) => {
      if (!user) throw new Error('Sign in required');
      const validationError = matchingSettingsError(settings);
      if (validationError) throw new Error(validationError);
      const { error } = await untypedFrom('dating_matching_settings').upsert(
        { ...settings, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all(
        MATCHING_QUERY_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
}

export interface DatingProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  age_band: string | null;
  intimate_visible: boolean;
}

export function useDatingProfile(userId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dating-profile', user?.id, userId],
    enabled: !!user && !!userId,
    queryFn: async () => {
      const { data, error } = await untypedRpc<DatingProfile[]>('dating_profile', {
        p_candidate: userId,
      });
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },
  });
}
