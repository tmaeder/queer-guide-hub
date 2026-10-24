import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAdminFullEditRow(
  tableName: string | undefined,
  contentId: string,
  enabled: boolean,
  seed: Record<string, unknown> | undefined,
  /** The type's own loader, for records that are not one plain table row. */
  load?: (id: string) => Promise<Record<string, unknown>>,
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
      let row: Record<string, unknown> | null;
      if (load) {
        row = await load(contentId).catch(() => null);
      } else {
        const { data, error } = await supabase
          .from(tableName as 'venues')
          .select('*')
          .eq('id', contentId)
          .maybeSingle();
        row = error ? null : (data as Record<string, unknown> | null);
      }
      if (cancelled) return;
      setLoading(false);
      if (row) setData(row);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tableName, contentId, seed, load]);

  return { data, setData, loading };
}
