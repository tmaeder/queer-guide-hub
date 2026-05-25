import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTargetGroups() {
  const [targetGroups, setTargetGroups] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTargetGroups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('target_groups')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setTargetGroups(data || []);
    } catch (error) {
      console.error('Error fetching target groups:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    fetchTargetGroups();
  }, []);

  return {
    targetGroups,
    loading,
    fetchTargetGroups
  };
}