import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EditorialEntityType = 'country' | 'city' | 'village';

export interface EditorialDraft {
  id: string;
  entity_type: EditorialEntityType;
  entity_id: string;
  draft_hook: string | null;
  draft_long: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  generated_at: string;
  model: string | null;
}

export interface EditorialCoverRow {
  id: string;
  entity_type: EditorialEntityType;
  entity_id: string;
  headline: string;
  pull_quote: string | null;
  hero_image_url: string | null;
  author: string | null;
  starts_at: string;
  ends_at: string | null;
  published: boolean;
}

export function useGenerateDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entity_type: EditorialEntityType; batch_size: number }) => {
      const { data, error } = await supabase.functions.invoke('pipeline-enrich-places', {
        body: input,
      });
      if (error) throw error;
      return data as { drafted: number; failed: number; candidates: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editorial-drafts'] }),
  });
}

// ---------------------------------------------------------------------------
// Covers
// ---------------------------------------------------------------------------

export function useAdminCovers() {
  return useQuery({
    queryKey: ['editorial-covers-all'],
    queryFn: async (): Promise<EditorialCoverRow[]> => {
      const { data, error } = await supabase
        .from('editorial_covers')
        .select(
          'id, entity_type, entity_id, headline, pull_quote, hero_image_url, author, starts_at, ends_at, published',
        )
        .order('starts_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EditorialCoverRow[];
    },
  });
}

export function useToggleCoverPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; published: boolean }) => {
      const { error } = await supabase
        .from('editorial_covers')
        .update({ published: input.published })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['editorial-covers-all'] });
      void qc.invalidateQueries({ queryKey: ['editorial-cover-current'] });
    },
  });
}
