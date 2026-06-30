/**
 * useAutomationActions — reusable run / dry-run / toggle / pause-all mutations
 * for admin_automations. Extracted from AdminAutomation so cockpit widgets can
 * trigger the same RPCs inline (toast + query invalidation included).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin-automations'] });
  qc.invalidateQueries({ queryKey: ['admin-automation-runs'] });
  qc.invalidateQueries({ queryKey: ['cockpit', 'automation-summary'] });
}

export function useAutomationActions() {
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc('admin_automation_run', { p_slug: slug });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, slug) => toast.success(`Ran ${slug}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Run failed'),
    onSettled: () => invalidate(qc),
  });

  const dryRun = useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc('admin_automation_dry_run', { p_slug: slug });
      if (error) throw error;
      return data as { would_change: number };
    },
    onSuccess: (data, slug) =>
      toast(`Dry-run: would change ${data?.would_change ?? 0} item(s)`, { description: slug }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Dry-run failed'),
    onSettled: () => invalidate(qc),
  });

  const setEnabled = useMutation({
    mutationFn: async ({ slug, enabled }: { slug: string; enabled: boolean }) => {
      const { error } = await supabase.rpc('admin_automation_set_enabled', {
        p_slug: slug,
        p_enabled: enabled,
      });
      if (error) throw error;
      return { slug, enabled };
    },
    onSuccess: ({ slug, enabled }) => toast.success(enabled ? `Enabled ${slug}` : `Paused ${slug}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Toggle failed'),
    onSettled: () => invalidate(qc),
  });

  const pauseAll = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('admin_automation_pause_all', { p_enabled: enabled });
      if (error) throw error;
      return { changed: (data as { changed: number })?.changed ?? 0, enabled };
    },
    onSuccess: ({ changed, enabled }) =>
      toast.success(`${enabled ? 'Resumed' : 'Paused'} ${changed} automation(s)`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
    onSettled: () => invalidate(qc),
  });

  return { run, dryRun, setEnabled, pauseAll };
}
