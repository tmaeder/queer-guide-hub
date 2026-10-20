import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const KEY = ['bluesky-identity'];

/** The viewer's linked Bluesky account (public DID + handle only; no tokens). */
export function useBlueskyIdentity() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bluesky_identities')
        .select('did, handle, linked_at')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async ({ did, handle }: { did: string; handle: string }) => {
      if (!user) throw new Error('Sign in to Queer Guide first');
      const { error } = await supabase
        .from('bluesky_identities')
        .upsert({ user_id: user.id, did, handle, linked_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from('bluesky_identities').delete().eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { identity: query.data ?? null, isLoading: query.isLoading, save, remove };
}
