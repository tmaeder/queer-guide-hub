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
      
      // Fetch content without author join to avoid foreign key issues
      let query = supabase
        .from("content")
        .select("*");

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

      // Fetch author information separately if needed
      let enhancedContent = contentData || [];
      if (contentData && contentData.length > 0) {
        const authorIds = contentData
          .map(item => item.author_id)
          .filter(Boolean);
        
        if (authorIds.length > 0) {
          const { data: authors } = await supabase
            .from("profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", authorIds);

          enhancedContent = contentData.map(item => ({
            ...item,
            author: authors?.find(author => author.user_id === item.author_id)
          }));
        }
      }

      const contentIds = contentData?.map(item => item.id) || [];
      
      let categoryAssignments: any[] = [];
      let tagAssignments: any[] = [];

      if (contentIds.length > 0) {
        // Fetch categories for these content items
        const { data: categoryData } = await supabase
          .from("content_category_assignments")
          .select(`
            content_id,
            content_categories (*)
          `)
          .in("content_id", contentIds);

        // Fetch tags for these content items  
        const { data: tagData } = await supabase
          .from("content_tag_assignments")
          .select(`
            content_id,
            tags (*)
          `)
          .in("content_id", contentIds);

        categoryAssignments = categoryData || [];
        tagAssignments = tagData || [];
      }

      // Process content with separated data fetching
      const processedContent = enhancedContent.map(item => ({
        ...item,
        categories: categoryAssignments
          .filter(assignment => assignment.content_id === item.id)
          .map(assignment => assignment.content_categories),
        tags: tagAssignments
          .filter(assignment => assignment.content_id === item.id)
          .map(assignment => assignment.tags)
      }));

      setContent(processedContent);
      return processedContent;
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
      // Fetch content without problematic joins
      const { data: contentData, error: contentError } = await supabase
        .from("content")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();

      if (contentError) throw contentError;
      if (!contentData) return null;

      // Fetch author separately
      let author = null;
      if (contentData.author_id) {
        const { data: authorData } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .eq("user_id", contentData.author_id)
          .single();
        author = authorData;
      }

      // Fetch categories and tags separately  
      const [categoriesResponse, tagsResponse] = await Promise.all([
        supabase
          .from("content_category_assignments")
          .select("content_categories (*)")
          .eq("content_id", contentData.id),
        supabase
          .from("content_tag_assignments") 
          .select("tags (*)")
          .eq("content_id", contentData.id)
      ]);

      return {
        ...contentData,
        author,
        categories: categoriesResponse.data?.map(item => item.content_categories) || [],
        tags: tagsResponse.data?.map(item => item.tags) || []
      };
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
      // Search without problematic joins
      const { data: searchData, error } = await supabase
        .from("content")
        .select("*")
        .eq("status", "published")
        .or(`title.ilike.%${query}%, content.ilike.%${query}%, excerpt.ilike.%${query}%`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enhance with author data
      const authorIds = searchData
        .map(item => item.author_id)
        .filter(Boolean);
      
      let authors = [];
      if (authorIds.length > 0) {
        const { data: authorData } = await supabase
          .from("profiles") 
          .select("user_id, display_name, avatar_url")
          .in("user_id", authorIds);
        authors = authorData || [];
      }

      // Fetch categories and tags for search results
      const [categoriesResponse, tagsResponse] = await Promise.all([
        supabase
          .from("content_category_assignments")
          .select("content_id, content_categories (*)")
          .in("content_id", searchData.map(item => item.id)),
        supabase
          .from("content_tag_assignments")
          .select("content_id, tags (*)")
          .in("content_id", searchData.map(item => item.id))
      ]);

      return searchData.map(item => ({
        ...item,
        author: authors.find(author => author.user_id === item.author_id),
        categories: categoriesResponse.data
          ?.filter(assignment => assignment.content_id === item.id)
          .map(assignment => assignment.content_categories) || [],
        tags: tagsResponse.data
          ?.filter(assignment => assignment.content_id === item.id)
          .map(assignment => assignment.tags) || []
      }));
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