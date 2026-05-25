import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type CollectionItemType = 'venue' | 'event' | 'listing' | 'trip';

export interface GroupCollection {
  id: string;
  group_id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GroupCollectionItem {
  id: string;
  collection_id: string;
  item_type: CollectionItemType;
  item_id: string;
  note: string | null;
  added_by: string | null;
  added_at: string;
}

/** List collections for a group. Reads via RLS — non-members of private groups get nothing. */
export function useGroupCollections(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ['group-collections', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupCollection[]> => {
      if (!groupId) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_collections' as any)
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as GroupCollection[]) ?? [];
    },
  });
}

/** Items inside a collection. */
export function useCollectionItems(collectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['group-collection-items', collectionId],
    enabled: !!collectionId,
    queryFn: async (): Promise<GroupCollectionItem[]> => {
      if (!collectionId) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_collection_items' as any)
        .select('*')
        .eq('collection_id', collectionId)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return (data as GroupCollectionItem[]) ?? [];
    },
  });
}

/** Slugify a free-text collection name. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

/** Create a collection inside a group. */
export function useCreateCollection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { groupId: string; name: string; description?: string }) => {
      if (!user) throw new Error('not signed in');
      const slug = slugify(args.name);
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_collections' as any)
        .insert({
          group_id: args.groupId,
          slug,
          name: args.name.trim(),
          description: args.description?.trim() || null,
          created_by: user.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as GroupCollection;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['group-collections', vars.groupId] });
    },
  });
}

/** Add an item to a collection. */
export function useAddCollectionItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      collectionId: string;
      itemType: CollectionItemType;
      itemId: string;
      note?: string;
    }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_collection_items' as any)
        .insert({
          collection_id: args.collectionId,
          item_type: args.itemType,
          item_id: args.itemId,
          note: args.note?.trim() || null,
          added_by: user.id,
        });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['group-collection-items', vars.collectionId] });
    },
  });
}

/** Remove an item (adder or mod). */
export function useRemoveCollectionItem(collectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('group_collection_items' as any)
        .delete()
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-collection-items', collectionId] });
    },
  });
}
