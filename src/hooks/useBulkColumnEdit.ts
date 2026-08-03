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

/**
 * Columns no bulk edit may write, by table.
 *
 * `cities.country_id` moves a city between countries, and that decides
 * `location_is_high_risk()` → `safety_gated` on every venue, event, hotel and
 * organization attached to it. No trigger on `cities` repropagates the change,
 * so a bulk edit here silently leaves children pointing at the old country with
 * a stale gate — which can expose content in a criminalizing country. Country
 * moves go through the evidence-backed repair path instead, which repropagates
 * and re-runs `recompute_safety_gated_for_country`.
 */
const BLOCKED_BULK_COLUMNS: Record<string, readonly string[]> = {
  cities: ['country_id'],
};

export function useBulkColumnEdit() {
  return useCallback(
    async (
      tableName: string,
      ids: string[],
      column: string,
      value: unknown,
    ): Promise<{ error: string | null }> => {
      if (ids.length === 0) return { error: null };
      if (BLOCKED_BULK_COLUMNS[tableName]?.includes(column)) {
        return {
          error:
            `"${column}" cannot be bulk-edited on ${tableName}: it changes safety gating ` +
            `for every attached venue, event and hotel. Use the geography repair tools.`,
        };
      }
      const { error } = await supabase
        .from(tableName as 'venues')
        .update({ [column]: value } as never)
        .in('id', ids);
      return { error: error?.message ?? null };
    },
    [],
  );
}
