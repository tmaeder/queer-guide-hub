import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type UnifiedTag = Tables<"tags">;

export interface TagAssignment {
  id: string;
  tag: UnifiedTag;
  created_at: string;
}

export interface TagUsage {
  total_count: number;
  events: number;
  venues: number;
  marketplace: number;
  posts: number;
  groups: number;
  news: number;
  content: number;
}

export const useUnifiedTags = () => {
  const [allTags, setAllTags] = useState<UnifiedTag[]>([]);
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

      if (fetchError) throw fetchError;

      setAllTags(data || []);
    } catch (err) {
      console.error("Error fetching unified tags:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch tags");
    } finally {
      setLoading(false);
    }
  };

  const searchTags = async (query: string, category?: string): Promise<UnifiedTag[]> => {
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

  const getTagsByCategory = (category: string): UnifiedTag[] => {
    return allTags.filter(tag => tag.category === category);
  };

  const getPopularTags = (limit: number = 10): UnifiedTag[] => {
    return allTags
      .filter(tag => tag.usage_count > 0)
      .slice(0, limit);
  };

  const createTag = async (tagData: {
    name: string;
    category: string;
    description?: string;
    color?: string;
  }): Promise<UnifiedTag | null> => {
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert([tagData])
        .select()
        .single();

      if (error) throw error;

      await fetchTags();
      return data;
    } catch (err) {
      console.error("Error creating tag:", err);
      throw err;
    }
  };

  const updateTag = async (id: string, updates: Partial<UnifiedTag>): Promise<void> => {
    try {
      const { error } = await supabase
        .from("tags")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

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

      await fetchTags();
    } catch (err) {
      console.error("Error deleting tag:", err);
      throw err;
    }
  };

  // Tag assignment functions for different entity types
  const assignTagsToEvent = async (eventId: string, tagIds: string[]): Promise<void> => {
    try {
      // Remove existing assignments
      await supabase
        .from("event_tag_assignments")
        .delete()
        .eq("event_id", eventId);

      // Add new assignments
      if (tagIds.length > 0) {
        const assignments = tagIds.map(tagId => ({
          event_id: eventId,
          tag_id: tagId
        }));

        const { error } = await supabase
          .from("event_tag_assignments")
          .insert(assignments);

        if (error) throw error;
      }

      await updateTagUsageCounts();
    } catch (err) {
      console.error("Error assigning tags to event:", err);
      throw err;
    }
  };

  const assignTagsToVenue = async (venueId: string, tagIds: string[]): Promise<void> => {
    try {
      await supabase
        .from("venue_tag_assignments")
        .delete()
        .eq("venue_id", venueId);

      if (tagIds.length > 0) {
        const assignments = tagIds.map(tagId => ({
          venue_id: venueId,
          tag_id: tagId
        }));

        const { error } = await supabase
          .from("venue_tag_assignments")
          .insert(assignments);

        if (error) throw error;
      }

      await updateTagUsageCounts();
    } catch (err) {
      console.error("Error assigning tags to venue:", err);
      throw err;
    }
  };

  const assignTagsToMarketplaceListing = async (listingId: string, tagIds: string[]): Promise<void> => {
    try {
      await supabase
        .from("marketplace_tag_assignments")
        .delete()
        .eq("listing_id", listingId);

      if (tagIds.length > 0) {
        const assignments = tagIds.map(tagId => ({
          listing_id: listingId,
          tag_id: tagId
        }));

        const { error } = await supabase
          .from("marketplace_tag_assignments")
          .insert(assignments);

        if (error) throw error;
      }

      await updateTagUsageCounts();
    } catch (err) {
      console.error("Error assigning tags to marketplace listing:", err);
      throw err;
    }
  };

  const assignTagsToPost = async (postId: string, tagIds: string[]): Promise<void> => {
    try {
      await supabase
        .from("post_tag_assignments")
        .delete()
        .eq("post_id", postId);

      if (tagIds.length > 0) {
        const assignments = tagIds.map(tagId => ({
          post_id: postId,
          tag_id: tagId
        }));

        const { error } = await supabase
          .from("post_tag_assignments")
          .insert(assignments);

        if (error) throw error;
      }

      await updateTagUsageCounts();
    } catch (err) {
      console.error("Error assigning tags to post:", err);
      throw err;
    }
  };

  const assignTagsToGroup = async (groupId: string, tagIds: string[]): Promise<void> => {
    try {
      await supabase
        .from("group_tag_assignments")
        .delete()
        .eq("group_id", groupId);

      if (tagIds.length > 0) {
        const assignments = tagIds.map(tagId => ({
          group_id: groupId,
          tag_id: tagId
        }));

        const { error } = await supabase
          .from("group_tag_assignments")
          .insert(assignments);

        if (error) throw error;
      }

      await updateTagUsageCounts();
    } catch (err) {
      console.error("Error assigning tags to group:", err);
      throw err;
    }
  };

  const assignTagsToNewsArticle = async (articleId: string, tagIds: string[]): Promise<void> => {
    try {
      await supabase
        .from("news_tag_assignments")
        .delete()
        .eq("article_id", articleId);

      if (tagIds.length > 0) {
        const assignments = tagIds.map(tagId => ({
          article_id: articleId,
          tag_id: tagId
        }));

        const { error } = await supabase
          .from("news_tag_assignments")
          .insert(assignments);

        if (error) throw error;
      }

      await updateTagUsageCounts();
    } catch (err) {
      console.error("Error assigning tags to news article:", err);
      throw err;
    }
  };

  // Get tags for different entity types
  const getTagsForEvent = async (eventId: string): Promise<TagAssignment[]> => {
    const { data, error } = await supabase
      .from("event_tag_assignments")
      .select(`
        id,
        created_at,
        tags (*)
      `)
      .eq("event_id", eventId);

    if (error) throw error;
    return data?.map(item => ({ ...item, tag: item.tags })) || [];
  };

  const getTagsForVenue = async (venueId: string): Promise<TagAssignment[]> => {
    const { data, error } = await supabase
      .from("venue_tag_assignments")
      .select(`
        id,
        created_at,
        tags (*)
      `)
      .eq("venue_id", venueId);

    if (error) throw error;
    return data?.map(item => ({ ...item, tag: item.tags })) || [];
  };

  const updateTagUsageCounts = async (): Promise<void> => {
    try {
      // For now, just refresh tags - usage counts are updated by the database trigger
      await fetchTags();
    } catch (err) {
      console.error("Error updating tag usage counts:", err);
    }
  };

  const getTagUsage = async (tagId: string): Promise<TagUsage> => {
    try {
      const [
        eventCount,
        venueCount,
        marketplaceCount,
        postCount,
        groupCount,
        newsCount,
        contentCount
      ] = await Promise.all([
        supabase.from("event_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId),
        supabase.from("venue_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId),
        supabase.from("marketplace_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId),
        supabase.from("post_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId),
        supabase.from("group_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId),
        supabase.from("news_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId),
        supabase.from("content_tag_assignments").select("id", { count: "exact" }).eq("tag_id", tagId)
      ]);

      const events = eventCount.count || 0;
      const venues = venueCount.count || 0;
      const marketplace = marketplaceCount.count || 0;
      const posts = postCount.count || 0;
      const groups = groupCount.count || 0;
      const news = newsCount.count || 0;
      const content = contentCount.count || 0;

      return {
        total_count: events + venues + marketplace + posts + groups + news + content,
        events,
        venues,
        marketplace,
        posts,
        groups,
        news,
        content
      };
    } catch (err) {
      console.error("Error getting tag usage:", err);
      return {
        total_count: 0,
        events: 0,
        venues: 0,
        marketplace: 0,
        posts: 0,
        groups: 0,
        news: 0,
        content: 0
      };
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  return {
    allTags,
    loading,
    error,
    searchTags,
    getTagsByCategory,
    getPopularTags,
    createTag,
    updateTag,
    deleteTag,
    assignTagsToEvent,
    assignTagsToVenue,
    assignTagsToMarketplaceListing,
    assignTagsToPost,
    assignTagsToGroup,
    assignTagsToNewsArticle,
    getTagsForEvent,
    getTagsForVenue,
    updateTagUsageCounts,
    getTagUsage,
    refreshTags: fetchTags
  };
};