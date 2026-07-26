/**
 * Business spine (organizations-as-party) admin data access.
 * All Supabase reads/writes for /admin/business live here (lint rule:
 * supabase.from() only in src/hooks/).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import type { Tables } from '@/integrations/supabase/types';

export type OrgEntityType = 'venue' | 'hotel' | 'merchant' | 'affiliate_partner' | 'brand';

export const ORG_ROLE_LABELS: Record<string, string> = {
  venue: 'Venue',
  hotel: 'Hotel',
  seller: 'Merchant',
  affiliate_partner: 'Partner',
  brand: 'Brand',
  publisher: 'Publisher',
  support: 'Support',
  organizer: 'Organizer',
  community: 'Community',
};

export type AdminOrg = Tables<'organizations'>;

export interface OrgListFilters {
  q?: string;
  role?: string;
  claimStatus?: string;
  needsAttention?: boolean;
}

export function useAdminOrgList(filters: OrgListFilters) {
  const { q, role, claimStatus, needsAttention } = filters;
  return useQuery({
    queryKey: ['admin-orgs', q ?? '', role ?? '', claimStatus ?? '', needsAttention ?? false],
    staleTime: 30_000,
    queryFn: async (): Promise<AdminOrg[]> => {
      let query = supabase
        .from('organizations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (q && q.trim()) {
        const term = q.trim().replace(/[%_]/g, '');
        query = query.or(`name.ilike.%${term}%,website_domain.ilike.%${term}%,slug.ilike.%${term}%`);
      }
      if (role) query = query.contains('roles', [role]);
      if (claimStatus) query = query.eq('claim_status', claimStatus);
      if (needsAttention) query = query.eq('needs_attention', true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useAdminOrg(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-org', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<AdminOrg | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export interface LinkedEntityRow {
  id: string;
  name: string;
  detail: string | null;
  editHref: string | null;
}

/** Linked rows per role tab, normalized to one display shape. */
export function useOrgLinkedEntities(orgId: string | undefined) {
  return useQuery({
    queryKey: ['admin-org-linked', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [venues, hotels, merchants, partners, brands, sources] = await Promise.all([
        supabase.from('venues').select('id,name,city,slug').eq('organization_id', orgId!).is('duplicate_of_id', null).limit(100),
        supabase.from('hotels').select('id,name,city,hotel_type').eq('organization_id', orgId!).limit(100),
        supabase.from('marketplace_merchants').select('id,display_name,provider,shop_domain').eq('organization_id', orgId!).limit(100),
        supabase.from('affiliate_partners').select('id,partner_name,vertical,enabled').eq('organization_id', orgId!).limit(100),
        supabase.from('marketplace_brands').select('id,display_name,brand_key,status').eq('organization_id', orgId!).limit(100),
        supabase.from('news_sources').select('id,name').eq('organization_id', orgId!).limit(100),
      ]);
      const err =
        venues.error ?? hotels.error ?? merchants.error ?? partners.error ?? brands.error ?? sources.error;
      if (err) throw new Error(err.message);
      const map = (rows: LinkedEntityRow[]): LinkedEntityRow[] => rows;
      return {
        venue: map(
          (venues.data ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            detail: v.city,
            editHref: `/admin/content/venues`,
          })),
        ),
        hotel: map(
          (hotels.data ?? []).map((h) => ({
            id: h.id,
            name: h.name,
            detail: [h.hotel_type, h.city].filter(Boolean).join(' · ') || null,
            editHref: `/admin/hotels`,
          })),
        ),
        merchant: map(
          (merchants.data ?? []).map((m) => ({
            id: m.id,
            name: m.display_name,
            detail: [m.provider, m.shop_domain].filter(Boolean).join(' · ') || null,
            editHref: `/admin/affiliate?tab=merchants`,
          })),
        ),
        affiliate_partner: map(
          (partners.data ?? []).map((p) => ({
            id: p.id,
            name: p.partner_name,
            detail: [p.vertical, p.enabled ? 'enabled' : 'disabled'].filter(Boolean).join(' · '),
            editHref: `/admin/affiliate?tab=partners`,
          })),
        ),
        brand: map(
          (brands.data ?? []).map((b) => ({
            id: b.id,
            name: b.display_name,
            detail: b.status,
            editHref: `/admin/brands`,
          })),
        ),
        news_source: map(
          (sources.data ?? []).map((s) => ({ id: s.id, name: s.name, detail: null, editHref: null })),
        ),
      };
    },
  });
}

/** Search unlinked entities of a type for the link picker. */
export function useOrgLinkCandidates(type: OrgEntityType, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['org-link-candidates', type, q],
    enabled: enabled && q.trim().length >= 2,
    queryFn: async (): Promise<LinkedEntityRow[]> => {
      const term = `%${q.trim().replace(/[%_]/g, '')}%`;
      if (type === 'venue') {
        const { data, error } = await supabase
          .from('venues').select('id,name,city')
          .is('organization_id', null).is('duplicate_of_id', null)
          .ilike('name', term).limit(10);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => ({ id: r.id, name: r.name, detail: r.city, editHref: null }));
      }
      if (type === 'hotel') {
        const { data, error } = await supabase
          .from('hotels').select('id,name,city')
          .is('organization_id', null).is('duplicate_of_id', null)
          .ilike('name', term).limit(10);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => ({ id: r.id, name: r.name, detail: r.city, editHref: null }));
      }
      if (type === 'merchant') {
        const { data, error } = await supabase
          .from('marketplace_merchants').select('id,display_name,shop_domain')
          .is('organization_id', null).ilike('display_name', term).limit(10);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => ({ id: r.id, name: r.display_name, detail: r.shop_domain, editHref: null }));
      }
      if (type === 'affiliate_partner') {
        const { data, error } = await supabase
          .from('affiliate_partners').select('id,partner_name,vertical')
          .is('organization_id', null).ilike('partner_name', term).limit(10);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => ({ id: r.id, name: r.partner_name, detail: r.vertical, editHref: null }));
      }
      const { data, error } = await supabase
        .from('marketplace_brands').select('id,display_name,brand_key')
        .is('organization_id', null).ilike('display_name', term).limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id, name: r.display_name, detail: r.brand_key, editHref: null }));
    },
  });
}

function invalidateOrg(qc: ReturnType<typeof useQueryClient>, orgId?: string) {
  qc.invalidateQueries({ queryKey: ['admin-orgs'] });
  if (orgId) {
    qc.invalidateQueries({ queryKey: ['admin-org', orgId] });
    qc.invalidateQueries({ queryKey: ['admin-org-linked', orgId] });
  }
  qc.invalidateQueries({ queryKey: ['org-link-suggestions'] });
}

export function useLinkOrgEntity(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { entityType: OrgEntityType | 'news_source'; entityId: string; unlink?: boolean }) => {
      const fn = args.unlink ? 'unlink_organization_entity' : 'link_organization_entity';
      const { error } = await untypedRpc(fn, {
        p_org_id: orgId,
        p_entity_type: args.entityType,
        p_entity_id: args.entityId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateOrg(qc, orgId),
  });
}

export function usePromoteToOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { entityType: OrgEntityType; entityId: string }): Promise<string> => {
      const { data, error } = await untypedRpc<string>('promote_entity_to_organization', {
        p_entity_type: args.entityType,
        p_entity_id: args.entityId,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => invalidateOrg(qc),
  });
}

export interface OrgLinkSuggestion {
  id: string;
  entity_type: OrgEntityType;
  entity_id: string;
  organization_id: string | null;
  confidence: number;
  reason: string;
  payload: {
    entity?: { name?: string; website?: string };
    org?: { id?: string; name?: string } | null;
  };
  created_at: string;
}

export function useOrgLinkSuggestions() {
  return useQuery({
    queryKey: ['org-link-suggestions'],
    queryFn: async (): Promise<OrgLinkSuggestion[]> => {
      const { data, error } = await untypedFrom('org_link_suggestions')
        .select('*')
        .eq('status', 'open')
        .order('confidence', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OrgLinkSuggestion[];
    },
  });
}

export function useDecideOrgAdoption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; approve: boolean; orgId?: string; note?: string }) => {
      const { error } = await untypedRpc('decide_org_adoption', {
        p_id: args.id,
        p_approve: args.approve,
        p_org_id: args.orgId ?? null,
        p_note: args.note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateOrg(qc),
  });
}

export interface OrgSpineDrift {
  hotels_unlinked: number;
  merchants_unlinked: number;
  partners_unlinked: number;
  brands_owned_unlinked: number;
  venues_unlinked_quality: number;
  suggestions_open: number;
  organizations_total: number;
}

export function useOrgSpineDrift() {
  return useQuery({
    queryKey: ['org-spine-drift'],
    staleTime: 60_000,
    queryFn: async (): Promise<OrgSpineDrift | null> => {
      const { data, error } = await untypedRpc<OrgSpineDrift>('org_spine_drift_counts');
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
