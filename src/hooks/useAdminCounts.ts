/**
 * useAdminCounts — shared TanStack Query wrapper over the `get_admin_counts` RPC.
 * One source of truth for sidebar badges, the command palette, and cockpit widgets,
 * so the count probe runs once and is cached + refreshed in one place.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AdminCounts = Record<string, number>;

async function fetchAdminCounts(): Promise<AdminCounts> {
  const { data, error } = await supabase.rpc('get_admin_counts');
  if (error || !data) return {};
  return data as AdminCounts;
}

export function useAdminCounts() {
  return useQuery({
    queryKey: ['admin-counts'],
    queryFn: fetchAdminCounts,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Read a count + its `_overdue` companion by key (table name or review key). */
export function readCount(counts: AdminCounts | undefined, key: string | undefined) {
  if (!counts || !key) return { count: undefined as number | undefined, overdue: 0 };
  return {
    count: counts[key],
    overdue: counts[`${key}_overdue`] ?? 0,
  };
}
