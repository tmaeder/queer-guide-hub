/**
 * useAdminCounts — shared TanStack Query wrapper over the `get_admin_counts` RPC.
 * One source of truth for sidebar badges, the command palette, and cockpit widgets,
 * so the count probe runs once and is cached + refreshed in one place.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * The RPC payload is *almost* a flat count map — `sla_hours` is a nested object
 * of per-queue SLA hours. Typing it as a bare Record<string, number> is a lie
 * that only holds while nothing enumerates the payload; anything doing
 * `Object.entries(counts)` would treat `sla_hours` as a queue with an object
 * count. Consumers should look keys up by name (see config/adminQueues).
 */
export type AdminCounts = Record<string, number> & {
  sla_hours?: Record<string, number>;
};

export async function fetchAdminCounts(): Promise<AdminCounts> {
  const { data, error } = await supabase.rpc('get_admin_counts');
  if (error) throw new Error(`Could not load admin counts: ${error.message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Admin counts returned no usable data');
  }
  return data as AdminCounts;
}

export function useAdminCounts() {
  const query = useQuery({
    queryKey: ['admin-counts'],
    queryFn: fetchAdminCounts,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  // Observe the inventory cache without fetching thousands of aliases on every
  // admin page. The manual-table count is not the redirect inventory's count.
  const inventory = useQuery<{ rows: unknown[]; errors: string[] }>({
    queryKey: ['cms-content-list', 'redirect-inventory'],
    enabled: false,
  });
  const data = useMemo(() => {
    if (!query.data) return query.data;
    const counts = { ...query.data };
    delete counts.redirects;
    if (inventory.data && !inventory.data.errors.length)
      counts.redirects = inventory.data.rows.length;
    return counts;
  }, [query.data, inventory.data]);
  return { ...query, data };
}

/** Read a count + its `_overdue` companion by key (table name or review key). */
export function readCount(counts: AdminCounts | undefined, key: string | undefined) {
  if (!counts || !key) return { count: undefined as number | undefined, overdue: 0 };
  return {
    count: counts[key],
    overdue: counts[`${key}_overdue`] ?? 0,
  };
}
