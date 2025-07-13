import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CentralizedTag {
  id: string;
  name: string;
  category: string;
  description?: string;
  color: string;
  usage_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TagCategory {
  category: string;
  tags: CentralizedTag[];
  count: number;
}

export const useCentralizedTags = () => {
  const [allTags, setAllTags] = useState<CentralizedTag[]>([]);
  const [tagsByCategory, setTagsByCategory] = useState<TagCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("tags")
        .select("*")
        .eq("is_active", true)
        .order("usage_count", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setAllTags(data || []);

      // Group tags by category
      const categoryMap = new Map<string, CentralizedTag[]>();
      
      (data || []).forEach((tag) => {
        if (!categoryMap.has(tag.category)) {
          categoryMap.set(tag.category, []);
        }
        categoryMap.get(tag.category)!.push(tag);
      });

      const categories: TagCategory[] = Array.from(categoryMap.entries()).map(([category, tags]) => ({
        category,
        tags: tags.sort((a, b) => b.usage_count - a.usage_count),
        count: tags.length
      })).sort((a, b) => b.count - a.count);

      setTagsByCategory(categories);
    } catch (err) {
      console.error("Error fetching tags:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch tags");
    } finally {
      setLoading(false);
    }
  };

  const searchTags = async (query: string, category?: string): Promise<CentralizedTag[]> => {
    try {
      let queryBuilder = supabase
        .from("tags")
        .select("*")
        .eq("is_active", true)
        .ilike("name", `%${query}%`);

      if (category) {
        queryBuilder = queryBuilder.eq("category", category);
      }

      const { data, error } = await queryBuilder
        .order("usage_count", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error("Error searching tags:", err);
      return [];
    }
  };

  const getTagsByCategory = (category: string): CentralizedTag[] => {
    return allTags.filter(tag => tag.category === category);
  };

  const getPopularTags = (limit: number = 10): CentralizedTag[] => {
    return allTags
      .filter(tag => tag.usage_count > 0)
      .slice(0, limit);
  };

  const createTag = async (tagData: {
    name: string;
    category: string;
    description?: string;
    color?: string;
  }): Promise<CentralizedTag | null> => {
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert([tagData])
        .select()
        .single();

      if (error) throw error;

      // Refresh tags after creation
      await fetchTags();
      return data;
    } catch (err) {
      console.error("Error creating tag:", err);
      throw err;
    }
  };

  const updateTag = async (id: string, updates: Partial<CentralizedTag>): Promise<void> => {
    try {
      const { error } = await supabase
        .from("tags")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      // Refresh tags after update
      await fetchTags();
    } catch (err) {
      console.error("Error updating tag:", err);
      throw err;
    }
  };

  const deleteTag = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from("tags")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;

      // Refresh tags after deletion
      await fetchTags();
    } catch (err) {
      console.error("Error deleting tag:", err);
      throw err;
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  return {
    allTags,
    tagsByCategory,
    loading,
    error,
    searchTags,
    getTagsByCategory,
    getPopularTags,
    createTag,
    updateTag,
    deleteTag,
    refreshTags: fetchTags
  };
};