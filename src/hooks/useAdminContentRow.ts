import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lazy fetch a single content row (`select * where id = contentId`) for
 * inline-edit surfaces that don't have seed data passed in. Moved out of
 * AdminFullEditSheet so the supabase query lives in src/hooks/ per the
 * queerguide/no-supabase-from-in-pages guard.
 */
export function useAdminContentRow(
  tableName: string | undefined,
  contentId: string,
  enabled: boolean,
) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !tableName) return;
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
  }, [enabled, tableName, contentId]);

  return { data, loading };
}
