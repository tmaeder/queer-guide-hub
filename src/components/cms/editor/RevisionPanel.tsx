/**
 * RevisionPanel
 * Compact sidebar panel showing the last 5 revisions.
 * Designed for the editor sidebar. Has a "View all" button to expand full history.
 */

import { useEffect, useState } from 'react';
import { History, Clock, X } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCMSRevisions } from '@/hooks/useCMSRevisions';
import { RevisionHistory } from '@/components/cms/revisions/RevisionHistory';

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

interface RevisionPanelProps {
  sourceTable: string;
  sourceId: string;
}

export function RevisionPanel({ sourceTable, sourceId }: RevisionPanelProps) {
  const { revisions, loading, loadRevisions } = useCMSRevisions();
  const [showFullHistory, setShowFullHistory] = useState(false);

  useEffect(() => {
    loadRevisions(sourceTable, sourceId);
  }, [sourceTable, sourceId, loadRevisions]);

  const recentRevisions = revisions.slice(0, 5);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <div className="flex flex-row items-center gap-2 mb-3">
          <History size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Revisions
          </span>
        </div>

        {recentRevisions.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No revisions yet.
          </span>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {recentRevisions.map((revision) => (
              <div
                key={revision.id}
                className="py-2 px-1 hover:bg-accent rounded-badge"
              >
                <div className="flex flex-row items-center justify-between">
                  <span className="text-xs font-semibold">
                    #{revision.revision_number}
                  </span>
                  <div className="flex flex-row items-center gap-1">
                    <Clock size={10} className="text-gray-400" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[0.7rem] text-muted-foreground">
                          {formatRelativeTime(revision.created_at)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{new Date(revision.created_at).toLocaleString()}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {revision.change_summary && (
                  <span
                    className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.7rem] text-muted-foreground mt-0.5"
                  >
                    {revision.change_summary}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {revisions.length > 5 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFullHistory(true)}
            className="mt-2 text-xs w-full"
          >
            View all {revisions.length} revisions
          </Button>
        )}

        {revisions.length > 0 && revisions.length <= 5 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFullHistory(true)}
            className="mt-2 text-xs w-full"
          >
            View full history
          </Button>
        )}
      </div>

      {/* Full history dialog */}
      <Dialog open={showFullHistory} onOpenChange={setShowFullHistory}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Revision History</DialogTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => setShowFullHistory(false)}
              >
                <X size={18} />
              </Button>
            </div>
          </DialogHeader>
          <RevisionHistory sourceTable={sourceTable} sourceId={sourceId} />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
