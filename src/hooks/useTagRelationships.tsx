import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface TagRelationship {
  id: string;
  tag1_id: string;
  tag2_id: string;
  similarity_score: number;
  relationship_type: 'semantic' | 'categorical';
  created_at: string;
}

interface ComputeRelationshipsResult {
  success: boolean;
  processed_tags: number;
  relationships_found: number;
  relationships_stored: number;
  vocabulary_size: number;
}

export const useTagRelationships = () => {
  const [relationships, setRelationships] = useState<TagRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  const fetchRelationships = useCallback(async () => {
    setLoading(true);
    try {
      // Use RPC call since table might not be in types yet
      const { data, error } = await supabase.rpc('get_tag_relationships');

      if (error) {
        console.error('Error fetching tag relationships:', error);
        toast({
          title: "Error",
          description: "Failed to fetch tag relationships",
          variant: "destructive",
        });
        return [];
      }

      const typedData = (data || []) as TagRelationship[];
      setRelationships(typedData);
      return typedData;
    } catch (error) {
      console.error('Error fetching tag relationships:', error);
      toast({
        title: "Error",
        description: "Failed to fetch tag relationships",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const computeRelationships = useCallback(async () => {
    setComputing(true);
    try {
      toast({
        title: "Computing Relationships",
        description: "Analyzing tag similarities using AI embeddings...",
      });

      const { data, error } = await supabase.functions.invoke('compute-tag-relationships', {
        body: {}
      });

      if (error) {
        console.error('Error computing tag relationships:', error);
        toast({
          title: "Error",
          description: `Failed to compute tag relationships: ${error.message}`,
          variant: "destructive",
        });
        return null;
      }

      const result = data as ComputeRelationshipsResult;
      
      if (result.success) {
        toast({
          title: "Relationships Computed",
          description: `Found ${result.relationships_found} relationships between ${result.processed_tags} tags`,
        });

        // Refresh the relationships data
        await fetchRelationships();
        return result;
      } else {
        toast({
          title: "Computation Failed",
          description: "Failed to compute tag relationships",
          variant: "destructive",
        });
        return null;
      }
    } catch (error) {
      console.error('Error computing tag relationships:', error);
      toast({
        title: "Error",
        description: "Failed to compute tag relationships",
        variant: "destructive",
      });
      return null;
    } finally {
      setComputing(false);
    }
  }, [fetchRelationships]);

  const getRelationshipsForTag = useCallback((tagId: string, threshold: number = 0.1) => {
    return relationships.filter(rel => 
      (rel.tag1_id === tagId || rel.tag2_id === tagId) && 
      rel.similarity_score >= threshold
    );
  }, [relationships]);

  const getRelationshipsBetweenTags = useCallback((tag1Id: string, tag2Id: string) => {
    return relationships.find(rel => 
      (rel.tag1_id === tag1Id && rel.tag2_id === tag2Id) ||
      (rel.tag1_id === tag2Id && rel.tag2_id === tag1Id)
    );
  }, [relationships]);

  return {
    relationships,
    loading,
    computing,
    fetchRelationships,
    computeRelationships,
    getRelationshipsForTag,
    getRelationshipsBetweenTags,
  };
};