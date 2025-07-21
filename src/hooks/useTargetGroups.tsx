import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTargetGroups() {
  const [targetGroups, setTargetGroups] = useState<any[]>([]);
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
    fetchTargetGroups();
  }, []);

  return {
    targetGroups,
    loading,
    fetchTargetGroups
  };
}