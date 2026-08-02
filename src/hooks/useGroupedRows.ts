import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyFilters } from '@/components/cms/ContentListPanel/filterOps';
import type { Filter } from '@/components/cms/ContentListPanel/viewSpec';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

/**
 * True per-group counts for the board, instead of grouping the loaded page.
 *
 * The board used to group whatever 25 rows happened to be on screen, so on
 * `events` (~40k) the column counts were meaningless.
 *
 * There is deliberately no SECURITY DEFINER RPC here. Grouping is only offered
 * on closed value sets (select / boolean / workflow status), so the candidate
 * values are already known from config — no DISTINCT over a 40k table is
 * needed. One ordinary query per value returns a page of rows AND the true
 * total in one round trip, and:
 *
 *  - the filter vocabulary stays implemented ONCE, in filterOps. An RPC taking
 *    `p_filters jsonb` would mean a second implementation in SQL, guaranteed to
 *    drift from the TypeScript one.
 *  - there is no dynamic %I column interpolation, so no injection surface.
 *  - RLS and `safety_gated` apply automatically; it is the normal query path.
 */

export interface RowGroup {
  key: string;
  label: string;
  /** True total for this group under the active filters, not the page size. */
  count: number;
  rows: Record<string, unknown>[];
}

/** Rows fetched per group column. Enough to fill a board card stack. */
const ROWS_PER_GROUP = 20;
/** Above this the board stops being readable, and N queries stops being cheap. */
const MAX_GROUPS = 24;

const UNGROUPED_KEY = '__ungrouped__';

/** Candidate values for a group column, from config — never a DISTINCT scan. */
export function groupValuesFor(field: FieldConfig | undefined): { key: string; label: string }[] {
  if (!field) return [];
  if (field.type === 'boolean') {
    return [
      { key: 'true', label: 'Yes' },
      { key: 'false', label: 'No' },
    ];
  }
  return (field.options ?? []).slice(0, MAX_GROUPS).map((o) => ({
    key: String(o.value),
    label: o.label,
  }));
}

interface Args {
  config: ContentTypeConfig | null;
  groupBy: string | null;
  filters: Filter[];
  search: string;
  enabled: boolean;
}

export function useGroupedRows({ config, groupBy, filters, search, enabled }: Args) {
  const field = config?.fields.find((f) => f.name === groupBy);
  const values = groupValuesFor(field);

  const { data, isLoading } = useQuery({
    // The whole query shape is in the key, so changing a filter refetches and
    // switching back is served from cache.
    queryKey: [
      'cms-grouped-rows',
      config?.id,
      groupBy,
      search,
      JSON.stringify(filters.map((f) => [f.field, f.op, f.value ?? null])),
    ],
    enabled: enabled && !!config && !!groupBy && values.length > 0,
    queryFn: async (): Promise<RowGroup[]> => {
      const ct = config!;

      const fetchOne = async (key: string, label: string): Promise<RowGroup> => {
        let q = supabase
          .from(ct.tableName as 'events')
          .select(ct.listSelect ?? '*', { count: 'exact' })
          .range(0, ROWS_PER_GROUP - 1);

        if (search) q = q.ilike(ct.titleField, `%${search}%`);
        q = applyFilters(q as never, filters) as typeof q;

        // The group predicate is one more ordinary filter.
        q =
          key === UNGROUPED_KEY
            ? q.is(groupBy!, null)
            : q.eq(groupBy!, field?.type === 'boolean' ? key === 'true' : key);

        const { data: rows, error, count } = await q;
        if (error) throw error;
        return {
          key,
          label,
          count: count ?? 0,
          rows: (rows ?? []) as unknown as Record<string, unknown>[],
        };
      };

      // Parallel: bounded by MAX_GROUPS, and each is a small indexed count.
      const groups = await Promise.all([
        ...values.map((v) => fetchOne(v.key, v.label)),
        fetchOne(UNGROUPED_KEY, 'Ungrouped'),
      ]);

      // Empty groups are kept — "0 sold out" is information. The catch-all goes
      // last so an incomplete-data bucket never pushes real groups off-screen.
      const real = groups.filter((g) => g.key !== UNGROUPED_KEY);
      const ungrouped = groups.find((g) => g.key === UNGROUPED_KEY);
      return ungrouped && ungrouped.count > 0 ? [...real, ungrouped] : real;
    },
  });

  return { groups: data ?? null, loading: isLoading };
}
