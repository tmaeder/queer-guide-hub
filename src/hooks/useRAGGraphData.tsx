import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GraphNode {
  id: string;
  content_type: string;
  content_text: string;
  metadata: any;
  similarity?: number;
  position?: [number, number, number];
}

interface GraphConnection {
  source_id: string;
  target_id: string;
  similarity_score: number;
  relationship_type: string;
}

export function useRAGGraphData() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [connections, setConnections] = useState<GraphConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraphData = async (query?: string, contentTypes: string[] = []) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch content embeddings
      let embedQuery = supabase
        .from('content_embeddings')
        .select('*')
        .limit(100);

      if (contentTypes.length > 0) {
        embedQuery = embedQuery.in('content_type', contentTypes);
      }

      const { data: embeddings, error: embedError } = await embedQuery;

      if (embedError) throw embedError;

      // If we have a query, try to get similarity scores
      if (query && embeddings?.length) {
        try {
          const { data: ragResponse } = await supabase.functions.invoke('intelligent-rag', {
            body: {
              query,
              content_types: contentTypes.length > 0 ? contentTypes : undefined,
              limit: 50
            }
          });

          if (ragResponse?.context) {
            // Use RAG response data with similarity scores
            setNodes(ragResponse.context.map((item: any, index: number) => ({
              id: item.content_id || `node-${index}`,
              content_type: item.content_type,
              content_text: item.content_text,
              metadata: item.metadata || {},
              similarity: item.similarity
            })));
          }
        } catch (ragError) {
          console.log('RAG query failed, using fallback data:', ragError);
          // Fallback to embedding data without similarity scores
          setNodes(embeddings.map((item, index) => ({
            id: item.content_id,
            content_type: item.content_type,
            content_text: item.content_text,
            metadata: item.metadata || {},
            similarity: 0.5 // Default similarity for embeddings
          })));
        }
      } else {
        // No query provided, use all embeddings
        setNodes(embeddings?.map((item, index) => ({
          id: item.content_id,
          content_type: item.content_type,
          content_text: item.content_text,
          metadata: item.metadata || {},
          similarity: 1.0 // Default similarity for non-query embeddings
        })) || []);
      }

      // Try to fetch actual relationships if they exist
      const { data: relationships } = await supabase
        .from('tag_relationships')
        .select('*')
        .limit(200);

      if (relationships?.length) {
        setConnections(relationships.map(rel => ({
          source_id: rel.tag1_id,
          target_id: rel.tag2_id,
          similarity_score: rel.similarity_score,
          relationship_type: rel.relationship_type || 'semantic'
        })));
      } else {
        // No connections if no real relationships exist
        setConnections([]);
      }

    } catch (error) {
      console.error('Error fetching graph data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch graph data');
    } finally {
      setIsLoading(false);
    }
  };

  const searchSimilarContent = async (nodeId: string) => {
    try {
      // Get the node content
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return [];

      // Use the content text as a query to find similar items
      const { data } = await supabase.functions.invoke('intelligent-rag', {
        body: {
          query: node.content_text,
          limit: 10
        }
      });

      return data?.context || [];
    } catch (error) {
      console.error('Error searching similar content:', error);
      return [];
    }
  };

  const getNodeDetails = async (nodeId: string) => {
    try {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return null;

      // Fetch additional details based on content type
      let details = null;
      switch (node.content_type) {
        case 'venue':
          const { data: venue } = await supabase
            .from('venues')
            .select('*')
            .eq('id', nodeId)
            .single();
          details = venue;
          break;
        case 'event':
          const { data: event } = await supabase
            .from('events')
            .select('*')
            .eq('id', nodeId)
            .single();
          details = event;
          break;
        case 'tag':
          const { data: tag } = await supabase
            .from('unified_tags')
            .select('*')
            .eq('id', nodeId)
            .single();
          details = tag;
          break;
        case 'group':
          const { data: group } = await supabase
            .from('community_groups')
            .select('*')
            .eq('id', nodeId)
            .single();
          details = group;
          break;
        case 'marketplace':
          const { data: listing } = await supabase
            .from('marketplace_listings')
            .select('*')
            .eq('id', nodeId)
            .single();
          details = listing;
          break;
      }

      return {
        ...node,
        details
      };
    } catch (error) {
      console.error('Error fetching node details:', error);
      return nodes.find(n => n.id === nodeId) || null;
    }
  };

  return {
    nodes,
    connections,
    isLoading,
    error,
    fetchGraphData,
    searchSimilarContent,
    getNodeDetails
  };
}