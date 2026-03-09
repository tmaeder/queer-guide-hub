import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';

export function useAccessibilityAttributes() {
  const [accessibilityAttributes, setAccessibilityAttributes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAccessibilityAttributes = async () => {
    try {
      setLoading(true);
      const { data, error } = await api
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