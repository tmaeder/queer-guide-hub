import { useState } from 'react';
import { MoreHorizontal } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { isArchived, useEntityLifecycle, TRASH_RETENTION_DAYS } from '@/hooks/useEntityLifecycle';
import type { ContentTypeConfig } from '@/types/cms';
import type { WorkspaceAction } from './workspaceTypes';
import type { ListItem } from './types';
export function WorkspaceRowMenu({
  item,
  config,
  operational,
  onEdit,
  actions = [],
  refresh,
}: {
  item: ListItem;
  config: ContentTypeConfig | null;
  operational?: boolean;
  onEdit: () => void;
  actions?: WorkspaceAction[];
  refresh: () => void;
}) {
  const lifecycle = operational ? undefined : config?.lifecycle;
  const { archive, restore, remove, busy } = useEntityLifecycle(lifecycle);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const done = async (operation: Promise<boolean>) => {
    if (await operation) refresh();
  };
  const href = config?.publicPath?.(item.raw ?? {});
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0"
            aria-label={`Actions for ${item.title}`}
          >
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            Open {config?.label.singular.toLowerCase() ?? 'record'}
          </DropdownMenuItem>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              disabled={action.disabled || busy}
              className={action.destructive ? 'text-destructive' : undefined}
              onSelect={() => void action.run()}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
          {href && (
            <DropdownMenuItem onSelect={() => window.open(href, '_blank', 'noopener,noreferrer')}>
              View public page
            </DropdownMenuItem>
          )}
          {lifecycle && (
            <>
              <DropdownMenuSeparator />
              {lifecycle.archive && (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() =>
                    void done(
                      isArchived(item.raw ?? {}, lifecycle) ? restore(item.id) : archive(item.id),
                    )
                  }
                >
                  {isArchived(item.raw ?? {}, lifecycle) ? 'Restore' : 'Archive'}
                </DropdownMenuItem>
              )}
              {lifecycle.deletable !== false && (
                <DropdownMenuItem
                  disabled={busy}
                  className="text-destructive"
                  onSelect={() => setDeleting(true)}
                >
                  Delete…
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {item.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record. A copy of the row is kept for {TRASH_RETENTION_DAYS} days;
              deleted images and cascaded data are not restored. Add a reason for the audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label="Deletion reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (await remove(item.id, reason.trim())) {
                  setDeleting(false);
                  refresh();
                }
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
