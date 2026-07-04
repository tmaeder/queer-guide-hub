import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { KinkCompareStatus, KinkGrant } from '@/lib/kinks/types';

/** Grants I've given or received (active only unless includeRevoked). */
export function useMyKinkGrants(includeRevoked = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-grants', 'me', user?.id, includeRevoked],
    enabled: !!user,
    queryFn: async (): Promise<KinkGrant[]> => {
      if (!user) return [];
      let q = untypedFrom('kink_grants')
        .select('id, grantor_id, grantee_id, kind, conversation_id, created_at, revoked_at')
        .or(`grantor_id.eq.${user.id},grantee_id.eq.${user.id}`);
      if (!includeRevoked) q = q.is('revoked_at', null);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as KinkGrant[]);
    },
  });
}

/** Grant / revoke a 'view' unlock or a 'compare' handshake half. */
export function useSetKinkGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      otherId: string;
      kind: 'view' | 'compare';
      active: boolean;
      conversationId?: string | null;
    }) => {
      const { error } = await untypedRpc('kink_grant_set', {
        p_other: args.otherId,
        p_kind: args.kind,
        p_active: args.active,
        p_conversation_id: args.conversationId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kink-grants'] });
      qc.invalidateQueries({ queryKey: ['kink-compare'] });
      qc.invalidateQueries({ queryKey: ['kink-visible'] });
    },
  });
}

export function useKinkCompareStatus(otherId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['kink-compare', 'status', user?.id, otherId],
    enabled: !!user && !!otherId && otherId !== user?.id,
    queryFn: async (): Promise<KinkCompareStatus> => {
      const { data, error } = await untypedRpc<KinkCompareStatus>('kink_compare_status', {
        p_other: otherId,
      });
      if (error) throw error;
      return data ?? 'none';
    },
  });
}

/**
 * Realtime receipts: refresh grant-derived state when someone grants/revokes
 * toward me (unlock receipts, compare handshake progress).
 */
export function useKinkGrantListener(onChange?: (grant: KinkGrant) => void) {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`kink-grants-in:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kink_grants',
          filter: `grantee_id=eq.${user.id}`,
        },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['kink-grants'] });
          qc.invalidateQueries({ queryKey: ['kink-compare'] });
          qc.invalidateQueries({ queryKey: ['kink-visible'] });
          if (payload.new) onChange?.(payload.new as KinkGrant);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, onChange]);
}
