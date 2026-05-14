/**
 * RevisionHistory
 * Full timeline of revisions for a content item.
 * Each revision shows revision number, change summary, author, and timestamp.
 * Supports viewing diffs and restoring revisions.
 */

import { useEffect, useState } from 'react';
import { History, Eye, RotateCcw, Clock, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCMSRevisions } from '@/hooks/useCMSRevisions';
import type { CMSRevision } from '@/types/cms';
import { RevisionDiff } from './RevisionDiff';

/** Relative time formatter */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

interface RevisionHistoryProps {
  sourceTable: string;
  sourceId: string;
}

export function RevisionHistory({ sourceTable, sourceId }: RevisionHistoryProps) {
  const { revisions, loading, error, loadRevisions, restoreRevision, diffRevisions } =
    useCMSRevisions();

  const [selectedDiff, setSelectedDiff] = useState<Record<string, { old: unknown; new: unknown }> | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<CMSRevision | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadRevisions(sourceTable, sourceId);
  }, [sourceTable, sourceId, loadRevisions]);

  const handleViewDiff = (revision: CMSRevision, index: number) => {
    if (revision.changes && Object.keys(revision.changes).length > 0) {
      setSelectedDiff(revision.changes);
      return;
    }

    const prevRevision = revisions[index + 1];
    if (prevRevision) {
      const diffs = diffRevisions(prevRevision, revision);
      const changesMap: Record<string, { old: unknown; new: unknown }> = {};
      for (const d of diffs) {
        changesMap[d.field] = { old: d.oldValue, new: d.newValue };
      }
      setSelectedDiff(changesMap);
    } else {
      const changesMap: Record<string, { old: unknown; new: unknown }> = {};
      const snapshot = revision.snapshot || {};
      for (const [key, val] of Object.entries(snapshot)) {
        if (!['id', 'created_at', 'updated_at', 'created_by'].includes(key)) {
          changesMap[key] = { old: undefined, new: val };
        }
      }
      setSelectedDiff(changesMap);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setIsRestoring(true);
    const success = await restoreRevision(restoreTarget);
    setIsRestoring(false);
    setRestoreTarget(null);
    if (success) {
      await loadRevisions(sourceTable, sourceId);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>Failed to load revisions: {error}</AlertDescription>
      </Alert>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="border border-border rounded-md p-6 text-center">
        <History size={24} className="text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No revisions yet. Changes will be tracked once the content is saved.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <div className="flex flex-row items-center gap-2 mb-4">
          <History size={18} className="text-gray-500" />
          <p className="text-base font-semibold">Revision History</p>
          <span className="text-xs text-muted-foreground">
            ({revisions.length} revision{revisions.length !== 1 ? 's' : ''})
          </span>
        </div>

        {/* Diff viewer */}
        {selectedDiff && (
          <div className="mb-6">
            <RevisionDiff changes={selectedDiff} onClose={() => setSelectedDiff(null)} />
          </div>
        )}

        {/* Timeline */}
        <div className="flex flex-col">
          {revisions.map((revision, index) => {
            const authorName =
              revision.author?.display_name || revision.author?.email || 'Unknown';
            const initials = authorName
              .split(/[\s@]/)
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase() || '')
              .join('');

            return (
              <div key={revision.id}>
                <div className="flex gap-4 py-3 px-4 rounded hover:bg-muted">
                  {/* Timeline indicator */}
                  <div className="flex flex-col items-center pt-1">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: index === 0 ? 'hsl(var(--primary))' : '#9ca3af' }}
                    />
                    {index < revisions.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">
                        Revision #{revision.revision_number}
                      </p>
                      {index === 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold"
                          style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                        >
                          CURRENT
                        </span>
                      )}
                    </div>

                    {revision.change_summary && (
                      <p className="text-sm text-muted-foreground mb-1">
                        {revision.change_summary}
                      </p>
                    )}

                    <div className="flex flex-row items-center gap-3">
                      <div className="flex flex-row items-center gap-1">
                        <Avatar className="w-[18px] h-[18px]">
                          <AvatarFallback className="text-[0.55rem] bg-gray-400">
                            {initials || <User size={10} />}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          {authorName}
                        </span>
                      </div>

                      <div className="flex flex-row items-center gap-1">
                        <Clock size={12} className="text-gray-400" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(revision.created_at)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{new Date(revision.created_at).toLocaleString()}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewDiff(revision, index)}
                        className="text-xs normal-case"
                      >
                        <Eye size={14} />
                        View
                      </Button>
                      {index > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRestoreTarget(revision)}
                          className="text-xs normal-case text-amber-600"
                        >
                          <RotateCcw size={14} />
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {index < revisions.length - 1 && <Separator className="ml-9" />}
              </div>
            );
          })}
        </div>

        {/* Restore confirmation dialog */}
        <Dialog
          open={!!restoreTarget}
          onOpenChange={(open) => !open && !isRestoring && setRestoreTarget(null)}
        >
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Restore Revision</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to restore to{' '}
              <strong>Revision #{restoreTarget?.revision_number}</strong>? This will overwrite
              the current content and create a new revision entry.
            </p>
            <DialogFooter>
              <Button
                onClick={() => setRestoreTarget(null)}
                disabled={isRestoring}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRestoreConfirm}
                disabled={isRestoring}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" /> : <RotateCcw size={14} />}
                {isRestoring ? 'Restoring...' : 'Restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
