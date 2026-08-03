import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Accessibility options for filtering.
 *
 * Reads `amenities` (kind='accessibility'), NOT the similarly-named
 * `accessibility_attributes` table. `events.accessibility_attributes` and
 * `venues.accessibility_attributes` store amenity *slugs* (`wheelchair-accessible`),
 * which is what `normalize_event_accessibility` emits; the `accessibility_attributes`
 * table holds display names ("Wheelchair Accessible") and has no slug column at all,
 * so filtering by its values could never match a row.
 */
export function useAccessibilityAttributes() {
  const [accessibilityAttributes, setAccessibilityAttributes] = useState<Record<string, unknown>[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  const fetchAccessibilityAttributes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('amenities')
        .select('id, slug, name')
        .eq('kind', 'accessibility')
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    fetchAccessibilityAttributes();
  }, []);

  return {
    accessibilityAttributes,
    loading,
    fetchAccessibilityAttributes,
  };
}
