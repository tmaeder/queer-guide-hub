import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Content = Tables<"content"> & {
  categories?: Tables<"content_categories">[];
  tags?: Tables<"content_tags">[]; // Use content_tags table
  author?: Tables<"profiles">;
};

export type ContentCategory = Tables<"content_categories">;
export type ContentTag = Tables<"content_tags">; // Use content_tags table
export type ContentType = "blog_post" | "page" | "legal_document" | "press_release" | "about_content";
export type ContentStatus = "draft" | "published" | "archived";

export const useContent = () => {
  const [content, setContent] = useState<Content[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [tags, setTags] = useState<ContentTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [authValidated, setAuthValidated] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const MAX_RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 1000;

  // Validate user authentication and permissions
  const validateAuth = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (!user) {
        setError("Authentication required");
        setAuthValidated(false);
        return false;
      }
      
      setAuthValidated(true);
      setError(null);
      return true;
    } catch (err) {
      console.error("Auth validation failed:", err);
      setError("Authentication failed");
      setAuthValidated(false);
      return false;
    }
  }, []);

  // Enhanced retry mechanism with exponential backoff
  const retryWithBackoff = useCallback(async (
    operation: () => Promise<any>,
    attempt: number = 0
  ): Promise<any> => {
    try {
      return await operation();
    } catch (err) {
      // Don't retry on schema errors or auth errors
      if (err instanceof Error) {
        if (err.message.includes("Could not find a relationship") || 
            err.message.includes("PGRST200") ||
            err.message.includes("Authentication") ||
            err.message.includes("permission")) {
          throw err; // Don't retry these errors
        }
      }
      
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.log(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        
        return new Promise((resolve, reject) => {
          retryTimeoutRef.current = setTimeout(async () => {
            try {
              const result = await retryWithBackoff(operation, attempt + 1);
              resolve(result);
            } catch (retryErr) {
              reject(retryErr);
            }
          }, delay);
        });
      }
      throw err;
    }
  }, []);

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
      
      // Validate authentication first
      const isAuthenticated = await validateAuth();
      if (!isAuthenticated) {
        return [];
      }

      // Only cancel if there's a new request and the old one is still pending
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Enhanced content fetching with retry mechanism
      const fetchOperation = async () => {
        let query = supabase
          .from("content")
          .select("*")
          .abortSignal(signal);

        // Input validation and sanitization
        if (filters?.type && !["blog_post", "page", "legal_document", "press_release", "about_content"].includes(filters.type)) {
          throw new Error("Invalid content type");
        }
        
        if (filters?.status && !["draft", "published", "archived"].includes(filters.status)) {
          throw new Error("Invalid status");
        }
        
        if (filters?.limit && (filters.limit < 1 || filters.limit > 100)) {
          throw new Error("Invalid limit: must be between 1 and 100");
        }

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
        if (signal.aborted) throw new Error("Request cancelled");

        return contentData || [];
      };

      // Execute with retry mechanism
      const contentData = await retryWithBackoff(fetchOperation);
      
      // Fetch author information separately if needed
      let enhancedContent = contentData;
      if (contentData && contentData.length > 0) {
        const authorIds = contentData
          .map(item => item.author_id)
          .filter(Boolean);
        
        if (authorIds.length > 0) {
          const authorOperation = async () => {
            const { data: authors, error: authorError } = await supabase
              .from("profiles")
              .select("user_id, display_name, avatar_url")
              .in("user_id", authorIds)
              .abortSignal(signal);
              
            if (authorError) throw authorError;
            return authors;
          };

          const authors = await retryWithBackoff(authorOperation);
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
        // Fetch categories and tags with retry mechanism
        const categoryOperation = async () => {
          const { data: categoryData, error: categoryError } = await supabase
            .from("content_category_assignments")
            .select(`
              content_id,
              content_categories (*)
            `)
            .in("content_id", contentIds)
            .abortSignal(signal);
            
          if (categoryError) throw categoryError;
          return categoryData || [];
        };

        const tagOperation = async () => {
          const { data: tagData, error: tagError } = await supabase
            .from("content_tag_assignments")
            .select(`
              content_id,
              content_tags (*)
            `)
            .in("content_id", contentIds)
            .abortSignal(signal);
            
          if (tagError) throw tagError;
          return tagData || [];
        };

        const [categoryData, tagData] = await Promise.all([
          retryWithBackoff(categoryOperation),
          retryWithBackoff(tagOperation)
        ]);

        categoryAssignments = categoryData;
        tagAssignments = tagData;
      }

      // Process content with separated data fetching
      const processedContent = enhancedContent.map(item => ({
        ...item,
        categories: categoryAssignments
          .filter(assignment => assignment.content_id === item.id)
          .map(assignment => assignment.content_categories),
        tags: tagAssignments
          .filter(assignment => assignment.content_id === item.id)
          .map(assignment => assignment.content_tags)
      }));

      setContent(processedContent);
      setRetryCount(0); // Reset retry count on success
      return processedContent;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log("Request was cancelled");
        return [];
      }
      
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch content";
      setError(errorMessage);
      console.error("Content fetch error:", err);
      setRetryCount(prev => prev + 1);
      return [];
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
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
          .select("content_tags (*)")
          .eq("content_id", contentData.id)
      ]);

      return {
        ...contentData,
        author,
        categories: categoriesResponse.data?.map(item => item.content_categories) || [],
        tags: tagsResponse.data?.map(item => item.content_tags) || []
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
        .from("content_tags")
        .select("*")
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
      // Enhanced validation and authentication
      const isAuthenticated = await validateAuth();
      if (!isAuthenticated) {
        throw new Error("Authentication required");
      }

      // Input validation and sanitization
      if (!contentData.title?.trim()) {
        throw new Error("Title is required");
      }
      
      if (!contentData.slug?.trim()) {
        throw new Error("Slug is required");
      }
      
      if (!contentData.content?.trim()) {
        throw new Error("Content is required");
      }
      
      // Validate slug format
      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugRegex.test(contentData.slug)) {
        throw new Error("Slug must contain only lowercase letters, numbers, and hyphens");
      }
      
      // Sanitize inputs
      const sanitizedData = {
        title: contentData.title.trim().substring(0, 255),
        slug: contentData.slug.trim().toLowerCase(),
        content_type: contentData.content_type,
        content: contentData.content.trim(),
        excerpt: contentData.excerpt?.trim().substring(0, 500),
        meta_description: contentData.meta_description?.trim().substring(0, 160),
        meta_keywords: contentData.meta_keywords?.slice(0, 10), // Limit to 10 keywords
        featured_image: contentData.featured_image?.trim(),
        status: contentData.status || "draft",
        categoryIds: contentData.categoryIds?.slice(0, 5), // Limit categories
        tagIds: contentData.tagIds?.slice(0, 10) // Limit tags
      };

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Check for duplicate slug
      const { data: existingContent } = await supabase
        .from("content")
        .select("id")
        .eq("slug", sanitizedData.slug)
        .single();
        
      if (existingContent) {
        throw new Error("A content item with this slug already exists");
      }

      const { data: contentRecord, error: contentError } = await supabase
        .from("content")
        .insert({
          title: sanitizedData.title,
          slug: sanitizedData.slug,
          content_type: sanitizedData.content_type,
          content: sanitizedData.content,
          excerpt: sanitizedData.excerpt,
          meta_description: sanitizedData.meta_description,
          meta_keywords: sanitizedData.meta_keywords,
          featured_image: sanitizedData.featured_image,
          status: sanitizedData.status,
          author_id: user.id,
          published_at: sanitizedData.status === "published" ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (contentError) throw contentError;

      // Add category assignments with validation
      if (sanitizedData.categoryIds && sanitizedData.categoryIds.length > 0) {
        // Validate category IDs exist
        const { data: validCategories } = await supabase
          .from("content_categories")
          .select("id")
          .in("id", sanitizedData.categoryIds);
        
        const validCategoryIds = validCategories?.map(c => c.id) || [];
        if (validCategoryIds.length > 0) {
          const categoryAssignments = validCategoryIds.map(categoryId => ({
            content_id: contentRecord.id,
            category_id: categoryId
          }));

          await supabase
            .from("content_category_assignments")
            .insert(categoryAssignments);
        }
      }

      // Add tag assignments with validation
      if (sanitizedData.tagIds && sanitizedData.tagIds.length > 0) {
        // Validate tag IDs exist
        const { data: validTags } = await supabase
          .from("content_tags")
          .select("id")
          .in("id", sanitizedData.tagIds);
        
        const validTagIds = validTags?.map(t => t.id) || [];
        if (validTagIds.length > 0) {
          const tagAssignments = validTagIds.map(tagId => ({
            content_id: contentRecord.id,
            tag_id: tagId
          }));

          await supabase
            .from("content_tag_assignments")
            .insert(tagAssignments);
        }
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
            .select("content_id, content_tags (*)")
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
            .map(assignment => assignment.content_tags) || []
        }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    }
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Enhanced initial data fetching with error recovery
    const fetchInitialData = async () => {
      try {
        const isAuthenticated = await validateAuth();
        if (!isAuthenticated) {
          setLoading(false);
          return;
        }
        
        // Use staggered loading for better UX
        await Promise.allSettled([
          fetchContent(),
          fetchCategories(),
          fetchTags()
        ]);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        setError("Failed to load initial data");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [validateAuth]);

  return {
    content,
    categories,
    tags,
    loading,
    error,
    retryCount,
    authValidated,
    fetchContent,
    fetchContentBySlug,
    fetchCategories,
    fetchTags,
    createContent,
    updateContent,
    deleteContent,
    searchContent,
    validateAuth
  };
};