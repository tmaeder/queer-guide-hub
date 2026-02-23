import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TagCategoryInfo {
  id: string;
  name: string;
  is_primary: boolean;
  level?: number;
  parent_id?: string | null;
  parent_name?: string | null;
  slug?: string;
}

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  level: number;
  sort_order: number;
  description?: string;
  color?: string;
  tag_count: number;
  total_tag_count: number;
  children: CategoryTreeChild[];
}

export interface CategoryTreeChild {
  id: string;
  name: string;
  slug: string;
  level: number;
  sort_order: number;
  description?: string;
  color?: string;
  parent_id: string;
  tag_count: number;
}

export interface CentralizedTag {
  id: string;
  name: string;
  category?: string;
  categories?: TagCategoryInfo[];
  description?: string;
  color?: string;
  usage_count: number;
  image_url?: string;
  slug: string;
  status?: string;
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
  const [categoriesTree, setCategoriesTree] = useState<CategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = async (retryCount = 0) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch active tags
      const { data, error: fetchError } = await supabase
        .from("unified_tags")
        .select("*")
        .eq("status", "active")
        .order("usage_count", { ascending: false })
        .limit(10000);

      if (fetchError) {
        console.error("Supabase fetch error:", fetchError);
        throw fetchError;
      }

      // Fetch multi-category assignments with hierarchy info
      const { data: catAssignments } = await supabase
        .from("tag_category_assignments")
        .select("tag_id, category_id, is_primary, tag_categories(id, name, slug, level, parent_id)");

      // Fetch all categories for parent name lookup
      const { data: allCats } = await supabase
        .from("tag_categories")
        .select("id, name, slug, level, parent_id");
      const catLookup = new Map<string, { name: string; slug: string; level: number; parent_id: string | null }>();
      if (allCats) {
        for (const c of allCats) {
          catLookup.set(c.id, { name: c.name, slug: c.slug, level: c.level, parent_id: c.parent_id });
        }
      }

      // Fetch category tree via RPC
      const { data: treeData } = await supabase.rpc("get_category_tree");
      if (treeData) {
        setCategoriesTree(treeData as unknown as CategoryTreeNode[]);
      }

      // Build a map of tag_id -> categories
      const tagCatsMap = new Map<string, TagCategoryInfo[]>();
      if (catAssignments) {
        for (const a of catAssignments) {
          const cat = (a as any).tag_categories;
          if (!cat) continue;
          const parentInfo = cat.parent_id ? catLookup.get(cat.parent_id) : null;
          if (!tagCatsMap.has(a.tag_id)) tagCatsMap.set(a.tag_id, []);
          tagCatsMap.get(a.tag_id)!.push({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            level: cat.level,
            parent_id: cat.parent_id,
            parent_name: parentInfo?.name || null,
            is_primary: a.is_primary,
          });
        }
        // Sort: primary first, then by level (parents before children)
        for (const [, cats] of tagCatsMap) {
          cats.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
        }
      }

      // Enrich tags with categories array
      const enrichedTags: CentralizedTag[] = (data || []).map(tag => ({
        ...tag,
        categories: tagCatsMap.get(tag.id) || [],
      }));

      setAllTags(enrichedTags);

      // Group tags by category (multi-category: a tag appears under each of its categories)
      const categoryMap = new Map<string, CentralizedTag[]>();

      enrichedTags.forEach((tag) => {
        const cats = tag.categories && tag.categories.length > 0
          ? tag.categories.map(c => c.name)
          : tag.category ? [tag.category] : [];

        for (const catName of cats) {
          if (catName && catName !== 'general') {
            if (!categoryMap.has(catName)) {
              categoryMap.set(catName, []);
            }
            categoryMap.get(catName)!.push(tag);
          }
        }
      });

      const categories: TagCategory[] = Array.from(categoryMap.entries()).map(([category, tags]) => ({
        category,
        tags: tags.sort((a, b) => b.usage_count - a.usage_count),
        count: tags.length
      })).sort((a, b) => b.count - a.count);

      setTagsByCategory(categories);
    } catch (err) {
      console.error("Error fetching tags:", err);
      
      // Retry logic for network errors
      if (retryCount < 3 && err instanceof Error && err.message.includes("Failed to fetch")) {
        console.log(`Retrying tag fetch, attempt ${retryCount + 1}`);
        setTimeout(() => fetchTags(retryCount + 1), 1000 * (retryCount + 1));
        return;
      }
      
      setError(err instanceof Error ? err.message : "Failed to fetch tags");
    } finally {
      setLoading(false);
    }
  };

  const searchTags = async (query: string, category?: string): Promise<CentralizedTag[]> => {
    try {
      let queryBuilder = supabase
        .from("unified_tags")
        .select("*")
        .eq("status", "active")
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
    return allTags.filter(tag => {
      // Check multi-category assignments first
      if (tag.categories && tag.categories.length > 0) {
        return tag.categories.some(c => c.name === category);
      }
      // Fallback to primary category
      return tag.category === category || (!tag.category && category === 'general');
    });
  };

  // Get tags assigned to a specific category (including subcategory)
  const getTagsBySubcategory = (categoryId: string): CentralizedTag[] => {
    return allTags.filter(tag => {
      if (tag.categories && tag.categories.length > 0) {
        return tag.categories.some(c => c.id === categoryId);
      }
      return false;
    });
  };

  // Get parent category for a given category name (returns null if already a parent)
  const getParentCategory = (categoryName: string): CategoryTreeNode | null => {
    for (const parent of categoriesTree) {
      if (parent.children.some(c => c.name === categoryName)) {
        return parent;
      }
    }
    return null;
  };

  const getPopularTags = (limit: number = 10): CentralizedTag[] => {
    return allTags
      .filter(tag => tag.usage_count > 0)
      .slice(0, limit);
  };

  const createTag = async (tagData: {
    name: string;
    slug: string;
    category?: string;
    description?: string;
    color?: string;
  }): Promise<CentralizedTag | null> => {
    try {
      const { data, error } = await supabase
        .from("unified_tags")
        .insert([{
          ...tagData,
          slug: tagData.slug || tagData.name.toLowerCase().replace(/\s+/g, '-')
        }])
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
        .from("unified_tags")
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
        .from("unified_tags")
        .delete()
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
    categoriesTree,
    loading,
    error,
    searchTags,
    getTagsByCategory,
    getTagsBySubcategory,
    getParentCategory,
    getPopularTags,
    createTag,
    updateTag,
    deleteTag,
    refreshTags: fetchTags
  };
};