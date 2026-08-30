/**
 * Archive / Restore / Delete for one row in the registry-driven admin list.
 *
 * Before this, `/admin/content/:type` had no delete at any level across 26
 * content types, and its Archive button wrote `workflow_state` into the
 * `cms_content_metadata` sidecar — a table no public query reads and the list
 * itself does not join, so archiving a venue changed nothing.
 *
 * Actions go through `archive_entity` / `restore_entity` / `delete_entity`,
 * which hold the per-type semantics and write `admin_lifecycle_audit`.
 */
import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEntityLifecycle, isArchived, TRASH_RETENTION_DAYS } from '@/hooks/useEntityLifecycle';
import type { ContentLifecycleConfig } from '@/types/cms';

interface RowLifecycleActionsProps {
  lifecycle: ContentLifecycleConfig;
  row: Record<string, unknown>;
  id: string;
  title: string;
  onDone: () => void;
}

export function RowLifecycleActions({
  lifecycle,
  row,
  id,
  title,
  onDone,
}: RowLifecycleActionsProps) {
  const { archive, restore, remove, busy } = useEntityLifecycle(lifecycle);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');

  const archived = isArchived(row, lifecycle);
  const canArchive = Boolean(lifecycle.archive);
  const canDelete = lifecycle.deletable !== false;

  const run = async (fn: Promise<boolean>) => {
    if (await fn) onDone();
  };

  return (
    <>
      {canArchive && !archived && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={`Archive ${title}`}
              disabled={busy}
              onClick={(e) => {
                // The row itself opens the editor; without this every action
                // would also navigate away.
                e.stopPropagation();
                void run(archive(id));
              }}
            >
              <Archive size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive — hides it from the site, reversible</TooltipContent>
        </Tooltip>
      )}

      {canArchive && archived && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={`Restore ${title}`}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                void run(restore(id));
              }}
            >
              <ArchiveRestore size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restore — comes back unpublished for review</TooltipContent>
        </Tooltip>
      )}

      {canDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={`Delete ${title}`}
              disabled={busy}
              style={{ color: 'hsl(var(--destructive))' }}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {canArchive && !archived
                ? 'Archiving hides it from the site and can be undone at any time. Delete removes the row.'
                : 'This removes the row.'}{' '}
              A full copy is kept for {TRASH_RETENTION_DAYS} days so it can be restored — but only
              the row itself. Anything that cascaded away with it, and images or search embeddings a
              cleanup job has since reclaimed, do not come back.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-reason" className="text-xs">
              Reason (recorded in the audit log)
            </Label>
            <Input
              id="lifecycle-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being deleted?"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={async () => {
                if (await remove(id, reason.trim() || undefined)) {
                  setConfirmDelete(false);
                  setReason('');
                  onDone();
                }
              }}
              style={{
                backgroundColor: 'hsl(var(--destructive))',
                color: 'hsl(var(--track-ring))',
              }}
            >
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
