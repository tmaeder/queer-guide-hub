import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CMSPage } from '@/types/cms';

const STALE_TIME = 5 * 60_000;

/**
 * Fetch a single published CMS page by slug, plus its parent and child pages
 * when the slug exposes a hub hierarchy. Used by CMSRoutePage, Page,
 * HelpHotlines and (via HelpHotlines' slug) the /resources CrisisStrip.
 *
 * Returns `notFound: true` when the page does not exist or is unpublished.
 */

/**
 * Explicit column list rather than `*`.
 *
 * CrisisStrip renders on /resources and only needs `body_json.hotlines`, so it
 * should not be paying to download an entire page document. Naming the columns
 * also means the forthcoming `body_doc` (the block-editor canvas, potentially
 * large) is never shipped to public readers: the public surfaces render
 * `body_html` and portal interactive blocks into it.
 *
 * Audit columns (created_by/updated_by/author_id/published_by/
 * scheduled_publish_at) are deliberately absent — no consumer reads them.
 */
const PAGE_COLUMNS = [
  'id',
  'slug',
  'page_type',
  'title',
  'subtitle',
  'excerpt',
  'body_json',
  'body_html',
  'cover_image_url',
  'cover_image_alt',
  'meta_title',
  'meta_description',
  'canonical_url',
  'og_image_url',
  'tags',
  'category',
  'workflow_state',
  'visibility_level',
  'published_at',
  'updated_at',
  'parent_slug',
].join(', ');
export function useCMSPage(slug: string | null | undefined) {
  return useQuery({
    queryKey: ['cms-page', slug],
    enabled: !!slug,
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cms_pages' as const)
        .select(PAGE_COLUMNS)
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
