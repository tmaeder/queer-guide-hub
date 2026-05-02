import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagSuggestionRow {
  id: string;
  entity_id: string;
  entity_type: string;
  tag_id: string | null;
  suggested_tag_name: string;
  confidence: number;
  source: string;
  status: string;
  ai_model: string | null;
  batch_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

async function fetchPendingTagSuggestions(): Promise<{
  items: TagSuggestionRow[];
  total: number;
}> {
  const { data, count, error } = await supabase
    .from('tag_suggestions' as const)
    .select('*', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return { items: (data || []) as TagSuggestionRow[], total: count ?? 0 };
}

export function usePendingTagSuggestions() {
  return useQuery({
    queryKey: ['tag-suggestions-pending'],
    queryFn: fetchPendingTagSuggestions,
    staleTime: 30_000,
  });
}

export async function fetchAllPendingTagSuggestionIds(): Promise<string[]> {
  const { data } = await supabase
    .from('tag_suggestions' as const)
    .select('id')
    .eq('status', 'pending')
    .limit(5000);
  return ((data || []) as Array<{ id: string }>).map((i) => i.id);
}

export async function rejectTagSuggestions(
  ids: string[],
  reviewerId: string | undefined,
): Promise<number> {
  const { error } = await supabase
    .from('tag_suggestions' as const)
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', ids);
  if (error) throw error;
  return ids.length;
}
