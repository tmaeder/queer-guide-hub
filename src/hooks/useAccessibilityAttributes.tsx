import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAccessibilityAttributes() {
  const [accessibilityAttributes, setAccessibilityAttributes] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAccessibilityAttributes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('accessibility_attributes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setAccessibilityAttributes(data || []);
    } catch (error) {
      console.error('Error fetching accessibility attributes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessibilityAttributes();
  }, []);

  return {
    accessibilityAttributes,
    loading,
    fetchAccessibilityAttributes
  };
}