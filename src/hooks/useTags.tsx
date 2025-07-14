import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Tag {
  name: string;
  total_count: number;
  categories?: string[];
  usage_by_category?: { category: string; count: number }[];
  description?: string;
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
        .from("tags")
        .select("*")
        .eq("is_active", true);

      if (!centralizedError && centralizedTags && centralizedTags.length > 0) {
        // Use centralized tags if available
        const allTagsArray: Tag[] = centralizedTags.map(tag => ({
          name: tag.name,
          total_count: tag.usage_count,
          categories: [tag.category],
          description: tag.description
        }));

        setAllTags(allTagsArray);

        // Group by category
        const categorized: Record<string, Tag[]> = {};
        centralizedTags.forEach(tag => {
          if (!categorized[tag.category]) {
            categorized[tag.category] = [];
          }
          categorized[tag.category].push({
            name: tag.name,
            total_count: tag.usage_count,
            categories: [tag.category],
            description: tag.description
          });
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

      // Fetch detailed information about a specific tag
      const [eventsResult, venuesResult, marketplaceResult] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, tags, created_at")
          .contains("tags", [tagName])
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("venues")
          .select("id, name, tags, created_at")
          .contains("tags", [tagName])
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("marketplace_listings")
          .select("id, title, tags, created_at")
          .contains("tags", [tagName])
          .order("created_at", { ascending: false })
          .limit(5)
      ]);

      // Calculate usage by category
      const usage_by_category = [
        { category: "events", count: eventsResult.data?.length || 0 },
        { category: "venues", count: venuesResult.data?.length || 0 },
        { category: "marketplace", count: marketplaceResult.data?.length || 0 }
      ].filter(item => item.count > 0);

      // Find related tags (tags that appear together with this tag)
      const relatedTagsSet = new Set<string>();
      [eventsResult, venuesResult, marketplaceResult].forEach(result => {
        if (result.data) {
          result.data.forEach((item: any) => {
            if (item.tags && Array.isArray(item.tags)) {
              item.tags.forEach((tag: string) => {
                if (tag !== tagName) {
                  relatedTagsSet.add(tag);
                }
              });
            }
          });
        }
      });

      const recent_items = [
        ...(eventsResult.data?.map(item => ({ ...item, type: "event" })) || []),
        ...(venuesResult.data?.map(item => ({ ...item, type: "venue" })) || []),
        ...(marketplaceResult.data?.map(item => ({ ...item, type: "marketplace" })) || [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, 10);

      const details: TagDetails = {
        name: tagName,
        total_count: usage_by_category.reduce((sum, item) => sum + item.count, 0),
        usage_by_category,
        related_tags: Array.from(relatedTagsSet).slice(0, 10),
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