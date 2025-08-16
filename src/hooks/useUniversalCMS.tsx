import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

export interface UniversalContent {
  id: string;
  title: string;
  description?: string;
  content_type: string;
  status?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  image_url?: string;
  metadata?: any;
  raw_data: any;
}

export interface ContentTypeStats {
  content_type: string;
  count: number;
  table_name: string;
}

export interface ContentFilters {
  contentType?: string;
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useUniversalCMS() {
  const { user } = useAuth();
  const [allContent, setAllContent] = useState<UniversalContent[]>([]);
  const [contentStats, setContentStats] = useState<ContentTypeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Fetch content statistics
  const fetchContentStats = async () => {
    try {
      const [eventsCount, venuesCount, postsCount, personalitiesCount, cmsCount, groupsCount, tagsCount, citiesCount, countriesCount, marketplaceCount, newsCount] = await Promise.all([
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('venues').select('*', { count: 'exact', head: true }),
        supabase.from('community_posts').select('*', { count: 'exact', head: true }),
        supabase.from('personalities').select('*', { count: 'exact', head: true }),
        supabase.from('cms_content').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('community_groups').select('*', { count: 'exact', head: true }),
        supabase.from('unified_tags').select('*', { count: 'exact', head: true }),
        supabase.from('cities').select('*', { count: 'exact', head: true }),
        supabase.from('countries').select('*', { count: 'exact', head: true }),
        supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }),
        supabase.from('news_articles').select('*', { count: 'exact', head: true })
      ]);

      const stats: ContentTypeStats[] = [
        { content_type: 'events', count: eventsCount.count || 0, table_name: 'events' },
        { content_type: 'venues', count: venuesCount.count || 0, table_name: 'venues' },
        { content_type: 'community_posts', count: postsCount.count || 0, table_name: 'community_posts' },
        { content_type: 'personalities', count: personalitiesCount.count || 0, table_name: 'personalities' },
        { content_type: 'cms_content', count: cmsCount.count || 0, table_name: 'cms_content' },
        { content_type: 'community_groups', count: groupsCount.count || 0, table_name: 'community_groups' },
        { content_type: 'tags', count: tagsCount.count || 0, table_name: 'unified_tags' },
        { content_type: 'cities', count: citiesCount.count || 0, table_name: 'cities' },
        { content_type: 'countries', count: countriesCount.count || 0, table_name: 'countries' },
        { content_type: 'marketplace_listings', count: marketplaceCount.count || 0, table_name: 'marketplace_listings' },
        { content_type: 'news_articles', count: newsCount.count || 0, table_name: 'news_articles' }
      ].sort((a, b) => b.count - a.count);

      setContentStats(stats);
    } catch (err) {
      console.error('Error fetching content stats:', err);
    }
  };

  const fetchContentByType = async (contentType: string, limit: number, offset: number, search: string, status?: string) => {
    const tableNames = {
      events: 'events' as const,
      venues: 'venues' as const,
      personalities: 'personalities' as const,
      community_groups: 'community_groups' as const,
      community_posts: 'community_posts' as const,
      cms_content: 'cms_content' as const,
      tags: 'unified_tags' as const,
      cities: 'cities' as const,
      countries: 'countries' as const,
      marketplace_listings: 'marketplace_listings' as const,
      news_articles: 'news_articles' as const
    };
    
    const tableName = tableNames[contentType as keyof typeof tableNames];
    if (!tableName) throw new Error(`Invalid content type: ${contentType}`);
    
    let query = supabase.from(tableName).select('*', { count: 'exact' });
    
    // Add search filters
    if (search) {
      switch (contentType) {
        case 'events':
        case 'venues':
        case 'personalities':
        case 'community_groups':
          query = query.ilike('name', `%${search}%`);
          break;
        case 'cms_content':
          query = query.or(`title->>'en'.ilike.%${search}%,description->>'en'.ilike.%${search}%`);
          break;
        case 'tags':
        case 'cities':
        case 'countries':
          query = query.ilike('name', `%${search}%`);
          break;
        case 'news_articles':
          query = query.ilike('title', `%${search}%`);
          break;
        case 'marketplace_listings':
          query = query.or(`title.ilike.%${search}%,business_name.ilike.%${search}%`);
          break;
        case 'community_posts':
          query = query.ilike('content', `%${search}%`);
          break;
      }
    }

    // Add status filters
    if (status && contentType !== 'cities' && contentType !== 'countries' && contentType !== 'tags') {
      if (contentType === 'cms_content') {
        query = query.eq('workflow_state', status);
      } else {
        query = query.eq('status', status);
      }
    }

    // Add soft delete filter for CMS content
    if (contentType === 'cms_content') {
      query = query.is('deleted_at', null);
    }

    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      data: (data || []).map(item => transformContentItem(item, contentType)),
      totalCount: count || 0
    };
  };

  const getTableName = (contentType: string): string => {
    const tableMap: Record<string, string> = {
      events: 'events',
      venues: 'venues',
      personalities: 'personalities',
      community_groups: 'community_groups',
      community_posts: 'community_posts',
      cms_content: 'cms_content',
      tags: 'unified_tags',
      cities: 'cities',
      countries: 'countries',
      marketplace_listings: 'marketplace_listings',
      news_articles: 'news_articles'
    };
    return tableMap[contentType] || contentType;
  };

  const transformContentItem = (item: any, contentType: string): UniversalContent => {
    const baseItem = {
      id: item.id,
      content_type: contentType,
      created_at: item.created_at,
      updated_at: item.updated_at,
      raw_data: item
    };

    switch (contentType) {
      case 'events':
        return {
          ...baseItem,
          title: item.title,
          description: item.description,
          status: item.status,
          created_by: item.created_by,
          image_url: item.image_url,
          metadata: {
            start_date: item.start_date,
            end_date: item.end_date,
            venue_id: item.venue_id,
            tags: item.tags || []
          }
        };
      case 'venues':
        return {
          ...baseItem,
          title: item.name,
          description: item.description,
          status: 'active',
          created_by: item.created_by,
          image_url: item.image_url,
          metadata: {
            address: item.address,
            city: item.city,
            country: item.country,
            tags: item.tags || [],
            amenities: item.amenities || []
          }
        };
      case 'personalities':
        return {
          ...baseItem,
          title: item.name,
          description: item.description,
          status: 'active',
          image_url: item.image_url,
          metadata: {
            birth_date: item.birth_date,
            nationality: item.nationality,
            profession: item.profession,
            tags: item.tags || []
          }
        };
      case 'cms_content':
        return {
          ...baseItem,
          title: typeof item.title === 'string' ? item.title : item.title?.en || 'Untitled',
          description: typeof item.description === 'string' ? item.description : item.description?.en,
          status: item.workflow_state,
          created_by: item.created_by,
          metadata: {
            content_type: item.content_type,
            visibility_level: item.visibility_level,
            workflow_state: item.workflow_state,
            tags: item.tags
          }
        };
      case 'tags':
        return {
          ...baseItem,
          title: item.name,
          description: item.description,
          status: 'active',
          metadata: {
            category: item.category,
            color: item.color,
            usage_count: item.usage_count,
            slug: item.slug
          }
        };
      case 'community_groups':
        return {
          ...baseItem,
          title: item.name,
          description: item.description,
          status: 'active',
          created_by: item.created_by,
          image_url: item.image_url,
          metadata: {
            member_count: item.member_count,
            is_private: item.is_private,
            tags: item.tags
          }
        };
      case 'community_posts':
        return {
          ...baseItem,
          title: `Post by User ${item.user_id.slice(0, 8)}...`,
          description: item.content?.slice(0, 200),
          status: 'active',
          created_by: item.user_id,
          metadata: {
            post_type: item.post_type,
            visibility: item.visibility,
            likes_count: item.likes_count,
            comments_count: item.comments_count,
            tags: item.tags
          }
        };
      case 'news_articles':
        return {
          ...baseItem,
          title: item.title || 'Untitled Article',
          description: item.excerpt,
          status: 'published',
          metadata: {
            author: item.author,
            source_id: item.source_id,
            category: item.category,
            published_at: item.published_at,
            views_count: item.views_count,
            is_featured: item.is_featured
          }
        };
      case 'marketplace_listings':
        return {
          ...baseItem,
          title: item.title || item.business_name || 'Untitled Listing',
          description: item.description,
          status: item.status || 'draft',
          created_by: item.created_by,
          metadata: {
            business_name: item.business_name,
            price: item.price,
            location: item.location,
            category: item.category,
            contact_email: item.contact_email,
            contact_phone: item.contact_phone
          }
        };
      default:
        return {
          ...baseItem,
          title: item.name || item.title || 'Untitled',
          description: item.description,
          status: item.status || 'active'
        };
    }
  };

  // Fetch content with pagination and filtering
  const fetchAllContent = async (filters: ContentFilters = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const {
        contentType = 'all',
        search = '',
        status = '',
        page = 1,
        limit = 50
      } = filters;

      console.log('Fetching content with filters:', filters);

      let allContentData: UniversalContent[] = [];
      let totalContentCount = 0;

      const offset = (page - 1) * limit;

      if (contentType === 'all' || !contentType) {
        // For 'all' content, fetch limited amount from each table
        const contentTypes = ['events', 'venues', 'personalities', 'community_groups', 'community_posts', 'cms_content', 'tags', 'cities', 'countries', 'marketplace_listings', 'news_articles'];
        const perTypeLimit = Math.max(1, Math.floor(limit / contentTypes.length));
        
        const promises = contentTypes.map(type => 
          fetchContentByType(type, perTypeLimit, 0, search, status)
        );

        const results = await Promise.all(promises);
        allContentData = results.flatMap(result => result.data);
        totalContentCount = results.reduce((sum, result) => sum + result.totalCount, 0);
      } else {
        // Fetch specific content type with proper pagination
        const result = await fetchContentByType(contentType, limit, offset, search, status);
        allContentData = result.data;
        totalContentCount = result.totalCount;
      }

      // Sort by updated_at descending
      allContentData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      setAllContent(allContentData);
      setTotalCount(totalContentCount);
      setCurrentPage(page);
      setHasNextPage(allContentData.length === limit);
      
      console.log(`Fetched ${allContentData.length} items, total: ${totalContentCount}`);
    } catch (err) {
      console.error('Error fetching content:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch content');
    } finally {
      setLoading(false);
    }
  };

  // Delete content from any table
  const deleteUniversalContent = async (contentType: string, id: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to delete content",
        variant: "destructive",
      });
      return false;
    }

    try {
      let result;
      
      switch (contentType) {
        case 'cms_content':
          result = await supabase
            .from('cms_content')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: user.id
            })
            .eq('id', id);
          break;
        case 'community_posts':
          result = await supabase
            .from('community_posts')
            .delete()
            .eq('id', id);
          break;
        default:
          throw new Error(`Deletion not supported for content type: ${contentType}`);
      }

      if (result.error) throw result.error;

      toast({
        title: "Content deleted",
        description: "Content has been deleted successfully",
      });

      fetchAllContent(); // Refresh the list
      return true;
    } catch (err) {
      console.error('Error deleting content:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to delete content',
        variant: "destructive",
      });
      return false;
    }
  };

  // Initial load
  useEffect(() => {
    fetchAllContent();
    fetchContentStats();
  }, []);

  return {
    allContent,
    contentStats,
    loading,
    error,
    totalCount,
    currentPage,
    hasNextPage,
    fetchAllContent,
    deleteUniversalContent,
    setCurrentPage,
  };
}