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

export interface EditorialRailRow {
  id: string;
  slug: string;
  title: string;
  editor_note: string | null;
  entity_type: EditorialEntityType;
  status: 'draft' | 'published' | 'archived';
  position: number;
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

// ---------------------------------------------------------------------------
// Drafts queue
// ---------------------------------------------------------------------------

export function usePendingDrafts(entityType: EditorialEntityType) {
  return useQuery({
    queryKey: ['editorial-drafts', entityType],
    queryFn: async (): Promise<EditorialDraft[]> => {
      const { data, error } = await supabase
        .from('editorial_drafts')
        .select('id, entity_type, entity_id, draft_hook, draft_long, status, generated_at, model')
        .eq('entity_type', entityType)
        .eq('status', 'pending')
        .order('generated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EditorialDraft[];
    },
  });
}

export function useEntityName(entity_type: EditorialEntityType, entity_id: string) {
  return useQuery({
    queryKey: ['editorial-draft-entity', entity_type, entity_id],
    queryFn: async () => {
      const table =
        entity_type === 'country' ? 'countries'
        : entity_type === 'city' ? 'cities'
        : 'queer_villages';
      const { data } = await supabase
        .from(table as 'countries')
        .select('name')
        .eq('id', entity_id)
        .maybeSingle();
      return (data as { name?: string } | null)?.name ?? '(unknown)';
    },
    staleTime: 60_000,
  });
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

export function useSaveDraft() {
  return useMutation({
    mutationFn: async (input: { id: string; draft_hook: string; draft_long: string | null }) => {
      const { error } = await supabase
        .from('editorial_drafts')
        .update({ draft_hook: input.draft_hook, draft_long: input.draft_long })
        .eq('id', input.id);
      if (error) throw error;
    },
  });
}

export function useApproveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('approve_editorial_draft', { p_draft_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editorial-drafts'] }),
  });
}

export function useRejectDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('editorial_drafts')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editorial-drafts'] }),
  });
}

// ---------------------------------------------------------------------------
// Rails (admin view of all rails, draft + published + archived)
// ---------------------------------------------------------------------------

export function useAdminRails() {
  return useQuery({
    queryKey: ['editorial-rails-all'],
    queryFn: async (): Promise<EditorialRailRow[]> => {
      const { data, error } = await supabase
        .from('editorial_rails')
        .select('id, slug, title, editor_note, entity_type, status, position')
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EditorialRailRow[];
    },
  });
}

export function useCreateRail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<EditorialRailRow, 'id'>) => {
      const { error } = await supabase.from('editorial_rails').insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editorial-rails-all'] }),
  });
}

export function useUpdateRail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<EditorialRailRow> }) => {
      const { error } = await supabase
        .from('editorial_rails')
        .update(input.patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['editorial-rails-all'] });
      void qc.invalidateQueries({ queryKey: ['editorial-rails-published'] });
    },
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
