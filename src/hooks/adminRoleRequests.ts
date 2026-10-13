import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type UserRole = Database['public']['Tables']['user_roles']['Row'];
type RoleResponse = { data: UserRole[] | null; error: unknown };
const inFlight = new Map<string, Promise<RoleResponse>>();

/** Coalesce simultaneous guard/sidebar/shell reads, without caching role grants. */
export function loadAdminRoles(userId: string): Promise<RoleResponse> {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const request = Promise.resolve(
    supabase.from('user_roles').select('*').eq('user_id', userId),
  ).finally(() => inFlight.delete(userId));
  inFlight.set(userId, request);
  return request;
}
