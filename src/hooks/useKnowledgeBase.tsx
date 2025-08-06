import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type KnowledgeBaseRow = Database['public']['Tables']['knowledge_base']['Row'];

export interface KnowledgeItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  icon: string | null;
  color: string | null;
  image_url: string | null;
  metadata: any;
  usage_count: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface KnowledgeFilters {
  category?: string;
  search?: string;
  isActive?: boolean;
}

export function useKnowledgeBase() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async (filters?: KnowledgeFilters) => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('knowledge_base')
        .select('*')
        .eq('is_active', filters?.isActive ?? true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setItems(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge base items');
    } finally {
      setLoading(false);
    }
  };

  const getItemsByCategory = (category: string) => {
    return items.filter(item => item.category === category);
  };

  const getItemBySlug = (slug: string, category?: string) => {
    return items.find(item => 
      item.slug === slug && (category ? item.category === category : true)
    );
  };

  const createItem = async (itemData: Omit<KnowledgeItem, 'id' | 'slug' | 'created_at' | 'updated_at' | 'usage_count'>) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .insert([itemData])
        .select()
        .single();

      if (error) throw error;

      setItems(prev => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create item';
      setError(errorMessage);
      return { data: null, error: errorMessage };
    }
  };

  const updateItem = async (id: string, updates: Partial<KnowledgeItem>) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setItems(prev => prev.map(item => item.id === id ? data : item));
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update item';
      setError(errorMessage);
      return { data: null, error: errorMessage };
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setItems(prev => prev.filter(item => item.id !== id));
      return { error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete item';
      setError(errorMessage);
      return { error: errorMessage };
    }
  };

  const incrementUsage = async (id: string) => {
    try {
      // Direct update instead of RPC for now
      const { error } = await supabase
        .from('knowledge_base')
        .update({ usage_count: items.find(i => i.id === id)?.usage_count + 1 || 1 })
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, usage_count: item.usage_count + 1 } : item
      ));
    } catch (err) {
      console.error('Failed to increment usage:', err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  return {
    items,
    loading,
    error,
    fetchItems,
    getItemsByCategory,
    getItemBySlug,
    createItem,
    updateItem,
    deleteItem,
    incrementUsage,
    refetch: fetchItems
  };
}