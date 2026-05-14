/**
 * Hooks backing the /resources/topic/:slug page — pulls CMS guides, tagged
 * venues, and recent news for a topic's tag cluster. Centralised here so
 * page components stay free of supabase.from() per the queerguide ESLint rule.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

const STALE = 5 * 60_000;

export function useTopicGuides(parentSlug: string | undefined) {
  return useQuery({
    queryKey: ['topic-guides', parentSlug],
    enabled: !!parentSlug,
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('cms_pages')
        .select('slug, title, subtitle, excerpt')
        .eq('parent_slug', parentSlug!)
        .eq('workflow_state', 'published')
        .order('title')
        .limit(12);
      return data ?? [];
    },
  });
}

export function useTopicOrgs(tagCluster: string[] | undefined) {
  return useQuery({
    queryKey: ['topic-orgs', tagCluster],
    enabled: !!tagCluster && tagCluster.length > 0,
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_venues_by_tag', {
        tag_values: tagCluster!,
        max_results: 12,
      });
      return (data ?? []) as Venue[];
    },
  });
}

export function useTopicNews(tagCluster: string[] | undefined) {
  return useQuery({
    queryKey: ['topic-news', tagCluster],
    enabled: !!tagCluster && tagCluster.length > 0,
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('news_articles')
        .select('id, slug, title, excerpt, published_at, publisher_name, image_url, tags')
        .overlaps('tags', tagCluster!)
        .eq('quality_status', 'approved')
        .order('published_at', { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });
}

export function useSupportOrgs(supportOrgTags: string[]) {
  return useQuery({
    queryKey: ['resources-support-orgs'],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_venues_by_tag', {
        tag_values: supportOrgTags,
        max_results: 200,
      });
      if (error) throw error;
      return (data ?? []) as Venue[];
    },
  });
}
