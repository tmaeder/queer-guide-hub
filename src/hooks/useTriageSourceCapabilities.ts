/**
 * Queue capabilities, read from the registry rather than restated in a component.
 *
 * `triage_sources.capabilities` already carries `external_console` — the route
 * where a queue that the generic action bar cannot decide is actually decided.
 * `TriageDetailPanel` held its own hardcoded copy of that mapping, so the SQL
 * and the UI agreed by convention only: `triage_action` has no branch for
 * `org-link-review`, and the sole thing keeping a reviewer away from the
 * resulting `unknown queue_type` was a literal in a TSX file. 99991790362096
 * makes the refusal explicit in SQL; this makes the UI stop guessing.
 *
 * `capabilities` is also where `can_reopen`, `can_bulk` and `confirm_gate`
 * live, so a later consumer has one place to read them from.
 *
 * `can_reopen` now HAS that consumer. It was declared on all 17 rows, agreed
 * exactly with `triage_action`'s real branches — true on the seven queues with
 * a reopen arm, false on the ten without — and was read by nothing, so the U
 * key fired `reopen` at every queue regardless. On the ten it matched the
 * queue branch, matched no IF arm, fell through to that function's
 * unconditional success object and returned `{"ok": true}` having written
 * nothing, while the inbox toasted "Reopened". Worst on dedup-review, whose
 * approve performs a merge: measured before the fix, 0 rows had ever returned
 * to open. 99991791361273 makes the RPC refuse it; `canReopenFor` is what
 * stops the UI offering it in the first place, so a reviewer meets a greyed
 * control rather than an error.
 */

import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface TriageSourceCapabilities {
  can_reopen?: boolean;
  can_bulk?: boolean;
  confirm_gate?: boolean;
  /** Route that owns the decision for this queue, when the inbox does not. */
  external_console?: string;
}

export interface TriageSourceRow {
  queue_key: string;
  label: string;
  capabilities: TriageSourceCapabilities | null;
}

/**
 * The whole registry is 17 small rows behind an admin-only RLS policy, so it is
 * fetched once and cached rather than queried per selected item.
 */
export function useTriageSourceCapabilities() {
  const query = useQuery({
    queryKey: ['triage-sources-capabilities'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, TriageSourceCapabilities>> => {
      const { data, error } = await untypedFrom('triage_sources')
        .select('queue_key, label, capabilities')
        .eq('active', true);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as TriageSourceRow[];
      return Object.fromEntries(rows.map((r) => [r.queue_key, r.capabilities ?? {}]));
    },
  });

  return {
    byQueue: query.data ?? {},
    loading: query.isLoading,
    /**
     * Undefined while loading AND when the queue genuinely has no external
     * console. The caller must not render an action bar on the strength of a
     * value that has not arrived yet — see the `loading` guard at the call site.
     */
    externalConsoleFor: (queueKey: string): string | undefined =>
      query.data?.[queueKey]?.external_console,
    /**
     * Whether this queue's approve/reject can be undone from the inbox.
     *
     * Defaults to FALSE while loading and for an unknown queue, deliberately:
     * the two failure directions are not symmetric. Offering undo where it
     * does not work tells a reviewer an irreversible merge was reversed;
     * withholding it where it would have worked costs one trip to the queue
     * to re-open the row by hand. `triage_action` applies the same
     * `coalesce(..., false)` to the same column, so UI and RPC refuse the
     * same set rather than agreeing by convention.
     */
    canReopenFor: (queueKey: string): boolean => query.data?.[queueKey]?.can_reopen === true,
  };
}
