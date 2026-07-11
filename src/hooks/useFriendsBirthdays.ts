import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export interface FriendBirthday {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  occurs_on: string; // YYYY-MM-DD, window-year anchored — never carries the birth year
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;

/**
 * Friends'-birthdays layer. Server-side privacy: the friends_birthdays RPC
 * only returns accepted friends who opted in (birthday_visibility='friends'),
 * month+day only.
 */
export function useFriendsBirthdays(from: Date, to: Date, enabled: boolean) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['calendar-birthdays', user?.id, dayKey(from), dayKey(to)],
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await untypedRpc<FriendBirthday[]>('friends_birthdays', {
        p_from: dayKey(from),
        p_to: dayKey(to),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { items: query.data ?? [], loading: query.isLoading };
}
