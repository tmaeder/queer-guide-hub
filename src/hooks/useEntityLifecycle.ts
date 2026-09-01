/**
 * Archive / restore / delete for one content row, through the SQL dispatchers.
 *
 * These deliberately do NOT touch tables directly. Every archive convention in
 * this schema differs (`review_status='archived'` for venues, `shell_status='ghost'`
 * for cities, `status='cancelled'` for events…), and each type's existing
 * archive RPC also writes a prior-state snapshot its restore counterpart reads.
 * A `.update({ status: 'archived' })` from the client would write the column
 * and skip the snapshot, leaving a row that can be archived but not restored.
 *
 * Deletes snapshot the whole row into `admin_lifecycle_audit` first, which is
 * the only way back — there is no unmerge for a delete.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { ContentLifecycleConfig } from '@/types/cms';

/** How long a deleted row can still be restored from its snapshot. */
export const TRASH_RETENTION_DAYS = 30;

export function isArchived(
  row: Record<string, unknown>,
  lifecycle: ContentLifecycleConfig | undefined,
): boolean {
  const archive = lifecycle?.archive;
  if (!archive) return false;
  const cell = row[archive.column];
  // 'present' is for `archived_at`, where the column is a timestamp and any
  // non-null value means archived. Comparing it to a sentinel string would
  // report every archived hotel as live.
  if (archive.predicate === 'present') return cell !== null && cell !== undefined;
  return cell === archive.value;
}

export function useEntityLifecycle(lifecycle: ContentLifecycleConfig | undefined) {
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>, okMessage: string): Promise<boolean> => {
      setBusy(true);
      try {
        const { error } = await untypedRpc(fn, args);
        // untypedRpc hands back a plain `{ message }`, not an Error. The
        // dispatchers refuse with specific, actionable messages
        // ("unsupported_type: …", "use admin_delete_tag() for tags"), so the
        // message is the useful part — show it rather than a generic failure.
        if (error) {
          toast.error(error.message, { duration: 10_000 });
          return false;
        }
        toast.success(okMessage);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Action failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const archive = useCallback(
    (id: string, reason?: string) => {
      if (!lifecycle?.archive) {
        toast.error('This content type has no archived state.');
        return Promise.resolve(false);
      }
      return call(
        'archive_entity',
        { p_type: lifecycle.type, p_id: id, p_reason: reason ?? null },
        'Archived',
      );
    },
    [call, lifecycle],
  );

  const restore = useCallback(
    (id: string) => {
      if (!lifecycle) return Promise.resolve(false);
      return call('restore_entity', { p_type: lifecycle.type, p_id: id }, 'Restored');
    },
    [call, lifecycle],
  );

  const remove = useCallback(
    (id: string, reason?: string) => {
      if (!lifecycle) return Promise.resolve(false);
      return call(
        'delete_entity',
        { p_type: lifecycle.type, p_id: id, p_reason: reason ?? null },
        'Deleted',
      );
    },
    [call, lifecycle],
  );

  const restoreDeleted = useCallback(
    (auditId: number) => call('restore_deleted_entity', { p_audit_id: auditId }, 'Restored'),
    [call],
  );

  return { archive, restore, remove, restoreDeleted, busy };
}
