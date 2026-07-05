import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  QUEUE_EVENT,
  countMutations,
  listMutations,
  removeMutation,
} from '@/lib/offline/mutationQueue';

/**
 * Replays queued offline trip edits when connectivity returns and exposes
 * the pending count for the "N unsynced changes" badge. Mount once per trip
 * surface (TripContextBar).
 */
export function useOfflineTripSync() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(0);

  const refreshCount = useCallback(() => {
    countMutations()
      .then(setPending)
      .catch(() => setPending(0));
  }, []);

  const replay = useCallback(async () => {
    if (!navigator.onLine) return;
    let rows;
    try {
      rows = await listMutations();
    } catch {
      return;
    }
    if (rows.length === 0) return;

    const touchedTrips = new Set<string>();
    let dropped = 0;
    for (const m of rows) {
      const { error } = await supabase
        .from(m.table)
        .update({ ...m.patch, updated_at: new Date().toISOString() })
        .eq('id', m.rowId);
      if (!error) {
        await removeMutation(m.key).catch(() => {});
        if (m.tripId) touchedTrips.add(m.tripId);
      } else if (error.code && !error.message.includes('fetch')) {
        // Permanent server rejection (RLS, deleted row) — drop, don't retry forever.
        await removeMutation(m.key).catch(() => {});
        dropped++;
      }
      // Network-level failure: keep queued for the next 'online' event.
    }

    for (const tripId of touchedTrips) {
      void qc.invalidateQueries({ queryKey: ['trip', tripId] });
      void qc.invalidateQueries({ queryKey: ['trip-packing', tripId] });
    }
    if (dropped > 0) {
      toast({
        title: `${dropped} offline change${dropped === 1 ? '' : 's'} could not be synced`,
        description: 'The server rejected them (edited or removed elsewhere).',
        variant: 'destructive',
      });
    }
    refreshCount();
  }, [qc, toast, refreshCount]);

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

  return { pending };
}
