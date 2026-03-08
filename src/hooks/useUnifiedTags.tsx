import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UnifiedTag {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  usage_count: number;
  category?: string;
  created_at: string;
  updated_at: string;
}

export interface UnifiedTagAssignment {
  id: string;
  tag_id: string;
  entity_id: string;
  entity_type: string;
  created_at: string;
  tag?: UnifiedTag;
}

export const useUnifiedTags = () => {
  const [tags, setTags] = useState<UnifiedTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTags = async (category?: string) => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('unified_tags')
        .select('*')
        .eq('status', 'active')
        .order('usage_count', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTags(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch tags';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const searchTags = async (query: string, category?: string): Promise<UnifiedTag[]> => {
    try {
      let queryBuilder = supabase.from('unified_tags').select('*').ilike('name', `%${query}%`);

      if (category) {
        queryBuilder = queryBuilder.eq('category', category);
      }

      const { data, error } = await queryBuilder
        .order('usage_count', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error searching tags:', err);
      return [];
    }
  };

  const createTag = async (tagData: { name: string; description?: string; category?: string }) => {
    try {
      const slug = tagData.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const { data, error } = await supabase
        .from('unified_tags')
        .insert([
          {
            ...tagData,
            slug,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setTags((prev) => [...prev, data]);
      toast({
        title: 'Success',
        description: 'Tag created successfully',
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create tag';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const updateTag = async (id: string, updates: Partial<UnifiedTag>) => {
    try {
      const { data, error } = await supabase
        .from('unified_tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setTags((prev) => prev.map((tag) => (tag.id === id ? data : tag)));
      toast({
        title: 'Success',
        description: 'Tag updated successfully',
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update tag';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const deleteTag = async (id: string) => {
    try {
      const { error } = await supabase.from('unified_tags').delete().eq('id', id);

      if (error) throw error;

      setTags((prev) => prev.filter((tag) => tag.id !== id));
      toast({
        title: 'Success',
        description: 'Tag deleted successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete tag';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const assignTag = async (tagId: string, entityId: string, entityType: string) => {
    try {
      const { data, error } = await supabase
        .from('unified_tag_assignments')
        .insert([
          {
            tag_id: tagId,
            entity_id: entityId,
            entity_type: entityType,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Tag assigned successfully',
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to assign tag';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const unassignTag = async (tagId: string, entityId: string, entityType: string) => {
    try {
      const { error } = await supabase
        .from('unified_tag_assignments')
        .delete()
        .eq('tag_id', tagId)
        .eq('entity_id', entityId)
        .eq('entity_type', entityType);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Tag unassigned successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unassign tag';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const getEntityTags = async (entityId: string, entityType: string): Promise<UnifiedTag[]> => {
    try {
      const { data, error } = await supabase
        .from('unified_tag_assignments')
        .select(
          `
          tag_id,
          unified_tags (*)
        `,
        )
        .eq('entity_id', entityId)
        .eq('entity_type', entityType);

      if (error) throw error;

      return data?.map((assignment) => (assignment as any).unified_tags).filter(Boolean) || [];
    } catch (err) {
      console.error('Failed to fetch entity tags:', err);
      return [];
    }
  };

  const assignTagsToEntity = async (entityId: string, entityType: string, tagIds: string[]) => {
    try {
      // Remove existing assignments
      await supabase
        .from('unified_tag_assignments')
        .delete()
        .eq('entity_id', entityId)
        .eq('entity_type', entityType);

      // Add new assignments
      if (tagIds.length > 0) {
        const assignments = tagIds.map((tagId) => ({
          tag_id: tagId,
          entity_id: entityId,
          entity_type: entityType,
        }));

        const { error } = await supabase.from('unified_tag_assignments').insert(assignments);

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: 'Tags updated successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update tags';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    }
  };

  const getTagsByCategory = (category: string): UnifiedTag[] => {
    return tags.filter((tag) => tag.category === category);
  };

  const getPopularTags = (limit: number = 10): UnifiedTag[] => {
    return tags.filter((tag) => tag.usage_count > 0).slice(0, limit);
  };

  useEffect(() => {
    fetchTags();
  }, []);

  return {
    tags,
    allTags: tags, // For backwards compatibility
    loading,
    error,
    fetchTags,
    searchTags,
    createTag,
    updateTag,
    deleteTag,
    assignTag,
    unassignTag,
    getEntityTags,
    assignTagsToEntity,
    getTagsByCategory,
    getPopularTags,
    refresh: () => fetchTags(),
    refreshTags: () => fetchTags(),
  };
};
