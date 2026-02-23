import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SimilarTag {
  tag_id: string;
  name: string;
  slug: string;
  category: string | null;
  color: string | null;
  image_url: string | null;
  usage_count: number;
  similarity_score: number;
  relationship_type: string;
}

export interface GraphNode {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
  usage_count: number;
  image_url: string | null;
  slug: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  score: number;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Fetch similar tags for a single tag (used in tag detail sidebar)
 */
export function useSimilarTags(tagId: string | null, limit: number = 10) {
  return useQuery({
    queryKey: ['similar-tags', tagId, limit],
    queryFn: async (): Promise<SimilarTag[]> => {
      if (!tagId) return [];

      const { data, error } = await supabase.rpc('get_similar_tags', {
        p_tag_id: tagId,
        p_limit: limit,
        p_min_score: 0.2,
      } as any);

      if (error) {
        console.error('Error fetching similar tags:', error);
        return [];
      }

      return (data as unknown as SimilarTag[]) || [];
    },
    enabled: !!tagId,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch full graph data for the graph visualization
 */
export function useTagGraph(minScore: number = 0.5, categoryFilter: string | null = null) {
  return useQuery({
    queryKey: ['tag-graph', minScore, categoryFilter],
    queryFn: async (): Promise<GraphData> => {
      const params: Record<string, any> = { p_min_score: minScore };
      if (categoryFilter) params.p_category_filter = categoryFilter;

      const { data, error } = await supabase.rpc('get_tag_graph_data', params as any);

      if (error) {
        console.error('Error fetching tag graph data:', error);
        return { nodes: [], edges: [] };
      }

      const result = data as unknown as GraphData;
      return {
        nodes: result?.nodes || [],
        edges: result?.edges || [],
      };
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Mutation to recompute tag similarities (admin only)
 */
export function useComputeTagSimilarities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('compute_tag_similarities' as any);

      if (error) throw error;
      return data as unknown as {
        success: boolean;
        embedding_relationships: number;
        cooccurrence_relationships: number;
        total_relationships: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tag-graph'] });
      queryClient.invalidateQueries({ queryKey: ['similar-tags'] });
      toast({
        title: 'Tag Relationships Computed',
        description: `Found ${data.total_relationships} relationships (${data.embedding_relationships} semantic, ${data.cooccurrence_relationships} co-occurrence)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to compute relationships: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}
