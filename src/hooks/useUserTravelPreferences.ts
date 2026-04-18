import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type TransportMode = 'flight' | 'rail' | 'bus' | 'car';
export type BudgetTier = 'budget' | 'mid' | 'luxury';

export interface UserTravelPreferences {
  user_id: string;
  budget_tier: BudgetTier | null;
  preferred_transport: TransportMode[];
  home_city_id: string | null;
  home_country_id: string | null;
  travel_style: Record<string, unknown>;
  updated_at: string;
}

export function useUserTravelPreferences() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-travel-preferences', user?.id],
    queryFn: async (): Promise<UserTravelPreferences | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_travel_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as UserTravelPreferences | null) ?? null;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateUserTravelPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<Omit<UserTravelPreferences, 'user_id' | 'updated_at'>>) => {
      if (!user) throw new Error('not authenticated');
      const { data, error } = await supabase
        .from('user_travel_preferences')
        .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data as UserTravelPreferences;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-travel-preferences', user?.id] });
    },
  });
}
