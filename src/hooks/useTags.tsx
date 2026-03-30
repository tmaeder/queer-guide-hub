import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Tag {
  id?: string;
  name: string;
  total_count: number;
  categories?: string[];
  usage_by_category?: { category: string; count: number }[];
  description?: string;
  image_url?: string;
}

export interface TagDetails {
  name: string;
  total_count: number;
  usage_by_category: { category: string; count: number }[];
  related_tags: string[];
  recent_items: any[];
}

export const useTags = () => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsByCategory, setTagsByCategory] = useState<Record<string, Tag[]>>({});
  const [tagDetails, setTagDetails] = useState<TagDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllTags = async () => {
    try {
      setLoading(true);
      
      // First, try to get tags from the centralized tags table
      const { data: centralizedTags, error: centralizedError } = await supabase
        .from("unified_tags")
        .select("*")
        .eq("status", "active")
        .gt("usage_count", 0);

      // Fetch multi-category assignments
      const { data: catAssignments } = await supabase
        .from("tag_category_assignments")
        .select("tag_id, category_id, is_primary, tag_categories(id, name)");

      // Build tag_id -> category names map
      const tagCatsMap = new Map<string, string[]>();
      if (catAssignments) {
        for (const a of catAssignments) {
          const cat = (a as any).tag_categories;
          if (!cat) continue;
          if (!tagCatsMap.has(a.tag_id)) tagCatsMap.set(a.tag_id, []);
          tagCatsMap.get(a.tag_id)!.push(cat.name);
        }
      }

      if (!centralizedError && centralizedTags && centralizedTags.length > 0) {
        // Use centralized tags if available
        const allTagsArray: Tag[] = centralizedTags.map(tag => ({
          id: tag.id,
          name: tag.name,
          total_count: tag.usage_count,
          categories: tagCatsMap.get(tag.id) || (tag.category ? [tag.category] : []),
          description: tag.description,
          image_url: tag.image_url
        }));

        setAllTags(allTagsArray);

        // Group by category (multi-category: tag appears in each assigned category)
        const categorized: Record<string, Tag[]> = {};
        allTagsArray.forEach(tag => {
          const cats = tag.categories && tag.categories.length > 0 ? tag.categories : ['Uncategorized'];
          for (const cat of cats) {
            if (!categorized[cat]) {
              categorized[cat] = [];
            }
            categorized[cat].push(tag);
          }
        });

        setTagsByCategory(categorized);
        setLoading(false);
        return;
      }

      // Fallback to legacy tag aggregation if no centralized tags
      const [eventsResult, venuesResult, marketplaceResult] = await Promise.all([
        supabase
          .from("events")
          .select("tags")
          .not("tags", "is", null),
        supabase
          .from("venues")
          .select("tags")
          .not("tags", "is", null),
        supabase
          .from("marketplace_listings")
          .select("tags")
          .not("tags", "is", null)
      ]);

      // Process and aggregate tags
      const tagCounts: Record<string, { total: number; categories: Set<string>; usage: Record<string, number> }> = {};

      // Helper function to process tags from a result
      const processTags = (result: any, category: string) => {
        if (result.data) {
          result.data.forEach((item: any) => {
            if (item.tags && Array.isArray(item.tags)) {
              item.tags.forEach((tag: string) => {
                if (!tagCounts[tag]) {
                  tagCounts[tag] = { total: 0, categories: new Set(), usage: {} };
                }
                tagCounts[tag].total += 1;
                tagCounts[tag].categories.add(category);
                tagCounts[tag].usage[category] = (tagCounts[tag].usage[category] || 0) + 1;
              });
            }
          });
        }
      };

      processTags(eventsResult, "events");
      processTags(venuesResult, "venues");
      processTags(marketplaceResult, "marketplace");

      // Convert to array format
      const allTagsArray: Tag[] = Object.entries(tagCounts)
        .map(([name, data]) => ({
          name,
          total_count: data.total,
          categories: Array.from(data.categories),
          usage_by_category: Object.entries(data.usage).map(([category, count]) => ({
            category,
            count
          }))
        }))
        .sort((a, b) => b.total_count - a.total_count);

      setAllTags(allTagsArray);

      // Group by category
      const categorized: Record<string, Tag[]> = {};
      allTagsArray.forEach(tag => {
        tag.categories?.forEach(category => {
          if (!categorized[category]) {
            categorized[category] = [];
          }
          categorized[category].push(tag);
        });
      });

      // Sort each category by usage count
      Object.keys(categorized).forEach(category => {
        categorized[category].sort((a, b) => {
          const aCount = a.usage_by_category?.find(u => u.category === category)?.count || 0;
          const bCount = b.usage_by_category?.find(u => u.category === category)?.count || 0;
          return bCount - aCount;
        });
      });

      setTagsByCategory(categorized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const searchTags = async (query: string): Promise<Tag[]> => {
    const lowercaseQuery = query.toLowerCase();
    return allTags.filter(tag => 
      tag.name.toLowerCase().includes(lowercaseQuery)
    );
  };

  const getTagDetails = async (tagName: string) => {
    try {
      setLoading(true);

      // Use unified tag system for detailed information
      const [assignments] = await Promise.all([
        supabase
          .from("unified_tag_assignments")
          .select(`
            entity_id,
            entity_type,
            created_at,
            unified_tags (name)
          `)
          .eq('unified_tags.name', tagName)
          .order("created_at", { ascending: false })
          .limit(10)
      ]);

      // Calculate usage by category from unified assignments
      const entityTypeCounts: Record<string, number> = {};
      assignments.data?.forEach(assignment => {
        entityTypeCounts[assignment.entity_type] = (entityTypeCounts[assignment.entity_type] || 0) + 1;
      });

      const usage_by_category = Object.entries(entityTypeCounts).map(([category, count]) => ({
        category,
        count
      })).filter(item => item.count > 0);

      // For recent items, we'll need to fetch the actual entities
      const recent_items: any[] = [];
      // This would require separate queries for each entity type based on assignments

      const details: TagDetails = {
        name: tagName,
        total_count: usage_by_category.reduce((sum, item) => sum + item.count, 0),
        usage_by_category,
        related_tags: [], // Will implement later with unified system
        recent_items
      };

      setTagDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllTags();
  }, []);

  return {
    allTags,
    tagsByCategory,
    tagDetails,
    loading,
    error,
    searchTags,
    getTagDetails,
    refreshTags: fetchAllTags
  };
};