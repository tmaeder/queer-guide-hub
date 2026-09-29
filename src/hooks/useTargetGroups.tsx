import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTargetGroups() {
  const [targetGroups, setTargetGroups] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * The mount effect fires an unawaited fetch, so its `setState` calls can land
   * after the consumer has gone. In the browser that is a wasted render on a
   * dead tree; under vitest the jsdom environment is torn down with the test
   * file, so the same write reaches react-dom with no `window` and surfaces as
   * an unhandled `ReferenceError: window is not defined` attributed to whichever
   * page test happened to be running — every assertion passes and the run still
   * exits 1. Guard the writes rather than asking each test to drain the promise:
   * both consumers (`useVenueFilters`, `useEventFilters`) sit on pages a user
   * can navigate away from mid-fetch.
   */
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const fetchTargetGroups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('target_groups')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      if (alive.current) setTargetGroups(data || []);
    } catch (error) {
      console.error('Error fetching target groups:', error);
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    fetchTargetGroups();
  }, []);

  return {
    targetGroups,
    loading,
    fetchTargetGroups,
  };
}
