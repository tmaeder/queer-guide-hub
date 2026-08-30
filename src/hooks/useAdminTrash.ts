/**
 * The cross-type Trash: everything `delete_entity` removed that can still be
 * put back.
 *
 * Reads `admin_lifecycle_audit` directly rather than through an RPC — the table
 * already carries an admin/moderator-only RLS read policy, so a SECURITY
 * DEFINER wrapper would add a second gate to maintain and nothing else.
 *
 * `untypedFrom` because the table is not in the generated `types.ts`.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { TRASH_RETENTION_DAYS, useEntityLifecycle } from './useEntityLifecycle';

export interface TrashRow {
  id: number;
  entity_type: string;
  entity_id: string;
  actor: string | null;
  reason: string | null;
  created_at: string;
  row_snapshot: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}

/**
 * A deleted row's human name. The snapshot is a whole-table jsonb copy and the
 * title column differs per type, so this walks the candidates the CMS itself
 * uses rather than assuming one. Falls back to the id: showing "Untitled" for
 * a row that does have a name would be worse than showing something ugly and
 * true.
 */
export function trashRowTitle(row: TrashRow): string {
  const s = row.row_snapshot;
  if (!s) return row.entity_id;
  for (const k of ['title', 'name', 'headline', 'slug']) {
    const v = s[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return row.entity_id;
}

/** Days left before the retention cron nulls the snapshot and restore stops working. */
export function daysLeft(row: TrashRow): number {
  const age = (Date.now() - new Date(row.created_at).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - age));
}

export function useAdminTrash() {
  const queryClient = useQueryClient();
  const { restoreDeleted, busy } = useEntityLifecycle(undefined);

  const query = useQuery({
    queryKey: ['admin-trash'],
    queryFn: async (): Promise<TrashRow[]> => {
      // `restored_at is null` and `row_snapshot not null` together are what
      // "restorable" means: a row already put back must not offer a second
      // restore (restore_deleted_entity refuses it anyway), and one whose
      // snapshot the retention cron has expired can no longer be rebuilt.
      const { data, error } = await untypedFrom('admin_lifecycle_audit')
        .select('id, entity_type, entity_id, actor, reason, created_at, row_snapshot, details')
        .eq('action', 'delete')
        .is('restored_at', null)
        .not('row_snapshot', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TrashRow[];
    },
  });

  const byType = useMemo(() => {
    const m = new Map<string, TrashRow[]>();
    for (const r of query.data ?? []) {
      const list = m.get(r.entity_type) ?? [];
      list.push(r);
      m.set(r.entity_type, list);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [query.data]);

  const restore = useCallback(
    async (auditId: number) => {
      const ok = await restoreDeleted(auditId);
      if (ok) await queryClient.invalidateQueries({ queryKey: ['admin-trash'] });
      return ok;
    },
    [restoreDeleted, queryClient],
  );

  return { rows: query.data ?? [], byType, isLoading: query.isLoading, error: query.error, restore, busy };
}
