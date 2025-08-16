import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import type { Database } from '@/integrations/supabase/types';

type CMSContent = Database['public']['Tables']['cms_content']['Row'];
type CMSContentInsert = Database['public']['Tables']['cms_content']['Insert'];
type CMSContentUpdate = Database['public']['Tables']['cms_content']['Update'];
type CMSMedia = Database['public']['Tables']['cms_media']['Row'];
type CMSRelationship = Database['public']['Tables']['cms_content_relationships']['Row'];

export interface CMSContentWithRelations extends CMSContent {
  media?: CMSMedia[];
  relationships?: CMSRelationship[];
}

export function useCMS() {
  const { user } = useAuth();
  const [content, setContent] = useState<CMSContentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch content with optional filters
  const fetchContent = async (filters?: {
    contentType?: Database['public']['Enums']['cms_content_type'];
    workflowState?: Database['public']['Enums']['cms_workflow_state'];
    visibilityLevel?: Database['public']['Enums']['cms_visibility_level'];
    limit?: number;
    offset?: number;
  }) => {
    try {
      setLoading(true);
      let query = supabase
        .from('cms_content')
        .select(`
          *,
          cms_content_media (
            *,
            cms_media (*)
          ),
          cms_content_relationships (*)
        `)
        .order('updated_at', { ascending: false });

      if (filters?.contentType) {
        query = query.eq('content_type', filters.contentType);
      }
      if (filters?.workflowState) {
        query = query.eq('workflow_state', filters.workflowState);
      }
      if (filters?.visibilityLevel) {
        query = query.eq('visibility_level', filters.visibilityLevel);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      }

      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      
      setContent(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching content:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch content');
    } finally {
      setLoading(false);
    }
  };

  // Create new content
  const createContent = async (contentData: CMSContentInsert) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to create content",
        variant: "destructive",
      });
      return null;
    }

    try {
      const { data, error: createError } = await supabase
        .from('cms_content')
        .insert({
          ...contentData,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      toast({
        title: "Content created",
        description: "Your content has been created successfully",
      });

      fetchContent(); // Refresh the list
      return data;
    } catch (err) {
      console.error('Error creating content:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to create content',
        variant: "destructive",
      });
      return null;
    }
  };

  // Update content
  const updateContent = async (id: string, updates: CMSContentUpdate) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to update content",
        variant: "destructive",
      });
      return null;
    }

    try {
      const { data, error: updateError } = await supabase
        .from('cms_content')
        .update({
          ...updates,
          updated_by: user.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      toast({
        title: "Content updated",
        description: "Your content has been updated successfully",
      });

      fetchContent(); // Refresh the list
      return data;
    } catch (err) {
      console.error('Error updating content:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to update content',
        variant: "destructive",
      });
      return null;
    }
  };

  // Publish content
  const publishContent = async (id: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to publish content",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error: publishError } = await supabase
        .from('cms_content')
        .update({
          workflow_state: 'published',
          visibility_level: 'public',
          published_at: new Date().toISOString(),
          published_by: user.id,
          updated_by: user.id,
        })
        .eq('id', id);

      if (publishError) throw publishError;

      toast({
        title: "Content published",
        description: "Your content is now live",
      });

      fetchContent(); // Refresh the list
      return true;
    } catch (err) {
      console.error('Error publishing content:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to publish content',
        variant: "destructive",
      });
      return false;
    }
  };

  // Archive content
  const archiveContent = async (id: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to archive content",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error: archiveError } = await supabase
        .from('cms_content')
        .update({
          workflow_state: 'archived',
          updated_by: user.id,
        })
        .eq('id', id);

      if (archiveError) throw archiveError;

      toast({
        title: "Content archived",
        description: "Content has been archived",
      });

      fetchContent(); // Refresh the list
      return true;
    } catch (err) {
      console.error('Error archiving content:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to archive content',
        variant: "destructive",
      });
      return false;
    }
  };

  // Delete content (soft delete)
  const deleteContent = async (id: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to delete content",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error: deleteError } = await supabase
        .from('cms_content')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          updated_by: user.id,
        })
        .eq('id', id);

      if (deleteError) throw deleteError;

      toast({
        title: "Content deleted",
        description: "Content has been moved to trash",
      });

      fetchContent(); // Refresh the list
      return true;
    } catch (err) {
      console.error('Error deleting content:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to delete content',
        variant: "destructive",
      });
      return false;
    }
  };

  // Get content by ID
  const getContentById = async (id: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('cms_content')
        .select(`
          *,
          cms_content_media (
            *,
            cms_media (*)
          ),
          cms_content_relationships (*)
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return data;
    } catch (err) {
      console.error('Error fetching content by ID:', err);
      return null;
    }
  };

  // Initial load
  useEffect(() => {
    fetchContent();
  }, []);

  return {
    content,
    loading,
    error,
    fetchContent,
    createContent,
    updateContent,
    publishContent,
    archiveContent,
    deleteContent,
    getContentById,
  };
}