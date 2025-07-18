import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Content = Tables<"content"> & {
  categories?: Tables<"content_categories">[];
  tags?: Tables<"content_tags">[];
  author?: Tables<"profiles">;
};

export type ContentCategory = Tables<"content_categories">;
export type ContentTag = Tables<"content_tags">;
export type ContentType = "blog_post" | "page" | "legal_document" | "press_release" | "about_content";
export type ContentStatus = "draft" | "published" | "archived";

export const useContentManager = () => {
  const [content, setContent] = useState<Content[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [tags, setTags] = useState<ContentTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async (filters?: {
    type?: ContentType;
    status?: ContentStatus;
    limit?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);

      // Simple query without complex joins
      let query = supabase
        .from("content")
        .select("*");

      if (filters?.type) {
        query = query.eq("content_type", filters.type);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      query = query.order("created_at", { ascending: false });

      const { data: contentData, error: contentError } = await query;

      if (contentError) {
        console.error("Content fetch error:", contentError);
        throw contentError;
      }

      // Fetch related data separately to avoid complex joins
      const enhancedContent = await Promise.all(
        (contentData || []).map(async (item) => {
          // Fetch author
          let author = null;
          if (item.author_id) {
            const { data: authorData } = await supabase
              .from("profiles")
              .select("user_id, display_name, avatar_url")
              .eq("user_id", item.author_id)
              .single();
            author = authorData;
          }

          // Fetch categories
          const { data: categoryData } = await supabase
            .from("content_category_assignments")
            .select(`
              content_categories (*)
            `)
            .eq("content_id", item.id);

          // Fetch tags
          const { data: tagData } = await supabase
            .from("content_tag_assignments")
            .select(`
              content_tags (*)
            `)
            .eq("content_id", item.id);

          return {
            ...item,
            author,
            categories: categoryData?.map(cat => cat.content_categories).filter(Boolean) || [],
            tags: tagData?.map(tag => tag.content_tags).filter(Boolean) || []
          };
        })
      );

      setContent(enhancedContent);
      return enhancedContent;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch content";
      setError(errorMessage);
      console.error("Content fetch error:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("content_categories")
        .select("*")
        .order("name");

      if (error) throw error;
      setCategories(data || []);
      return data || [];
    } catch (err) {
      console.error("Categories fetch error:", err);
      return [];
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("content_tags")
        .select("*")
        .order("name");

      if (error) throw error;
      setTags(data || []);
      return data || [];
    } catch (err) {
      console.error("Tags fetch error:", err);
      return [];
    }
  }, []);

  const createContent = useCallback(async (contentData: {
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

      // Check for duplicate slug
      const { data: existingContent } = await supabase
        .from("content")
        .select("id")
        .eq("slug", contentData.slug)
        .single();
        
      if (existingContent) {
        throw new Error("A content item with this slug already exists");
      }

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
      throw err;
    }
  }, [fetchContent]);

  const updateContent = useCallback(async (id: string, updates: Partial<Content>) => {
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
      throw err;
    }
  }, [fetchContent]);

  const deleteContent = useCallback(async (id: string) => {
    try {
      // Delete related assignments first
      await supabase.from("content_category_assignments").delete().eq("content_id", id);
      await supabase.from("content_tag_assignments").delete().eq("content_id", id);
      
      // Delete content
      const { error } = await supabase
        .from("content")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await fetchContent();
    } catch (err) {
      throw err;
    }
  }, [fetchContent]);

  const createCategory = useCallback(async (categoryData: {
    name: string;
    slug: string;
    description?: string;
    color?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from("content_categories")
        .insert(categoryData)
        .select()
        .single();

      if (error) throw error;

      await fetchCategories();
      return data;
    } catch (err) {
      throw err;
    }
  }, [fetchCategories]);

  const createTag = useCallback(async (tagData: {
    name: string;
    slug: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from("content_tags")
        .insert(tagData)
        .select()
        .single();

      if (error) throw error;

      await fetchTags();
      return data;
    } catch (err) {
      throw err;
    }
  }, [fetchTags]);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([
        fetchContent(),
        fetchCategories(),
        fetchTags()
      ]);
      setLoading(false);
    };

    loadInitialData();
  }, []);

  return {
    content,
    categories,
    tags,
    loading,
    error,
    fetchContent,
    createContent,
    updateContent,
    deleteContent,
    createCategory,
    createTag,
    refresh: () => Promise.all([fetchContent(), fetchCategories(), fetchTags()])
  };
};