import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface CannedResponse {
  id: string;
  slug: string;
  label: string;
  template: string;
  category: string;
  sort_order: number;
}

export function useCannedResponses() {
  return useQuery({
    queryKey: ['canned-responses'],
    queryFn: async (): Promise<CannedResponse[]> => {
      const { data, error } = await untypedFrom('canned_responses')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as unknown as CannedResponse[];
    },
    staleTime: 300_000,
  });
}
