import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AvailabilityRow {
  user_id: string;
  available_until: string;
}

/**
 * "Free to meet" availability for a conversation. Self-set, auto-expiring.
 * Reads both participants' rows (RLS-scoped) and exposes a toggle.
 */
export function useConversationAvailability(
  conversationId: string,
  otherUserId: string | undefined,
) {
  const { user } = useAuth();
  const [rows, setRows] = useState<AvailabilityRow[]>([]);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('conversation_availability')
      .select('user_id, available_until')
      .eq('conversation_id', conversationId);
    setRows(
      ((data as AvailabilityRow[]) ?? []).filter(
        (r) => new Date(r.available_until).getTime() > Date.now(),
      ),
    );
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selfAvailable = rows.some((r) => r.user_id === user?.id);
  const otherAvailable = !!otherUserId && rows.some((r) => r.user_id === otherUserId);

  const toggle = useCallback(async () => {
    await supabase.rpc('set_conversation_availability', {
      p_conversation_id: conversationId,
      p_minutes: selfAvailable ? 0 : 60,
    } as never);
    void refresh();
  }, [conversationId, selfAvailable, refresh]);

  return { selfAvailable, otherAvailable, toggle };
}
