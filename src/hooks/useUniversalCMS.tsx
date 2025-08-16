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

export function useUniversalCMS() {
  const { user } = useAuth();
  const [allContent, setAllContent] = useState<UniversalContent[]>([]);
  const [contentStats, setContentStats] = useState<ContentTypeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch content statistics
  const fetchContentStats = async () => {
    try {
      // Get stats for each content type
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

  // Fetch events
  const fetchEvents = async (limit = 50) => {
    console.log('Fetching events...');
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
    
    console.log('Fetched events:', data?.length || 0);
    
    return (data || []).map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      content_type: 'events',
      status: event.status,
      created_at: event.created_at,
      updated_at: event.updated_at,
      created_by: event.created_by,
      image_url: (event as any).image_url || undefined,
      metadata: {
        start_date: event.start_date,
        end_date: event.end_date,
        venue_id: event.venue_id,
        tags: (event as any).tags || []
      },
      raw_data: event
    }));
  };

  // Fetch venues
  const fetchVenues = async (limit = 50) => {
    console.log('Fetching venues...');
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching venues:', error);
      throw error;
    }
    
    console.log('Fetched venues:', data?.length || 0);
    
    return (data || []).map(venue => ({
      id: venue.id,
      title: venue.name,
      description: venue.description,
      content_type: 'venues',
      status: 'active', // venues don't have status field
      created_at: venue.created_at,
      updated_at: venue.updated_at,
      created_by: venue.created_by,
      image_url: (venue as any).image_url || undefined,
      metadata: {
        address: venue.address,
        city: venue.city,
        country: venue.country,
        tags: (venue as any).tags || [],
        amenities: venue.amenities || []
      },
      raw_data: venue
    }));
  };

  // Fetch personalities
  const fetchPersonalities = async (limit = 50) => {
    const { data, error } = await supabase
      .from('personalities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(personality => ({
      id: personality.id,
      title: personality.name,
      description: personality.description,
      content_type: 'personalities',
      status: 'active',
      created_at: personality.created_at,
      updated_at: personality.updated_at,
      image_url: personality.image_url,
      metadata: {
        birth_date: personality.birth_date,
        nationality: personality.nationality,
        profession: personality.profession,
        tags: personality.tags || []
      },
      raw_data: personality
    }));
  };

  // Fetch community groups
  const fetchCommunityGroups = async (limit = 50) => {
    const { data, error } = await supabase
      .from('community_groups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(group => ({
      id: group.id,
      title: group.name,
      description: group.description,
      content_type: 'community_groups',
      status: 'active',
      created_at: group.created_at,
      updated_at: group.updated_at,
      created_by: group.created_by,
      image_url: group.image_url,
      metadata: {
        member_count: group.member_count,
        is_private: group.is_private,
        tags: group.tags
      },
      raw_data: group
    }));
  };

  // Fetch community posts
  const fetchCommunityPosts = async (limit = 50) => {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(post => ({
      id: post.id,
      title: `Post by User ${post.user_id.slice(0, 8)}...`,
      description: post.content?.slice(0, 200),
      content_type: 'community_posts',
      status: 'active',
      created_at: post.created_at,
      updated_at: post.updated_at,
      created_by: post.user_id,
      metadata: {
        post_type: post.post_type,
        visibility: post.visibility,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        tags: post.tags
      },
      raw_data: post
    }));
  };

  // Fetch CMS content
  const fetchCMSContent = async (limit = 50) => {
    const { data, error } = await supabase
      .from('cms_content')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(content => ({
      id: content.id,
      title: typeof content.title === 'string' ? content.title : (content.title as any)?.en || 'Untitled',
      description: typeof content.description === 'string' ? content.description : (content.description as any)?.en,
      content_type: 'cms_content',
      status: content.workflow_state,
      created_at: content.created_at,
      updated_at: content.updated_at,
      created_by: content.created_by,
      metadata: {
        content_type: content.content_type,
        visibility_level: content.visibility_level,
        workflow_state: content.workflow_state,
        tags: content.tags
      },
      raw_data: content
    }));
  };

  // Fetch news articles
  const fetchNewsArticles = async (limit = 50) => {
    const { data, error } = await supabase
      .from('news_articles')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(article => ({
      id: article.id,
      title: article.title || 'Untitled Article',
      description: article.excerpt,
      content_type: 'news_articles',
      status: 'published',
      created_at: article.created_at,
      updated_at: article.updated_at,
      metadata: {
        author: article.author,
        source_id: article.source_id,
        category: article.category,
        published_at: article.published_at,
        views_count: article.views_count,
        is_featured: article.is_featured
      },
      raw_data: article
    }));
  };

  // Fetch tags
  const fetchTags = async (limit = 50) => {
    const { data, error } = await supabase
      .from('unified_tags')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(tag => ({
      id: tag.id,
      title: tag.name,
      description: tag.description,
      content_type: 'tags',
      status: 'active',
      created_at: tag.created_at,
      updated_at: tag.updated_at,
      metadata: {
        category: tag.category,
        color: tag.color,
        usage_count: tag.usage_count,
        slug: tag.slug
      },
      raw_data: tag
    }));
  };

  // Fetch cities
  const fetchCities = async (limit = 50) => {
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(city => ({
      id: city.id,
      title: city.name,
      description: city.description,
      content_type: 'cities',
      status: 'active',
      created_at: city.created_at,
      updated_at: city.updated_at,
      metadata: {
        country_id: city.country_id,
        population: city.population,
        latitude: city.latitude,
        longitude: city.longitude,
        is_capital: city.is_capital,
        is_major_city: city.is_major_city
      },
      raw_data: city
    }));
  };

  // Fetch countries
  const fetchCountries = async (limit = 50) => {
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(country => ({
      id: country.id,
      title: country.name,
      description: country.description,
      content_type: 'countries',
      status: 'active',
      created_at: country.created_at,
      updated_at: country.updated_at,
      metadata: {
        code: country.code,
        capital: country.capital,
        population: country.population,
        area_km2: country.area_km2,
        languages: country.languages,
        currency: country.currency
      },
      raw_data: country
    }));
  };

  // Fetch marketplace listings
  const fetchMarketplaceListings = async (limit = 50) => {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
    return (data || []).map(listing => ({
      id: listing.id,
      title: listing.title || listing.business_name || 'Untitled Listing',
      description: listing.description,
      content_type: 'marketplace_listings',
      status: listing.status || 'draft',
      created_at: listing.created_at,
      updated_at: listing.updated_at,
      created_by: listing.created_by,
      metadata: {
        business_name: listing.business_name,
        price: listing.price,
        location: listing.location,
        category: listing.category,
        contact_email: listing.contact_email,
        contact_phone: listing.contact_phone
      },
      raw_data: listing
    }));
  };

  // Fetch all content
  const fetchAllContent = async (contentType?: string, limit = 200) => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching all content, type:', contentType, 'limit:', limit);

      let allContentData: UniversalContent[] = [];

      if (!contentType || contentType === 'all') {
        // Fetch from all sources
        console.log('Fetching all content types...');
        const [events, venues, personalities, groups, posts, cmsContent, tags, cities, countries, marketplace, news] = await Promise.all([
          fetchEvents(Math.floor(limit / 11)),
          fetchVenues(Math.floor(limit / 11)),
          fetchPersonalities(Math.floor(limit / 11)),
          fetchCommunityGroups(Math.floor(limit / 11)),
          fetchCommunityPosts(Math.floor(limit / 11)),
          fetchCMSContent(Math.floor(limit / 11)),
          fetchTags(Math.floor(limit / 11)),
          fetchCities(Math.floor(limit / 11)),
          fetchCountries(Math.floor(limit / 11)),
          fetchMarketplaceListings(Math.floor(limit / 11)),
          fetchNewsArticles(Math.floor(limit / 11))
        ]);

        allContentData = [...events, ...venues, ...personalities, ...groups, ...posts, ...cmsContent, ...tags, ...cities, ...countries, ...marketplace, ...news];
        console.log('Total content fetched:', allContentData.length);
      } else {
        // Fetch specific content type
        switch (contentType) {
          case 'events':
            allContentData = await fetchEvents(limit);
            break;
          case 'venues':
            allContentData = await fetchVenues(limit);
            break;
          case 'personalities':
            allContentData = await fetchPersonalities(limit);
            break;
          case 'community_groups':
            allContentData = await fetchCommunityGroups(limit);
            break;
          case 'community_posts':
            allContentData = await fetchCommunityPosts(limit);
            break;
          case 'cms_content':
            allContentData = await fetchCMSContent(limit);
            break;
          case 'tags':
            allContentData = await fetchTags(limit);
            break;
          case 'cities':
            allContentData = await fetchCities(limit);
            break;
          case 'countries':
            allContentData = await fetchCountries(limit);
            break;
          case 'marketplace_listings':
            allContentData = await fetchMarketplaceListings(limit);
            break;
          case 'news_articles':
            allContentData = await fetchNewsArticles(limit);
            break;
        }
      }

      // Sort by updated_at descending
      allContentData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      setAllContent(allContentData);
      await fetchContentStats();
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
  }, []);

  return {
    allContent,
    contentStats,
    loading,
    error,
    fetchAllContent,
    deleteUniversalContent,
  };
}