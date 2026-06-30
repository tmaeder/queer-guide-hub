import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface SavedSearch {
  id: string;
  name: string;
  query: string | null;
  filters: Record<string, unknown>;
  alert_enabled: boolean;
  alert_frequency: 'daily' | 'weekly';
  last_alerted_at: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase as any;

async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await rpc.rpc('list_news_saved_searches');
  if (error || !data) return [];
  return data as SavedSearch[];
}

export function useNewsSavedSearches() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['news-saved-searches', user?.id];

  const { data: searches = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: fetchSavedSearches,
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (args: {
      name: string;
      query?: string;
      filters?: Record<string, unknown>;
      alert_enabled?: boolean;
      alert_frequency?: 'daily' | 'weekly';
    }) => {
      const { error } = await rpc.rpc('save_news_search', {
        p_name: args.name,
        p_query: args.query ?? null,
        p_filters: args.filters ?? {},
        p_alert_enabled: args.alert_enabled ?? false,
        p_alert_frequency: args.alert_frequency ?? 'daily',
      });
      if (error) throw error;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc.rpc('delete_news_search', { p_id: id });
      if (error) throw error;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await rpc.rpc('toggle_news_search_alert', {
        p_id: id,
        p_enabled: enabled,
      });
      if (error) throw error;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    searches,
    isLoading,
    canSave: !!user,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    remove: removeMutation.mutateAsync,
    toggleAlert: toggleAlertMutation.mutateAsync,
  };
}
