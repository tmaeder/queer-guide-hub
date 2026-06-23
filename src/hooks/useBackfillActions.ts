/**
 * useBackfillActions — run a backfill/refresh automation slug from a worklist
 * widget and refresh the related "due for refresh" queries on completion.
 * Thin wrapper over admin_automation_run with worklist-scoped invalidation.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function useBackfillActions() {
  const qc = useQueryClient();

  const runBackfill = useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc('admin_automation_run', { p_slug: slug });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, slug) => toast.success(`Backfill queued: ${slug}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Backfill failed'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['cockpit', 'refresh-due'] });
      qc.invalidateQueries({ queryKey: ['admin-automation-runs'] });
    },
  });

  return { runBackfill };
}
