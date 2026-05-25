import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAdminFullEditRow(
  tableName: string | undefined,
  contentId: string,
  enabled: boolean,
  seed: Record<string, unknown> | undefined,
) {
  const [data, setData] = useState<Record<string, unknown>>(seed ?? {});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !tableName) return;
    if (seed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setData(seed);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error } = await supabase
        .from(tableName as 'venues')
        .select('*')
        .eq('id', contentId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (!error && row) setData(row as Record<string, unknown>);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tableName, contentId, seed]);

  return { data, setData, loading };
}
