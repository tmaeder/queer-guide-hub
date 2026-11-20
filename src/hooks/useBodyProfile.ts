import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export interface BodyProfile {
  user_id: string;
  body_pictogram_key: string | null;
  body_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  size_top: string | null;
  size_bottom: string | null;
  size_shoe: string | null;
  size_underwear: string | null;
  visibility: 'private' | 'members';
}

export type BodyProfilePatch = Partial<Omit<BodyProfile, 'user_id'>>;

const key = (userId: string | undefined) => ['body-profile', userId] as const;

/** Own row, or another member's row when they set visibility to members (RLS decides). */
export function useBodyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: key(userId),
    enabled: !!userId,
    queryFn: async (): Promise<BodyProfile | null> => {
      const { data, error } = await untypedFrom('user_body_profile')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as BodyProfile | null) ?? null;
    },
  });
}

export function useSaveBodyProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: BodyProfilePatch) => {
      if (!user) throw new Error('not signed in');
      const { error } = await untypedFrom('user_body_profile').upsert(
        { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(user?.id) }),
  });
}
