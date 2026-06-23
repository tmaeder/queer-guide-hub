/**
 * Data hooks for cockpit widgets whose source is a direct table/view read
 * (must live in src/hooks per the no-supabase-from-in-pages rule).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AutomationRow {
  slug: string;
  name: string;
  enabled: boolean;
  last_run_status: string | null;
  last_run_at: string | null;
}

export function useAutomationList() {
  return useQuery({
    queryKey: ['admin-automations'],
    queryFn: async (): Promise<AutomationRow[]> => {
      const { data, error } = await supabase
        .from('admin_automations' as never)
        .select('slug, name, enabled, last_run_status, last_run_at')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AutomationRow[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export interface PipelineErrorRow {
  function_name?: string;
  severity?: string;
  errors_24h?: number;
  errors_1h?: number;
  errors_7d?: number;
}

export function usePipelineErrors() {
  return useQuery({
    queryKey: ['cockpit', 'pipeline-errors'],
    queryFn: async (): Promise<PipelineErrorRow[]> => {
      const { data, error } = await supabase
        .from('pipeline_error_summary' as never)
        .select('*')
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PipelineErrorRow[];
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
