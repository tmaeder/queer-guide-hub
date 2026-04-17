import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const TOKEN_KEY = (userId: string | undefined) => ['email-token', userId] as const;

/** Domain new forwarding addresses are minted under. */
const FORWARDING_DOMAIN = 'queer.guide';

/**
 * Lazily mints (or returns) the user's per-account forwarding address for
 * the trip-import path. Idempotent — the underlying RPC issues a token on
 * first call and returns the same one thereafter.
 */
export function useEmailForwardingAddress() {
  const { user } = useAuth();

  return useQuery({
    queryKey: TOKEN_KEY(user?.id),
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_or_create_email_token');
      if (error) throw error;
      const token = data as string;
      return {
        token,
        address: `trips+${token}@${FORWARDING_DOMAIN}`,
      };
    },
  });
}

/** Revoke the current address and mint a new one. */
export function useRotateEmailForwardingAddress() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('rotate_email_token');
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TOKEN_KEY(user?.id) });
    },
  });
}
