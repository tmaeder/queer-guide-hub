import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type ListArgs = Database['public']['Functions']['admin_users_list']['Args'];

/** Admin reads must use the guarded RPCs: authenticated profile grants are public-only. */
export async function fetchAdminUsers<T>(args: ListArgs = {}) {
  const { data, error } = await supabase.rpc('admin_users_list', args);
  if (error) throw error;
  const result = data as { items?: T[]; total?: number } | null;
  if (!result || !Array.isArray(result.items) || typeof result.total !== 'number') {
    throw new Error('Invalid user list response');
  }
  return { data: result.items, totalCount: result.total };
}

/** Page exports too, so neither the API row limit nor the RPC limit truncates a file. */
export async function fetchAdminUsersForExport(ids?: string[]) {
  if (ids?.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let page = 1; ; page++) {
    const result = await fetchAdminUsers<Record<string, unknown>>({
      p_ids: ids,
      p_sort: 'display_name',
      p_sort_asc: true,
      p_page: page,
      p_per_page: pageSize,
    });
    rows.push(...result.data);
    if (rows.length === result.totalCount) return rows;
    if (rows.length > result.totalCount || result.data.length === 0) {
      throw new Error(
        `Incomplete user export: fetched ${rows.length} of ${result.totalCount} records. Please retry.`,
      );
    }
  }
}

export async function fetchAdminUserDetail(userId: string) {
  const [details, handle] = await Promise.all([
    supabase.rpc('admin_user_detail', { p_user_id: userId }),
    // Username is public-readable and is the server's preferred confirmation
    // handle. The existing detail RPC deliberately returns only five fields.
    supabase.from('profiles').select('username').eq('user_id', userId).maybeSingle(),
  ]);
  if (details.error) throw details.error;
  if (handle.error) throw handle.error;
  return { ...details.data?.[0], username: handle.data?.username };
}
