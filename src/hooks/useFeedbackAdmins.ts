import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AdminProfile } from '@/components/admin/feedback/types';

/**
 * Fetches admin + moderator profiles for the assignee picker.
 * Returns display_name + avatar_url so the chip can render instantly.
 */
export function useFeedbackAdmins() {
  return useQuery<AdminProfile[]>({
    queryKey: ['admin-feedback-assignees'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id,role')
        .in('role', ['admin', 'moderator']);
      if (rolesErr) throw rolesErr;

      const ids = Array.from(new Set((roles || []).map((r) => r.user_id).filter(Boolean)));
      if (ids.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('user_id,display_name,avatar_url')
        .in('user_id', ids);
      if (profErr) throw profErr;

      return (profiles || [])
        .map<AdminProfile>((p) => ({
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        }))
        .sort((a, b) =>
          (a.display_name || '').localeCompare(b.display_name || '', undefined, {
            sensitivity: 'base',
          }),
        );
    },
    staleTime: 5 * 60_000,
  });
}

/** Build a lookup by user_id for constant-time chip rendering. */
export function buildAdminMap(admins: AdminProfile[]): Record<string, AdminProfile> {
  const map: Record<string, AdminProfile> = {};
  for (const a of admins) map[a.user_id] = a;
  return map;
}
