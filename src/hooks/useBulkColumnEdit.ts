import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Writes one column across many rows of one table.
 *
 * Backs the registry's bulk-edit menu. Distinct from the bulk workflow actions,
 * which write `cms_content_metadata` — this touches the entity table itself,
 * which is the capability `AdminDataTable` had and the registry lacked.
 *
 * A single `.in()` update rather than a per-row loop: it is one statement on one
 * table, and every entity write on this instance costs a search-index sync, so
 * looping would multiply that by the size of the selection.
 */
export function useBulkColumnEdit() {
  return useCallback(
    async (
      tableName: string,
      ids: string[],
      column: string,
      value: unknown,
    ): Promise<{ error: string | null }> => {
      if (ids.length === 0) return { error: null };
      const { error } = await supabase
        .from(tableName as 'venues')
        .update({ [column]: value } as never)
        .in('id', ids);
      return { error: error?.message ?? null };
    },
    [],
  );
}
