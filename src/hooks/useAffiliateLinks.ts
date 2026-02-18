import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AffiliatePartner } from '@/lib/affiliate';
import type { Database } from '@/integrations/supabase/types';

type PartnerRow = Database['public']['Tables']['affiliate_partners']['Row'];
type PartnerInsert = Database['public']['Tables']['affiliate_partners']['Insert'];

function rowToPartner(row: PartnerRow): AffiliatePartner {
  return {
    ...row,
    parameters: (row.parameters ?? {}) as Record<string, string>,
  };
}

export function useAffiliateLinks() {
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('affiliate_partners')
        .select('*')
        .order('partner_name');
      if (err) throw err;
      setPartners((data ?? []).map(rowToPartner));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch partners');
    } finally {
      setLoading(false);
    }
  }, []);

  const createPartner = useCallback(async (partner: PartnerInsert) => {
    const { data, error } = await supabase.from('affiliate_partners').insert(partner).select().single();
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

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  return { partners, loading, error, fetchPartners, createPartner, updatePartner, deletePartner };
}
