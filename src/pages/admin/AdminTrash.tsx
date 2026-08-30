import { useState } from 'react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { getContentTypeIds, getContentType } from '@/config/contentTypes';
import { TRASH_RETENTION_DAYS } from '@/hooks/useEntityLifecycle';
import { useAdminTrash, trashRowTitle, daysLeft, type TrashRow } from '@/hooks/useAdminTrash';

/**
 * Trash — every content row `delete_entity` removed that can still be restored,
 * across all types in one place.
 *
 * The per-type list already offers restore on its own rows, but only for a type
 * you already thought to open. The recovery case is the opposite: something is
 * missing and nobody remembers which type it was.
 *
 * What this screen must NOT do is imply permanence. A snapshot is one row: it
 * does not carry back whatever cascaded away with it, nor an image or search
 * embedding a cleanup job has since reclaimed, and the retention cron nulls it
 * after the window. The countdown is shown per row for that reason.
 */

/**
 * `lifecycle.type` ('news') → the registry's plural label ('News articles').
 * `ContentTypeConfig.label` is `{ singular, plural }`, and these are group
 * headings over a list, so plural is the right half.
 */
const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  getContentTypeIds().flatMap((id) => {
    const c = getContentType(id);
    return c?.lifecycle?.type ? [[c.lifecycle.type, c.label?.plural ?? id]] : [];
  }),
);

function TrashItem({
  row,
  onRestore,
  busy,
}: {
  row: TrashRow;
  onRestore: (id: number) => void;
  busy: boolean;
}) {
  const left = daysLeft(row);
  return (
    <li className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="m-0 truncate text-13 font-bold">{trashRowTitle(row)}</p>
        <p className="m-0 text-2xs text-muted-foreground">
          Deleted {new Date(row.created_at).toLocaleDateString()}
          {row.reason ? ` · ${row.reason}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* An expiring snapshot is the one thing on this screen with a
            deadline, so it is the one thing that gets a destructive colour. */}
        <Badge variant={left <= 5 ? 'destructive' : 'secondary'}>
          {left === 0 ? 'expiring' : `${left}d left`}
        </Badge>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRestore(row.id)}>
          <ArchiveRestore size={14} className="mr-1" />
          Restore
        </Button>
      </div>
    </li>
  );
}

export default function AdminTrash() {
  const { byType, rows, isLoading, error, restore, busy } = useAdminTrash();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <AdminArchetypeHeader className="mb-0" title="Trash" />

      <p className="m-0 max-w-reading text-13 leading-relaxed text-muted-foreground">
        Content deleted from the admin, restorable for {TRASH_RETENTION_DAYS} days. Restoring puts
        the row back at its original id, so its slug and inbound links work again — but only the row
        itself. Anything that cascaded away with it, and images or search embeddings a cleanup job
        has since reclaimed, do not come back. Deleted accounts are not listed here: they keep no
        snapshot by design.
      </p>

      {isLoading && <AdminTextSkeleton />}

      {error && (
        <Card>
          <CardContent className="py-6 text-13 text-destructive">
            Could not load the trash: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <Card>
          <CardContent className="py-6 text-13 text-muted-foreground">
            Nothing deleted in the last {TRASH_RETENTION_DAYS} days.
          </CardContent>
        </Card>
      )}

      {byType.map(([type, list]) => {
        const isOpen = open === type;
        return (
          <Card key={type}>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setOpen(isOpen ? null : type)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(isOpen ? null : type);
                }
              }}
              aria-expanded={isOpen}
            >
              <CardTitle className="flex items-center gap-2 text-title">
                <Trash2 size={16} />
                {TYPE_LABELS[type] ?? type}
                <Badge variant="secondary">{list.length}</Badge>
              </CardTitle>
            </CardHeader>
            {isOpen && (
              <CardContent>
                <ul className="m-0 list-none p-0">
                  {list.map((r) => (
                    <TrashItem key={r.id} row={r} onRestore={restore} busy={busy} />
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
