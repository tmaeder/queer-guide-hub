import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';

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

interface CentralizedTagsData {
  allTags: CentralizedTag[];
  tagsByCategory: TagCategory[];
  categoriesTree: CategoryTreeNode[];
}

/**
 * Core fetch function — parallelises independent queries and enriches tags
 * with multi-category assignments.
 */
async function fetchAllTagsWithCategories(): Promise<CentralizedTagsData> {
  // Run independent queries in parallel
  const [tagsResult, catAssignmentsResult, allCatsResult, treeResult] = await Promise.all([
    api
      .from('unified_tags')
      .select('*')
      .eq('status', 'active')
      .order('usage_count', { ascending: false })
      .limit(10000),
    api
      .from('tag_category_assignments')
      .select('tag_id, category_id, is_primary, tag_categories(id, name, slug, level, parent_id)'),
    api.from('tag_categories').select('id, name, slug, level, parent_id'),
    api.rpc('get_category_tree'),
  ]);

  if (tagsResult.error) throw tagsResult.error;

  const data = tagsResult.data || [];
  const catAssignments = catAssignmentsResult.data;
  const allCats = allCatsResult.data;
  const treeData = treeResult.data;

  // Parent name lookup
  const catLookup = new Map<
    string,
    { name: string; slug: string; level: number; parent_id: string | null }
  >();
  if (allCats) {
    for (const c of allCats) {
      catLookup.set(c.id, { name: c.name, slug: c.slug, level: c.level, parent_id: c.parent_id });
    }
  }

  // Build tag_id → categories map
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
    // Sort: primary first
    for (const [, cats] of tagCatsMap) {
      cats.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    }
  }

  // Enrich tags with categories array
  const enrichedTags: CentralizedTag[] = data.map((tag) => ({
    ...tag,
    categories: tagCatsMap.get(tag.id) || [],
  }));

  // Group tags by category name
  const categoryMap = new Map<string, CentralizedTag[]>();
  for (const tag of enrichedTags) {
    const cats =
      tag.categories && tag.categories.length > 0
        ? tag.categories.map((c) => c.name)
        : tag.category
          ? [tag.category]
          : [];

    for (const catName of cats) {
      if (catName && catName !== 'general') {
        if (!categoryMap.has(catName)) categoryMap.set(catName, []);
        categoryMap.get(catName)!.push(tag);
      }
    }
  }

  const tagsByCategory: TagCategory[] = Array.from(categoryMap.entries())
    .map(([category, tags]) => ({
      category,
      tags: tags.sort((a, b) => b.usage_count - a.usage_count),
      count: tags.length,
    }))
    .sort((a, b) => b.count - a.count);

  const categoriesTree = (treeData as unknown as CategoryTreeNode[]) || [];

  return { allTags: enrichedTags, tagsByCategory, categoriesTree };
}

/**
 * Primary hook — uses React Query for caching, deduplication, and stale-while-revalidate.
 * Returns the same shape as the old useState-based hook for backwards compatibility.
 */
export const useCentralizedTags = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['centralized-tags'],
    queryFn: fetchAllTagsWithCategories,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 15 * 60 * 1000, // 15 min
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 5000),
  });

  const allTags = data?.allTags ?? [];
  const tagsByCategory = data?.tagsByCategory ?? [];
  const categoriesTree = data?.categoriesTree ?? [];

  const searchTags = async (query: string, category?: string): Promise<CentralizedTag[]> => {
    try {
      // Sanitize query to prevent PostgREST filter injection —
      // strip characters that have special meaning in PostgREST filter syntax.
      const sanitized = query.replace(/[,%()\\]/g, '');
      if (!sanitized) return [];

      let queryBuilder = api
        .from('unified_tags')
        .select('*')
        .eq('status', 'active')
        .or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);

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

  const getTagsByCategory = (category: string): CentralizedTag[] => {
    return allTags.filter((tag) => {
      if (tag.categories && tag.categories.length > 0) {
        return tag.categories.some((c) => c.name === category);
      }
      return tag.category === category || (!tag.category && category === 'general');
    });
  };

  const getTagsBySubcategory = (categoryId: string): CentralizedTag[] => {
    return allTags.filter((tag) => {
      if (tag.categories && tag.categories.length > 0) {
        return tag.categories.some((c) => c.id === categoryId);
      }
      return false;
    });
  };

  const getParentCategory = (categoryName: string): CategoryTreeNode | null => {
    for (const parent of categoriesTree) {
      if (parent.children.some((c) => c.name === categoryName)) {
        return parent;
      }
    }
    return null;
  };

  const getPopularTags = (limit: number = 10): CentralizedTag[] => {
    return allTags.filter((tag) => tag.usage_count > 0).slice(0, limit);
  };

  const refreshTags = () => {
    queryClient.invalidateQueries({ queryKey: ['centralized-tags'] });
  };

  const createTag = async (tagData: {
    name: string;
    slug: string;
    category?: string | null;
    description?: string | null;
    image_url?: string | null;
  }): Promise<CentralizedTag | null> => {
    try {
      const { data, error } = await api
        .from('unified_tags')
        .insert([
          {
            ...tagData,
            slug: tagData.slug || tagData.name.toLowerCase().replace(/\s+/g, '-'),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      refreshTags();
      return data;
    } catch (err) {
      console.error('Error creating tag:', err);
      throw err;
    }
  };

  const updateTag = async (id: string, updates: Partial<CentralizedTag>): Promise<void> => {
    try {
      const { error } = await api.from('unified_tags').update(updates).eq('id', id);

      if (error) throw error;
      refreshTags();
    } catch (err) {
      console.error('Error updating tag:', err);
      throw err;
    }
  };

  const deleteTag = async (id: string): Promise<void> => {
    try {
      const { error } = await api.from('unified_tags').delete().eq('id', id);

      if (error) throw error;
      refreshTags();
    } catch (err) {
      console.error('Error deleting tag:', err);
      throw err;
    }
  };

  return {
    allTags,
    tagsByCategory,
    categoriesTree,
    loading: isLoading,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : 'Failed to fetch tags'
      : null,
    searchTags,
    getTagsByCategory,
    getTagsBySubcategory,
    getParentCategory,
    getPopularTags,
    createTag,
    updateTag,
    deleteTag,
    refreshTags,
  };
};

/**
 * Efficient usage counts from the DB view — replaces the O(n²) client-side
 * computation that fetched all venues/groups/events and looped over all tags.
 */
export function useTagUsageCounts() {
  return useQuery({
    queryKey: ['tag-usage-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await api
        .from('tag_usage_summary' as any)
        .select('name, usage_count, venue_count, event_count, group_count');

      if (error) {
        console.error('Error fetching tag usage counts:', error);
        // Fallback: use usage_count from unified_tags
        const { data: tags } = await api
          .from('unified_tags')
          .select('name, usage_count')
          .eq('status', 'active');

        const map: Record<string, number> = {};
        for (const row of tags || []) {
          map[row.name] = row.usage_count || 0;
        }
        return map;
      }

      const map: Record<string, number> = {};
      for (const row of (data || []) as any[]) {
        // Sum all entity-type counts for a true cross-content usage count
        const total = (row.venue_count || 0) + (row.event_count || 0) + (row.group_count || 0);
        map[row.name] = total > 0 ? total : row.usage_count || 0;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
