import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type DirectoryStats = {
  continent_count: number;
  country_count: number;
  city_count: number;
  major_city_count: number;
};

export const useOptimizedDirectory = () => {
  const [stats, setStats] = useState<DirectoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate directory statistics using efficient queries
  const fetchDirectoryStats = async () => {
    try {
      setLoading(true);
      
      const [continentsCount, countriesCount, citiesCount, majorCitiesCount] = await Promise.all([
        supabase.from("continents").select("id", { count: "exact", head: true }),
        supabase.from("countries").select("id", { count: "exact", head: true }),
        supabase.from("cities").select("id", { count: "exact", head: true }),
        supabase.from("cities").select("id", { count: "exact", head: true }).eq("is_major_city", true)
      ]);

      setStats({
        continent_count: continentsCount.count || 0,
        country_count: countriesCount.count || 0,
        city_count: citiesCount.count || 0,
        major_city_count: majorCitiesCount.count || 0
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch directory stats");
    } finally {
      setLoading(false);
    }
  };

  // Optimized venue search using existing indexes
  const searchVenuesOptimized = async (
    query?: string,
    city?: string,
    category?: string,
    tags?: string[],
    limit: number = 20
  ) => {
    try {
      setLoading(true);
      
      let queryBuilder = supabase
        .from("venues")
        .select(`
          id,
          name,
          category,
          city,
          address,
          latitude,
          longitude,
          description,
          phone,
          website,
          price_range,
          featured,
          verified,
          image_url,
          tags
        `)
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (query) {
        queryBuilder = queryBuilder.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
      }
      
      if (city) {
        queryBuilder = queryBuilder.ilike("city", `%${city}%`);
      }
      
      if (category) {
        queryBuilder = queryBuilder.eq("category", category);
      }

      if (tags && tags.length > 0) {
        queryBuilder = queryBuilder.contains("tags", tags);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search venues");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const searchEventsOptimized = async (
    query?: string,
    city?: string,
    category?: string,
    start_date?: string,
    end_date?: string,
    limit: number = 20
  ) => {
    try {
      setLoading(true);

      let queryBuilder = supabase
        .from("events")
        .select(`
          id,
          title,
          description,
          event_type,
          city,
          address,
          venue_name,
          start_date,
          end_date,
          is_free,
          price_min,
          price_max,
          featured,
          images,
          organizer_name,
          website,
          ticket_url
        `)
        .order("featured", { ascending: false })
        .order("start_date", { ascending: true })
        .limit(limit);

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,description.ilike.%${query}%,venue_name.ilike.%${query}%`);
      }
      
      if (city) {
        queryBuilder = queryBuilder.ilike("city", `%${city}%`);
      }
      
      if (category) {
        queryBuilder = queryBuilder.eq("event_type", category);
      }

      if (start_date) {
        queryBuilder = queryBuilder.gte("start_date", start_date);
      }

      if (end_date) {
        queryBuilder = queryBuilder.lte("end_date", end_date);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search events");
      return [];
    } finally {
      setLoading(false);
    }
  };

  const searchAidRequestsOptimized = async (
    query?: string,
    request_type?: string,
    urgency?: string,
    city?: string,
    limit: number = 20
  ) => {
    try {
      setLoading(true);

      let queryBuilder = supabase
        .from("aid_requests")
        .select(`
          id,
          title,
          description,
          request_type,
          urgency,
          status,
          location_text,
          contact_method,
          tags,
          created_at,
          expires_at,
          user_id
        `)
        .eq("status", "open")
        .order("urgency", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
      }
      
      if (request_type) {
        queryBuilder = queryBuilder.eq("request_type", request_type);
      }
      
      if (urgency) {
        queryBuilder = queryBuilder.eq("urgency", urgency);
      }

      if (city) {
        queryBuilder = queryBuilder.ilike("location_text", `%${city}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search aid requests");
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Fetch trending content using optimized queries
  const fetchTrendingContent = async () => {
    try {
      setLoading(true);

      const [trendingVenues, trendingEvents, recentPosts] = await Promise.all([
        // Most visited venues in last 30 days
        supabase
          .from("venues")
          .select(`
            id,
            name,
            category,
            city,
            featured,
            verified,
            image_url
          `)
          .eq("featured", true)
          .order("created_at", { ascending: false })
          .limit(6),

        // Upcoming featured events
        supabase
          .from("events")
          .select(`
            id,
            title,
            event_type,
            city,
            start_date,
            featured,
            images
          `)
          .eq("featured", true)
          .gte("start_date", new Date().toISOString())
          .order("start_date", { ascending: true })
          .limit(6),

        // Recent community posts with high engagement
        supabase
          .from("community_posts")
          .select(`
            id,
            content,
            post_type,
            likes_count,
            comments_count,
            created_at,
            user_id
          `)
          .eq("visibility", "public")
          .order("likes_count", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5)
      ]);

      return {
        venues: trendingVenues.data || [],
        events: trendingEvents.data || [],
        posts: recentPosts.data || []
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch trending content");
      return { venues: [], events: [], posts: [] };
    } finally {
      setLoading(false);
    }
  };

  // Refresh directory stats by refetching
  const refreshDirectoryStats = async () => {
    await fetchDirectoryStats();
  };

  useEffect(() => {
    fetchDirectoryStats();
  }, []);

  return {
    stats,
    loading,
    error,
    searchVenuesOptimized,
    searchEventsOptimized,
    searchAidRequestsOptimized,
    fetchTrendingContent,
    refreshDirectoryStats,
    fetchDirectoryStats
  };
};