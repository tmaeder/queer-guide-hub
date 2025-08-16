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
      const [eventsCount, venuesCount, postsCount, personalitiesCount, cmsCount, groupsCount] = await Promise.all([
        supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('venues').select('*', { count: 'exact', head: true }),
        supabase.from('community_posts').select('*', { count: 'exact', head: true }),
        supabase.from('personalities').select('*', { count: 'exact', head: true }),
        supabase.from('cms_content').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('community_groups').select('*', { count: 'exact', head: true })
      ]);

      const stats: ContentTypeStats[] = [
        { content_type: 'events', count: eventsCount.count || 0, table_name: 'events' },
        { content_type: 'venues', count: venuesCount.count || 0, table_name: 'venues' },
        { content_type: 'community_posts', count: postsCount.count || 0, table_name: 'community_posts' },
        { content_type: 'personalities', count: personalitiesCount.count || 0, table_name: 'personalities' },
        { content_type: 'cms_content', count: cmsCount.count || 0, table_name: 'cms_content' },
        { content_type: 'community_groups', count: groupsCount.count || 0, table_name: 'community_groups' }
      ].sort((a, b) => b.count - a.count);

      setContentStats(stats);
    } catch (err) {
      console.error('Error fetching content stats:', err);
    }
  };

  // Fetch events
  const fetchEvents = async (limit = 50) => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
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
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    
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

  // Fetch all content
  const fetchAllContent = async (contentType?: string, limit = 200) => {
    try {
      setLoading(true);
      setError(null);

      let allContentData: UniversalContent[] = [];

      if (!contentType || contentType === 'all') {
        // Fetch from all sources
        const [events, venues, personalities, groups, posts, cmsContent] = await Promise.all([
          fetchEvents(Math.floor(limit / 6)),
          fetchVenues(Math.floor(limit / 6)),
          fetchPersonalities(Math.floor(limit / 6)),
          fetchCommunityGroups(Math.floor(limit / 6)),
          fetchCommunityPosts(Math.floor(limit / 6)),
          fetchCMSContent(Math.floor(limit / 6))
        ]);

        allContentData = [...events, ...venues, ...personalities, ...groups, ...posts, ...cmsContent];
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