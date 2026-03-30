import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagAlias {
  id: string;
  canonical_tag_id: string;
  alias_name: string;
  alias_slug: string;
  alias_type: string;
  created_at: string;
}

export function useTagAliases(tagId: string | null) {
  const queryClient = useQueryClient();

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ['tag-aliases', tagId],
    queryFn: async (): Promise<TagAlias[]> => {
      if (!tagId) return [];
      const { data, error } = await supabase
        .from('tag_aliases')
        .select('*')
        .eq('canonical_tag_id', tagId)
        .order('alias_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!tagId,
    staleTime: 5 * 60 * 1000,
  });

  const createAlias = useMutation({
    mutationFn: async ({ alias_name, alias_type }: { alias_name: string; alias_type: string }) => {
      if (!tagId) throw new Error('No tag selected');
      const alias_slug = alias_name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      const { data, error } = await supabase
        .from('tag_aliases')
        .insert([{ canonical_tag_id: tagId, alias_name, alias_slug, alias_type }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-aliases', tagId] });
    },
  });

  const deleteAlias = useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await supabase.from('tag_aliases').delete().eq('id', aliasId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-aliases', tagId] });
    },
  });

  return { aliases, isLoading, createAlias, deleteAlias };
}
