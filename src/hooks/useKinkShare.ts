import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { KinkShareLink, KinkVisibleRow } from '@/lib/kinks/types';

export interface KinkShareViewRow extends KinkVisibleRow {
  owner_display_name: string | null;
  owner_avatar_url: string | null;
}

export function useMyKinkShareLinks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-share', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<KinkShareLink[]> => {
      if (!user) return [];
      const { data, error } = await untypedFrom('kink_share_links')
        .select('id, code, expires_at, revoked_at, view_count, created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as KinkShareLink[]);
    },
  });
}

export function useCreateKinkShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ttl?: string | null } = {}): Promise<string> => {
      const { data, error } = await untypedRpc<string>('kink_share_create', {
        p_ttl: args.ttl ?? null,
      });
      if (error) throw error;
      if (!data) throw new Error('no code returned');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kink-share', 'me'] });
    },
  });
}

export function useRevokeKinkShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedRpc('kink_share_revoke', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kink-share', 'me'] });
    },
  });
}

/** Resolve a share code (viewer must be signed in + intimate-eligible). */
export function useKinkShareView(code: string | undefined) {
  return useQuery({
    queryKey: ['kink-share', 'view', code],
    enabled: !!code,
    retry: false,
    queryFn: async (): Promise<KinkShareViewRow[]> => {
      const { data, error } = await untypedRpc<KinkShareViewRow[]>('kink_share_view', {
        p_code: code,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
