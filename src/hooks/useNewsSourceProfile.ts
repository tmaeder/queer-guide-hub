import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NewsSourceProfile {
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  orgSlug: string | null;
  articleCount: number | null;
}

/** The publisher behind a news article, for the "About the source" card. */
export function useNewsSourceProfile(name: string | null | undefined) {
  return useQuery({
    queryKey: ['news-source-profile', name],
    enabled: !!name,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<NewsSourceProfile | null> => {
      const { data, error } = await supabase
        .from('news_sources')
        .select(
          'id, description, website_url, artwork_url, organizations:organization_id(slug, logo_url, description)',
        )
        .eq('name', name as string)
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      // Generated types predate these columns; describe the row by hand.
      const row = data as unknown as {
        id: string;
        description: string | null;
        website_url: string | null;
        artwork_url: string | null;
        organizations: {
          slug: string | null;
          logo_url: string | null;
          description: string | null;
        } | null;
      };
      const org = row.organizations;
      const { count } = await supabase
        .from('news_articles')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', row.id);
      return {
        description: row.description ?? org?.description ?? null,
        websiteUrl: row.website_url ?? null,
        logoUrl: org?.logo_url ?? row.artwork_url ?? null,
        orgSlug: org?.slug ?? null,
        articleCount: count ?? null,
      };
    },
  });
}
