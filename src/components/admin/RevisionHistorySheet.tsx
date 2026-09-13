import { useCallback, useEffect, useState } from 'react';
import { Bot, Clock, RotateCcw, User, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { FieldDiffView } from '@/components/admin/triage/FieldDiffView';
import { getContentType } from '@/config/contentTypes';
import {
  revisionDiffs,
  useContentRevisions,
  type ContentRevision,
} from '@/hooks/useContentRevisions';

interface RevisionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  contentId: string;
  contentName?: string;
  /** Called after a revert so the page can refetch. */
  onReverted?: () => void;
}

/** Above this, only "Revert all" is offered — see the note at the call site. */
const PER_FIELD_BUTTON_LIMIT = 8;

const OP_LABEL: Record<ContentRevision['op'], string> = {
  I: 'Created',
  U: 'Updated',
  D: 'Deleted',
};

/**
 * Revision history for one record, reachable from the public page as well as
 * the CMS.
 *
 * The history is mostly machine writes — this corpus is largely
 * cron-maintained — so the actor is a first-class part of each row rather than
 * a footnote. Revert is per field: reverting a whole row would undo every
 * enrichment applied since.
 */
export function RevisionHistorySheet({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentName,
  onReverted,
}: RevisionHistorySheetProps) {
  const config = getContentType(contentType);
  const { revisions, loading, error, load, revertFields } = useContentRevisions();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (config?.tableName && contentId) void load(config.tableName, contentId);
  }, [config?.tableName, contentId, load]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const onRevert = useCallback(
    async (rev: ContentRevision, fields: string[]) => {
      setReverting(rev.id);
      try {
        const result = await revertFields(rev.id, fields);
        if (result.reverted.length > 0) {
          toast.success(`Reverted ${result.reverted.join(', ')}`);
          onReverted?.();
        }
        // The refusals are the point, not an edge case: a field whose live
        // value moved on is left alone, and saying so is what makes revert
        // safe to offer at all.
        for (const s of result.skipped) {
          toast.warning(
            s.reason === 'value_moved_on'
              ? `${s.field} was not reverted — it has changed since this revision`
              : `${s.field} was not reverted (${s.reason})`,
          );
        }
        if (result.reverted.length === 0 && result.skipped.length === 0) {
          toast.info('Nothing to revert');
        }
        refresh();
      } catch (err) {
        toast.error(`Revert failed: ${(err as Error).message}`);
      } finally {
        setReverting(null);
      }
    },
    [revertFields, onReverted, refresh],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
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
                  reverting={reverting === rev.id}
                  onToggle={() => setExpanded(expanded === rev.id ? null : rev.id)}
                  onRevert={onRevert}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActorBadge({ revision }: { revision: ContentRevision }) {
  const name = revision.author?.display_name || revision.author?.email;
  if (revision.actor_kind === 'human') {
    return (
      <Badge variant="outline" className="gap-1 text-2xs">
        <User size={10} />
        {name ?? 'Admin'}
        {revision.actor === 'admin:revert' ? ' · revert' : ''}
      </Badge>
    );
  }
  if (revision.actor_kind === 'declared') {
    return (
      <Badge variant="outline" className="gap-1 text-2xs">
        <Wrench size={10} />
        {revision.actor ?? 'Script'}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-2xs">
      <Bot size={10} />
      Automated
    </Badge>
  );
}

function RevisionRow({
  revision,
  expanded,
  reverting,
  onToggle,
  onRevert,
}: {
  revision: ContentRevision;
  expanded: boolean;
  reverting: boolean;
  onToggle: () => void;
  onRevert: (rev: ContentRevision, fields: string[]) => void;
}) {
  const diffs = revisionDiffs(revision);

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
            <span className="text-xs font-semibold">{OP_LABEL[revision.op]}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(revision.created_at).toLocaleString()}
            </span>
            <ActorBadge revision={revision} />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {revision.changed_fields.slice(0, 4).join(', ')}
            {revision.changed_fields.length > 4
              ? ` and ${revision.changed_fields.length - 4} more`
              : ''}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border-hairline">
          <FieldDiffView diffs={diffs} />
          {/* Only an update can be put back field by field. A create has no
              previous state, and a delete needs the row re-created — the RPC
              refuses both, so offering the button would be a lie. */}
          {revision.op === 'U' && (
            <div className="flex flex-wrap gap-2 p-2">
              <Button
                variant="outline"
                size="sm"
                disabled={reverting}
                onClick={() => onRevert(revision, revision.changed_fields)}
              >
                <RotateCcw size={14} className="mr-1.5" />
                Revert all {revision.changed_fields.length} field(s)
              </Button>
              {/* Per-field buttons only while they are still scannable. A bulk
                  backfill can touch a dozen columns at once, and a wall of
                  buttons is not a choice, it is a search problem. */}
              {revision.changed_fields.length > 1 &&
                revision.changed_fields.length <= PER_FIELD_BUTTON_LIMIT &&
                revision.changed_fields.map((f) => (
                  <Button
                    key={f}
                    variant="outline"
                    size="sm"
                    disabled={reverting}
                    onClick={() => onRevert(revision, [f])}
                  >
                    <RotateCcw size={14} className="mr-1.5" />
                    {f}
                  </Button>
                ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
