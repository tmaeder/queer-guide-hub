import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagAlias {
  id: string;
  canonical_tag_id: string;
  alias_name: string;
  alias_slug: string;
  alias_type: string;
  review_status: string;
  created_at: string;
}

/**
 * `publicOnly` restricts the read to `review_status='approved'`. The public
 * glossary page must pass it: auto-tagging (20260910151200) and the
 * search-synonym bridge already trust approved aliases only, while the
 * unreviewed pool is machine-minted from Wikidata sitelinks of a sometimes
 * wrong entity — displaying it published junk as synonyms. Admin omits it.
 */
export function useTagAliases(tagId: string | null, opts?: { publicOnly?: boolean }) {
  const queryClient = useQueryClient();
  const publicOnly = opts?.publicOnly ?? false;

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ['tag-aliases', tagId, publicOnly],
    queryFn: async (): Promise<TagAlias[]> => {
      if (!tagId) return [];
      let query = supabase
        .from('tag_aliases')
        .select('*')
        .eq('canonical_tag_id', tagId)
        .order('alias_name');
      if (publicOnly) query = query.eq('review_status', 'approved');
      const { data, error } = await query;
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
        .insert([
          // An admin typing an alias IS the review — land it approved so it
          // displays publicly and is trusted by auto-tagging.
          {
            canonical_tag_id: tagId,
            alias_name,
            alias_slug,
            alias_type,
            review_status: 'approved',
          },
        ])
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
