import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CMSPage } from '@/types/cms';

const STALE_TIME = 5 * 60_000;

/**
 * DUP-4 — fetch a single published CMS page by slug, plus its parent and
 * child pages when the slug exposes a hub hierarchy. Used by CMSRoutePage,
 * Page, and HelpHotlines.
 */
export function useCMSPage(slug: string | null | undefined) {
  return useQuery({
    queryKey: ['cms-page', slug],
    enabled: !!slug,
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cms_pages' as const)
        .select('*')
        .eq('slug', slug as string)
        .eq('workflow_state', 'published')
        .single();

      if (error || !data) {
        return {
          page: null as CMSPage | null,
          parent: null as CMSPage | null,
          children: [] as CMSPage[],
          notFound: true,
        };
      }

      const page = data as CMSPage;

      const [parentRes, childrenRes] = await Promise.all([
        page.parent_slug
          ? supabase
              .from('cms_pages' as const)
              .select('slug, title, subtitle')
              .eq('slug', page.parent_slug)
              .eq('workflow_state', 'published')
              .single()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('cms_pages' as const)
          .select('slug, title, subtitle, excerpt, category')
          .eq('parent_slug', slug as string)
          .eq('workflow_state', 'published')
          .order('title'),
      ]);

      return {
        page,
        parent: (parentRes.data ?? null) as CMSPage | null,
        children: (childrenRes.data ?? []) as CMSPage[],
        notFound: false,
      };
    },
  });
}
