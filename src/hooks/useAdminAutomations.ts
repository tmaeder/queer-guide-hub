/**
 * Hook helpers for the AdminAutomation page — keep supabase.from() out of
 * src/pages/. Returned by query functions consumed via useQuery in
 * src/pages/AdminAutomation.tsx.
 */
import { supabase } from '@/integrations/supabase/client';

export interface Automation {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  managed_by: 'user' | 'system';
  enabled: boolean;
  schedule: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface AutomationRun {
  id: number;
  automation_slug: string;
  started_at: string;
  finished_at: string | null;
  status: 'success' | 'partial' | 'error' | 'dry_run';
  items_examined: number;
  items_changed: number;
  summary: Record<string, unknown> | null;
  error: string | null;
}

export async function fetchAutomations(): Promise<Automation[]> {
  const { data, error } = await supabase
    .from('admin_automations' as never)
    .select('*')
    .order('managed_by', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Automation[];
}

export async function fetchRecentAutomationRuns(
  slugFilter: string | null,
): Promise<AutomationRun[]> {
  let q = supabase
    .from('admin_automation_runs' as never)
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);
  if (slugFilter) q = q.eq('automation_slug', slugFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AutomationRun[];
}
