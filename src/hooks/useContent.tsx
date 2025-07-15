import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Content = Tables<"content"> & {
  categories?: Tables<"content_categories">[];
  tags?: Tables<"tags">[]; // Use centralized tags
  author?: Tables<"profiles">;
};

export type ContentCategory = Tables<"content_categories">;
export type ContentTag = Tables<"tags">; // Use centralized tags
export type ContentType = "blog_post" | "page" | "legal_document" | "press_release" | "about_content";
export type ContentStatus = "draft" | "published" | "archived";

export const useContent = () => {
  const [content, setContent] = useState<Content[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [tags, setTags] = useState<ContentTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = async (filters?: {
    type?: ContentType;
    status?: ContentStatus;
    category?: string;
    tag?: string;
    limit?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);
      
      // Optimize query with proper indexing and fewer joins
      let query = supabase
        .from("content")
        .select(`
          *,
          profiles:author_id (display_name, avatar_url)
        `);

      if (filters?.type) {
        query = query.eq("content_type", filters.type);
      }

      if (filters?.status !== undefined) {
        query = query.eq("status", filters.status);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      query = query.order("created_at", { ascending: false });

      const { data: contentData, error: contentError } = await query;

      if (contentError) throw contentError;

      // Fetch categories and tags separately to avoid complex joins
      const contentIds = contentData?.map(item => item.id) || [];
      
      let categoriesData: any[] = [];
      let tagsData: any[] = [];

      if (contentIds.length > 0) {
        // Fetch categories for these content items
        const { data: categoryAssignments } = await supabase
          .from("content_category_assignments")
          .select(`
            content_id,
            content_categories (*)
          `)
          .in("content_id", contentIds);

        // Fetch tags for these content items  
        const { data: tagAssignments } = await supabase
          .from("content_tag_assignments")
          .select(`
            content_id,
            tags (*)
          `)
          .in("content_id", contentIds);

        categoriesData = categoryAssignments || [];
        tagsData = tagAssignments || [];
      }

      // Transform the data to flatten relationships efficiently
      const transformedData = contentData?.map((item: any) => {
        const itemCategories = categoriesData
          .filter(ca => ca.content_id === item.id)
          .map(ca => ca.content_categories);
        
        const itemTags = tagsData
          .filter(ta => ta.content_id === item.id)
          .map(ta => ta.tags);

        return {
          ...item,
          categories: itemCategories,
          tags: itemTags,
          author: item.profiles
        };
      }) || [];

      setContent(transformedData);
      return transformedData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch content";
      setError(errorMessage);
      console.error("Content fetch error:", err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchContentBySlug = async (slug: string) => {
    try {
      const { data, error } = await supabase
        .from("content")
        .select(`
          *,
          profiles:author_id (display_name, avatar_url),
          content_category_assignments (
            content_categories (*)
          ),
          content_tag_assignments (
            tags (*)
          )
        `)
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (error) throw error;

      if (data) {
        return {
          ...data,
          categories: data.content_category_assignments?.map((ca: any) => ca.content_categories) || [],
          tags: data.content_tag_assignments?.map((ta: any) => ta.tags) || [],
          author: data.profiles
        };
      }

      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Content not found");
      return null;
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("content_categories")
        .select("*")
        .order("name");

      if (error) throw error;
      setCategories(data || []);
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    }
  };

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setTags(data || []);
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    }
  };

  const createContent = async (contentData: {
    title: string;
    slug: string;
    content_type: ContentType;
    content: string;
    excerpt?: string;
    meta_description?: string;
    meta_keywords?: string[];
    featured_image?: string;
    status?: ContentStatus;
    categoryIds?: string[];
    tagIds?: string[];
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: contentRecord, error: contentError } = await supabase
        .from("content")
        .insert({
          title: contentData.title,
          slug: contentData.slug,
          content_type: contentData.content_type,
          content: contentData.content,
          excerpt: contentData.excerpt,
          meta_description: contentData.meta_description,
          meta_keywords: contentData.meta_keywords,
          featured_image: contentData.featured_image,
          status: contentData.status || "draft",
          author_id: user.id,
          published_at: contentData.status === "published" ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (contentError) throw contentError;

      // Add category assignments
      if (contentData.categoryIds && contentData.categoryIds.length > 0) {
        const categoryAssignments = contentData.categoryIds.map(categoryId => ({
          content_id: contentRecord.id,
          category_id: categoryId
        }));

        await supabase
          .from("content_category_assignments")
          .insert(categoryAssignments);
      }

      // Add tag assignments
      if (contentData.tagIds && contentData.tagIds.length > 0) {
        const tagAssignments = contentData.tagIds.map(tagId => ({
          content_id: contentRecord.id,
          tag_id: tagId
        }));

        await supabase
          .from("content_tag_assignments")
          .insert(tagAssignments);
      }

      await fetchContent();
      return contentRecord;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      throw err;
    }
  };

  const updateContent = async (id: string, updates: Partial<Content>) => {
    try {
      const { data, error } = await supabase
        .from("content")
        .update({
          ...updates,
          published_at: updates.status === "published" && !updates.published_at 
            ? new Date().toISOString() 
            : updates.published_at
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      await fetchContent();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      throw err;
    }
  };

  const deleteContent = async (id: string) => {
    try {
      const { error } = await supabase
        .from("content")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      throw err;
    }
  };

  const searchContent = async (query: string) => {
    try {
      const { data, error } = await supabase
        .from("content")
        .select(`
          *,
          profiles:author_id (display_name, avatar_url),
          content_category_assignments (
            content_categories (*)
          ),
          content_tag_assignments (
            tags (*)
          )
        `)
        .eq("status", "published")
        .or(`title.ilike.%${query}%, content.ilike.%${query}%, excerpt.ilike.%${query}%`)
        .order("published_at", { ascending: false });

      if (error) throw error;

      const transformedData = data?.map((item: any) => ({
        ...item,
        categories: item.content_category_assignments?.map((ca: any) => ca.content_categories) || [],
        tags: item.content_tag_assignments?.map((ta: any) => ta.tags) || [],
        author: item.profiles
      })) || [];

      return transformedData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    }
  };

  useEffect(() => {
    // Use Promise.all to fetch data in parallel for better performance
    const fetchInitialData = async () => {
      try {
        await Promise.all([
          fetchContent(),
          fetchCategories(),
          fetchTags()
        ]);
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    fetchInitialData();
  }, []);

  return {
    content,
    categories,
    tags,
    loading,
    error,
    fetchContent,
    fetchContentBySlug,
    fetchCategories,
    fetchTags,
    createContent,
    updateContent,
    deleteContent,
    searchContent
  };
};