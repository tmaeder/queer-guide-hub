import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type OrgRole = 'publisher' | 'seller' | 'venue' | 'organizer' | 'community' | 'support';

export interface OrgVenueRef {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  description: string | null;
  editorial_hook: string | null;
  editorial_long: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  images: string[];
  roles: OrgRole[];
  website: string | null;
  website_domain: string | null;
  email: string | null;
  phone: string | null;
  social: Record<string, string>;
  tags: string[];
  city_id: string | null;
  country_id: string | null;
  article_count: number;
  product_count: number;
  venue_count: number;
  venues: OrgVenueRef[];
}

// The organizations table + its RPCs were added after the generated Supabase
// types snapshot, so call them through a thin untyped bridge (no `any`).
type RpcResult<T> = { data: T | null; error: { message: string } | null };
const callRpc = <T,>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> =>
  (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<RpcResult<T>>
  )(name, args);

export function useOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: ['organization', slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async (): Promise<Organization | null> => {
      const { data, error } = await callRpc<Organization>('get_organization', { p_slug: slug });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}

export function useOrganizationArticles(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['organization-articles', orgId],
    enabled: Boolean(orgId) && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Tables<'news_articles'>[]> => {
      const { data, error } = await callRpc<Tables<'news_articles'>[]>('organization_articles', {
        p_org_id: orgId,
        p_limit: 24,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export interface OrgListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  editorial_hook: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  roles: OrgRole[];
  website_domain: string | null;
  city_id: string | null;
  country_id: string | null;
}

/** List organizations for the directory + the /help support section. */
export function useOrganizationsList(opts: {
  role?: OrgRole;
  q?: string;
  countryId?: string;
  countryCode?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const { role, q, countryId, countryCode, limit = 60, enabled = true } = opts;
  return useQuery({
    queryKey: ['organizations-list', role ?? 'all', q ?? '', countryId ?? '', countryCode ?? '', limit],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<OrgListItem[]> => {
      const { data, error } = await callRpc<OrgListItem[]>('list_organizations', {
        p_role: role ?? null,
        p_q: q ?? null,
        p_country_id: countryId ?? null,
        p_country_code: countryCode ?? null,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Resolve an organization slug from a merchant/website domain (for redirects). */
export function useOrgSlugByDomain(domain: string | undefined) {
  return useQuery({
    queryKey: ['org-slug-by-domain', domain],
    enabled: Boolean(domain),
    staleTime: 300_000,
    queryFn: async (): Promise<string | null> => {
      const table = (
        supabase.from as unknown as (t: string) => {
          select: (cols: string) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<RpcResult<{ slug: string }>> };
          };
        }
      )('organizations');
      const { data } = await table.select('slug').eq('website_domain', domain!).maybeSingle();
      return data?.slug ?? null;
    },
  });
}
