import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AffiliatePartner } from '@/lib/affiliate';
import type { Database } from '@/integrations/supabase/types';

type PartnerRow = Database['public']['Tables']['affiliate_partners']['Row'];
// go_key/sub_field land via migration 20260726090000 — not in generated types yet.
type PartnerInsert = Database['public']['Tables']['affiliate_partners']['Insert'] & {
  go_key?: string | null;
  sub_field?: string;
};

function rowToPartner(row: PartnerRow): AffiliatePartner {
  return {
    ...row,
    parameters: (row.parameters ?? {}) as Record<string, string>,
  };
}

const NO_PARTNERS: AffiliatePartner[] = [];

export function useAffiliateLinks() {
  const query = useQuery({
    queryKey: ['affiliate-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('affiliate_partners')
        .select('*')
        .order('partner_name');
      if (error) throw error;
      return (data ?? []).map(rowToPartner);
    },
  });
  const { refetch } = query;
  const fetchPartners = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const createPartner = useCallback(async (partner: PartnerInsert) => {
    const { data, error } = await supabase
      .from('affiliate_partners')
      .insert(partner)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, []);

  const updatePartner = useCallback(async (id: string, changes: Partial<PartnerInsert>) => {
    const { data, error } = await supabase
      .from('affiliate_partners')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, []);

  const deletePartner = useCallback(async (id: string) => {
    const { error } = await supabase.from('affiliate_partners').delete().eq('id', id);
    if (error) throw error;
  }, []);

  return {
    partners: query.data ?? NO_PARTNERS,
    loading: query.isLoading,
    error: query.error ? query.error.message || 'Failed to fetch partners' : null,
    fetchPartners,
    createPartner,
    updatePartner,
    deletePartner,
  };
}
