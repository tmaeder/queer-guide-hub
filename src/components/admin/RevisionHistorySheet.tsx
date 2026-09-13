import { useEffect, useState } from 'react';
import { Clock, User, Bot } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { FieldDiffView } from '@/components/admin/triage/FieldDiffView';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { getContentType } from '@/config/contentTypes';
import { useCMSRevisions } from '@/hooks/useCMSRevisions';
import type { CMSRevision } from '@/types/cms';

interface RevisionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  contentId: string;
  contentName?: string;
  /** Called after a revert so the page can refetch. */
  onReverted?: () => void;
}

/**
 * Revision history for one record, reachable from the public page as well as
 * the CMS.
 *
 * Until now the only history surface was a read-only list buried in the editor
 * sidebar — `useCMSRevisions` has exported `diffRevisions` and
 * `restoreRevision` since it was written and neither had a single caller, so a
 * revision could be seen but never compared or undone.
 */
export function RevisionHistorySheet({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentName,
}: RevisionHistorySheetProps) {
  const config = getContentType(contentType);
  const { revisions, loading, error, loadRevisions } = useCMSRevisions();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (open && config?.tableName && contentId) {
      void loadRevisions(config.tableName, contentId);
    }
  }, [open, config?.tableName, contentId, loadRevisions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Revision history</SheetTitle>
          <SheetDescription>
            {contentName ? `${contentName} · ` : ''}
            {config?.label.singular ?? contentType}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <TrackLoader size={24} label="Loading" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : revisions.length === 0 ? (
            <AdminEmpty variant="inline" noun="revisions for this record" />
          ) : (
            <ul className="flex flex-col gap-2">
              {revisions.map((rev) => (
                <RevisionRow
                  key={rev.id}
                  revision={rev}
                  expanded={expanded === rev.id}
                  onToggle={() => setExpanded(expanded === rev.id ? null : rev.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RevisionRow({
  revision,
  expanded,
  onToggle,
}: {
  revision: CMSRevision;
  expanded: boolean;
  onToggle: () => void;
}) {
  // An author means a person did this. Most rows in a corpus that is ~99%
  // machine-ingested will not have one, so the two must be told apart at a
  // glance rather than both reading as "someone changed this".
  const authorName = revision.author?.display_name || revision.author?.email || null;

  const diffs = Object.entries(revision.changes ?? {}).map(([field, c]) => ({
    field,
    oldValue: c.old,
    newValue: c.new,
  }));

  return (
    <li className="rounded-element border border-border-hairline">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 p-2 text-left hover:bg-muted/40"
        aria-expanded={expanded}
      >
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
          <Clock className="text-muted-foreground" size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold">#{revision.revision_number}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(revision.created_at).toLocaleString()}
            </span>
            <Badge variant="outline" className="gap-1 text-2xs">
              {authorName ? <User size={10} /> : <Bot size={10} />}
              {authorName ?? 'Automated'}
            </Badge>
          </span>
          {revision.change_summary && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {revision.change_summary}
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border-hairline">
          <FieldDiffView diffs={diffs} />
        </div>
      )}
    </li>
  );
}
