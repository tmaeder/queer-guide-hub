import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

type PublicBranding = {
  siteName?: string;
  logoUrl?: string;
};

/**
 * Public read of the published site_branding overrides for SPA chrome (header
 * logo / wordmark). One anon PostgREST read per session (staleTime Infinity);
 * every failure path returns {} so the compiled-in defaults render.
 */
export function useSiteBranding(): PublicBranding {
  const { data } = useQuery({
    queryKey: ['public-site-branding'],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async (): Promise<PublicBranding> => {
      try {
        const { data: row } = await untypedFrom('site_branding')
          .select('published,overrides_enabled')
          .eq('id', 1)
          .maybeSingle();
        const r = row as { published?: { meta?: Record<string, unknown> }; overrides_enabled?: boolean } | null;
        if (!r || r.overrides_enabled === false) return {};
        const meta = r.published?.meta ?? {};
        const siteName = typeof meta.site_name === 'string' && meta.site_name.length <= 300 ? meta.site_name : undefined;
        const logoUrl =
          typeof meta.org_logo_url === 'string' && /^(https:\/\/|\/)[^\s"'<>]{1,255}$/.test(meta.org_logo_url)
            ? meta.org_logo_url
            : undefined;
        return { siteName, logoUrl };
      } catch {
        return {};
      }
    },
  });
  return data ?? {};
}
