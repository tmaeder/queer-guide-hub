import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedSupabase } from '@/integrations/supabase/untyped';

export interface MerchantRow {
  id: string;
  provider: string;
  slug: string;
  display_name: string;
  shop_domain: string | null;
  config: Record<string, unknown> | null;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_items: number | null;
  affiliate_partner_id: string | null;
  organization_id: string | null;
  affiliate_partners: { partner_name: string } | null;
  organizations: { name: string; slug: string } | null;
}

export interface MerchantUpsert {
  id?: string;
  provider?: string;
  slug?: string;
  display_name?: string;
  shop_domain?: string | null;
  config?: Record<string, unknown>;
  is_enabled?: boolean;
  affiliate_partner_id?: string | null;
  organization_id?: string | null;
}

export interface SyncResult {
  status: 'ok' | 'error' | 'skipped';
  items?: number;
  error?: string;
  reason?: string;
}

/**
 * Admin registry access for marketplace_merchants. Reads go through the
 * admin-read RLS policy; ALL writes go through the SECURITY DEFINER
 * admin_upsert/delete RPCs — the table itself stays write-locked.
 */
export function useMarketplaceMerchants() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-merchants'],
    queryFn: async (): Promise<MerchantRow[]> => {
      const { data, error } = await supabase
        .from('marketplace_merchants')
        .select('*, affiliate_partners(partner_name), organizations(name, slug)')
        .order('display_name');
      if (error) throw error;
      return (data ?? []) as unknown as MerchantRow[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-merchants'] });

  const upsert = useMutation({
    mutationFn: async (p: MerchantUpsert): Promise<MerchantRow> => {
      const { data, error } = await untypedSupabase.rpc('admin_upsert_marketplace_merchant', { p });
      if (error) throw error;
      return data as MerchantRow;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedSupabase.rpc('admin_delete_marketplace_merchant', {
        p_id: id,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: async ({
      id,
      dryRun = false,
    }: {
      id: string;
      dryRun?: boolean;
    }): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke('marketplace-sync-merchants', {
        body: { merchant_id: id, max_pages: 1, dry_run: dryRun },
      });
      if (error) throw error;
      const results = (data?.results ?? []) as SyncResult[];
      return results[0] ?? { status: 'error', error: 'no result returned' };
    },
    onSuccess: invalidate,
  });

  return { ...query, upsert, remove, sync };
}

/** Affiliate-partner options for the merchant edit dialog. */
export function useAffiliatePartnerOptions() {
  return useQuery({
    queryKey: ['affiliate-partner-options'],
    queryFn: async () => {
      const { data } = await supabase
        .from('affiliate_partners')
        .select('id, partner_name')
        .order('partner_name');
      return data ?? [];
    },
  });
}

/** Organization options for the merchant edit dialog. */
export function useOrganizationOptions() {
  return useQuery({
    queryKey: ['seller-org-options'],
    queryFn: async () => {
      const { data } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name')
        .limit(500);
      return data ?? [];
    },
  });
}

export interface SellerOrg {
  id: string;
  name: string;
  slug: string;
  website_domain: string | null;
  roles: string[];
}

/** Organizations carrying the seller role, for the vendors hub Orgs tab. */
export function useSellerOrgs() {
  return useQuery({
    queryKey: ['seller-orgs'],
    queryFn: async (): Promise<SellerOrg[]> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, website_domain, roles')
        .contains('roles', ['seller'])
        .order('name');
      if (error) throw error;
      return (data ?? []) as SellerOrg[];
    },
  });
}
