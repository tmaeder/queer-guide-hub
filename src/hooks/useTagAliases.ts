import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface TagAlias {
  id: string;
  canonical_tag_id: string;
  alias_name: string;
  alias_slug: string;
  alias_type: string;
  // Nullable in the generated DB types; DB default is 'auto'. Treat null as
  // unreviewed everywhere.
  review_status: string | null;
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
      // tag_aliases.alias_slug is NOT NULL with no default and no BEFORE
      // trigger deriving it, so unlike unified_tags the caller genuinely has
      // to supply one — '' is not an escape hatch here. It is taken from
      // normalize_tag_slug(), the same implementation unified_tags uses, so
      // the two can never drift.
      //
      // The regex that used to live here STRIPPED every character outside
      // [a-z0-9-] instead of separating on it, and aliases have no non-ASCII
      // seal to rescue them the way unified_tags does: measured against the
      // live function, 'Cafe Society' with an acute accent became 'caf-society' rather than
      // 'cafe-society', 'HIV/AIDS' became 'hivaids' rather than 'hiv-aids',
      // and an accented Spanish alias became 'dominacin-...' rather than
      // 'dominacion-...' — already the stored value on rows of this shape.
      //
      // A failure throws rather than falling back to a local slugifier: a
      // lossy value cannot be repaired downstream, so no slug is better than
      // a wrong one the admin cannot see.
      const { data: normalized, error: slugError } = await untypedRpc<string>(
        'normalize_tag_slug',
        {
          p_input: alias_name,
        },
      );
      if (slugError) throw new Error(`Could not normalize alias slug: ${slugError.message}`);
      const alias_slug = (normalized ?? '').trim();
      if (!alias_slug) throw new Error(`Alias "${alias_name}" does not normalize to a usable slug`);
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
