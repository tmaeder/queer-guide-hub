import { useQuery } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import type { Database } from '@/types/database';

type AppRole = Database['public']['Enums']['app_role'];

export function useUserRoles() {
  return useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data, error } = await api.from('user_roles').select('user_id, role');

      if (error) throw error;

      const roleMap = new Map<string, AppRole[]>();
      for (const row of data ?? []) {
        const existing = roleMap.get(row.user_id) ?? [];
        existing.push(row.role);
        roleMap.set(row.user_id, existing);
      }
      return roleMap;
    },
    staleTime: 30_000,
  });
}
