import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserSubmission {
  id: string;
  content_type: string;
  status: string;
  submitted_at: string;
  name: string | null;
  promoted: boolean;
}

/** A user's own community submissions with review status. Own-profile only (RLS-enforced). */
export function useUserSubmissions(userId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['user-submissions', userId],
    enabled: !!userId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<UserSubmission[]> => {
      const { data, error } = await supabase
        .from('community_submissions')
        .select('id, content_type, status, submitted_at, data, promoted_to_id')
        .eq('submitted_by', userId!)
        .order('submitted_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((s) => {
        const payload = s.data as Record<string, unknown> | null;
        return {
          id: s.id,
          content_type: s.content_type,
          status: s.status,
          submitted_at: s.submitted_at,
          name:
            ((payload?.name ?? payload?.title) as string | undefined) ?? null,
          promoted: !!s.promoted_to_id,
        };
      });
    },
  });
}
