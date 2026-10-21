import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { untypedFrom } from '@/integrations/supabase/untyped';
interface CleanupStatus {
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
}
export function useReviewCleanupStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['review-cleanup-status', user?.id],
    enabled: !!user?.id,
    queryFn: async ({ signal }) => {
      const { data, error } = await untypedFrom('admin_automations')
        .select('enabled,last_run_at,last_run_status')
        .eq('slug', 'review_queue_hygiene')
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as CleanupStatus | null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
