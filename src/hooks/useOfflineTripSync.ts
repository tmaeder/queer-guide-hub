import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import {
  QUEUE_EVENT,
  countMutations,
  listMutations,
  removeMutation,
} from '@/lib/offline/mutationQueue';
import { qk } from '@/lib/queryKeys';

/**
 * Replays queued offline trip edits when connectivity returns and exposes
 * the pending count for the "N unsynced changes" badge. Mount once per trip
 * surface (TripContextBar).
 */
export function useOfflineTripSync() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const { t } = useTranslation();
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const replaying = useRef(false);
  const [pending, setPending] = useState({ userId, count: 0 });

  const refreshCount = useCallback(() => {
    if (!userId) return;
    countMutations(userId)
      .then((count) => {
        if (activeUser.current === userId) setPending({ userId, count });
      })
      .catch(() => {});
  }, [userId]);

  const replay = useCallback(async () => {
    if (!userId || !navigator.onLine || replaying.current) return;
    replaying.current = true;
    try {
      const rows = await listMutations(userId);
      let rejected = 0;
      for (const row of rows) {
        if (activeUser.current !== userId || !navigator.onLine) break;
        const { data, error, status } = await supabase
          .from(row.table)
          .update({ ...row.patch, updated_at: new Date().toISOString() })
          .eq('id', row.rowId)
          .select('id')
          .maybeSingle();
        if (error && (status < 400 || status >= 500 || [401, 408, 409, 425, 429].includes(status)))
          break;
        await removeMutation(row);
        if (error || !data) rejected++;
        if (row.tripId) {
          void qc.invalidateQueries({ queryKey: qk.trip.detail(row.tripId) });
          void qc.invalidateQueries({ queryKey: qk.trip.facet(row.tripId, 'packing') });
        }
      }
      if (rejected && activeUser.current === userId) {
        toast({
          title: t('trips.offline.syncRejected', 'Some offline changes could not be saved'),
          variant: 'destructive',
        });
      }
    } catch {
      // Retain queued edits if storage or transport is temporarily unavailable.
    } finally {
      replaying.current = false;
      refreshCount();
    }
  }, [userId, qc, toast, refreshCount, t]);

  useEffect(() => {
    refreshCount();
    void replay();
    const onOnline = () => void replay();
    window.addEventListener('online', onOnline);
    window.addEventListener(QUEUE_EVENT, refreshCount);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(QUEUE_EVENT, refreshCount);
    };
  }, [replay, refreshCount]);

  return { pending: pending.userId === userId ? pending.count : 0 };
}
