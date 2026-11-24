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
      if (data) return data as unknown as DatingMatchingSettings;
      // Preserve an existing adult intimate opt-in when first saving the new
      // preferences. New identity/checklist/culture permissions stay off.
      const { data: legacy, error: legacyError } = await untypedFrom('intimate_profiles')
        .select('opted_in_at,consent_18plus_at')
        .eq('id', user.id)
        .maybeSingle();
      if (legacyError) throw legacyError;
      return {
        ...DEFAULT_MATCHING_SETTINGS,
        dating_enabled: !!legacy?.opted_in_at,
        adult_consent_at: (legacy?.consent_18plus_at as string | null) ?? null,
        use_intimate: !!legacy?.opted_in_at,
      };
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
