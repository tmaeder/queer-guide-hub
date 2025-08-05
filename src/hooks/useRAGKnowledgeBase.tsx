import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RAGResponse {
  response: string;
  context: Array<{
    content_type: string;
    content_text: string;
    metadata: any;
    similarity?: number;
    venue_details?: any;
    event_details?: any;
    tag_details?: any;
    group_details?: any;
    listing_details?: any;
  }>;
  sources_count: number;
  session_id: string;
}

interface RAGConversation {
  id: string;
  query: string;
  response: string;
  context_used: any;
  created_at: string;
}

export function useRAGKnowledgeBase() {
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<RAGConversation[]>([]);
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    // Generate a new session ID
    setSessionId(crypto.randomUUID());
    
    // Load conversation history
    loadConversationHistory();
  }, []);

  const loadConversationHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('rag_conversations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setConversations((data || []).map(item => ({
        id: item.id,
        query: item.query,
        response: item.response,
        context_used: item.context_used,
        created_at: item.created_at
      })));
    } catch (error) {
      console.error('Error loading conversation history:', error);
    }
  };

  const askQuestion = async (
    query: string, 
    contentTypes: string[] = [],
    limit: number = 5
  ): Promise<RAGResponse | null> => {
    if (!query.trim()) return null;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('intelligent-rag', {
        body: {
          query: query.trim(),
          session_id: sessionId,
          content_types: contentTypes,
          limit
        }
      });

      if (error) throw error;

      // Add to conversation history
      const newConversation: RAGConversation = {
        id: crypto.randomUUID(),
        query: query.trim(),
        response: data.response,
        context_used: data.context,
        created_at: new Date().toISOString()
      };

      setConversations(prev => [newConversation, ...prev.slice(0, 9)]);

      return data;
    } catch (error) {
      console.error('Error asking question:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const populateEmbeddings = async (
    contentTypes: string[] = ['venue', 'event', 'tag', 'group', 'marketplace'],
    forceRefresh: boolean = false
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('populate-embeddings', {
        body: {
          content_types: contentTypes,
          force_refresh: forceRefresh
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error populating embeddings:', error);
      throw error;
    }
  };

  const clearConversationHistory = () => {
    setConversations([]);
    setSessionId(crypto.randomUUID());
  };

  return {
    isLoading,
    conversations,
    sessionId,
    askQuestion,
    populateEmbeddings,
    clearConversationHistory,
    loadConversationHistory
  };
}