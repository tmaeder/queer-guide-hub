/**
 * ReviewQueue -- Shows all content items currently in "review" state across all content types.
 */

import { useEffect, useState, useCallback, useMemo, useContext } from 'react';
import {
  Clock,
  CheckCircle2,
  Edit,
  User,
  ThumbsUp,
  ThumbsDown,
  ArrowUpDown,
  Filter,
  Inbox,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  fetchCMSReviewQueueMetadata,
  fetchRecordTitle,
} from '@/hooks/useCMSContentMetadata';
import { getContentType, getContentTypeIds } from '@/config/contentTypeRegistry';
import { useCMSWorkflow } from '@/hooks/useCMSWorkflow';
import { AdminShellContext } from '@/components/admin/shell/AdminShell';
import type { CMSContentMetadata, WorkflowState } from '@/types/cms';

interface ReviewQueueItem {
  metadata: CMSContentMetadata;
  title: string;
  contentTypeName: string;
  contentTypeColor: string;
  contentTypeId: string;
  lastEditedBy: string | null;
  waitingDuration: string;
}

interface ReviewQueueProps {
  onEdit?: (contentType: string, itemId: string) => void;
}

type SortOrder = 'newest' | 'oldest';

function formatWaitingDuration(isoString: string | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHr < 24) return `${diffHr}h`;
    if (diffDay < 30) return `${diffDay}d`;
    return `${Math.floor(diffDay / 30)}mo`;
  } catch {
    return '';
  }
}

export function ReviewQueue({ onEdit: propOnEdit }: ReviewQueueProps) {
  const shellCtx = useContext(AdminShellContext);
  const onEdit = propOnEdit ?? ((ct: string, id: string) => shellCtx?.openEditor(ct, id));
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [filterContentType, setFilterContentType] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const { transition } = useCMSWorkflow('review' as WorkflowState);

  const contentTypeOptions = useMemo(() => {
    const ids = getContentTypeIds();
    return ids
      .map((id) => {
        const ct = getContentType(id);
        return ct ? { id, label: ct.label.plural } : null;
      })
      .filter(Boolean) as { id: string; label: string }[];
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const metaItems = await fetchCMSReviewQueueMetadata<CMSContentMetadata>();

      const enriched: ReviewQueueItem[] = [];
      for (const meta of metaItems) {
        const config = getContentType(meta.source_table);
        if (!config) continue;

        const record = await fetchRecordTitle(
          config.tableName,
          config.primaryKey,
          meta.source_id,
          config.titleField,
        );

        enriched.push({
          metadata: meta,
          title: record?.[config.titleField] ?? '(Untitled)',
          contentTypeName: config.label.singular,
          contentTypeColor: config.color,
          contentTypeId: config.id,
          lastEditedBy: meta.last_edited_by ?? null,
          waitingDuration: formatWaitingDuration(meta.last_edited_at),
        });
      }

      setItems(enriched);
    } catch (err) {
      console.error('Error loading review queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleApprove = useCallback(
    async (item: ReviewQueueItem) => {
      setActionLoading(item.metadata.id);
      setActionError(null);
      const success = await transition(
        item.metadata.source_table,
        item.metadata.source_id,
        'published',
      );
      setActionLoading(null);
      if (success) {
        setItems((prev) => prev.filter((i) => i.metadata.id !== item.metadata.id));
      } else {
        setActionError(`Failed to approve "${item.title}".`);
      }
    },
    [transition],
  );

  const handleReject = useCallback(
    async (item: ReviewQueueItem) => {
      const comment = window.prompt('Please provide a reason for requesting changes:');
      if (!comment?.trim()) return;

      setActionLoading(item.metadata.id);
      setActionError(null);
      const success = await transition(
        item.metadata.source_table,
        item.metadata.source_id,
        'draft',
        comment.trim(),
      );
      setActionLoading(null);
      if (success) {
        setItems((prev) => prev.filter((i) => i.metadata.id !== item.metadata.id));
      } else {
        setActionError(`Failed to reject "${item.title}".`);
      }
    },
    [transition],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.metadata.id)),
    );
  }, [items]);

  const handleBulkApprove = useCallback(async () => {
    const targets = items.filter((i) => selectedIds.has(i.metadata.id));
    if (targets.length === 0) return;

    setBulkLoading(true);
    setActionError(null);
    let successCount = 0;

    for (const item of targets) {
      const ok = await transition(item.metadata.source_table, item.metadata.source_id, 'published');
      if (ok) successCount++;
    }

    setBulkLoading(false);
    setSelectedIds(new Set());

    if (successCount > 0) {
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.metadata.id)));
    }
    if (successCount < targets.length) {
      setActionError(`${targets.length - successCount} item(s) failed to approve.`);
    }
  }, [items, selectedIds, transition]);

  const handleApproveAll = useCallback(async () => {
    if (items.length === 0) return;

    setBulkLoading(true);
    setActionError(null);

    for (const item of items) {
      await transition(item.metadata.source_table, item.metadata.source_id, 'published');
    }

    setBulkLoading(false);
    setSelectedIds(new Set());
    loadQueue();
  }, [items, transition, loadQueue]);

  const displayItems = useMemo(() => {
    let filtered = items;
    if (filterContentType !== 'all') {
      filtered = filtered.filter((i) => i.contentTypeId === filterContentType);
    }
    if (sortOrder === 'oldest') {
      filtered = [...filtered].reverse();
    }
    return filtered;
  }, [items, filterContentType, sortOrder]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Loader2 className="h-9 w-9 animate-spin" aria-label="Loading" />
        <p className="text-sm text-muted-foreground">Loading review queue...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1.5">
        <div>
          <h5 className="text-2xl font-bold mb-0.5">Review Queue</h5>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex gap-1 items-center">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                disabled={bulkLoading}
                onClick={handleBulkApprove}
                className="font-semibold text-[0.8rem] bg-green-600 hover:bg-green-700 text-white"
              >
                {bulkLoading ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : (
                  <CheckCheck size={14} className="mr-1" />
                )}
                Approve Selected ({selectedIds.size})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={handleApproveAll}
              className="font-semibold text-[0.8rem] border-green-600 text-green-600 hover:bg-green-50"
            >
              {bulkLoading ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <CheckCheck size={14} className="mr-1" />
              )}
              Approve All ({items.length})
            </Button>
          </div>
        )}
      </div>

      {/* Action error */}
      {actionError && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <div className="flex items-center gap-0.5">
            <Checkbox
              checked={selectedIds.size === displayItems.length && displayItems.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-[0.8rem] text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </span>
          </div>
          <div className="min-w-[180px]">
            <Label className="text-xs flex items-center gap-0.5 mb-1">
              <Filter className="w-3.5 h-3.5" />
              Content Type
            </Label>
            <Select value={filterContentType} onValueChange={setFilterContentType}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {contentTypeOptions.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Label className="text-xs flex items-center gap-0.5 mb-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Sort
            </Label>
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Empty State */}
      {displayItems.length === 0 && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-2.5 opacity-90"
            style={{ backgroundColor: '#16a34a', boxShadow: '0 0 0 8px rgba(22,163,74,0.1)' }}
          >
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h6 className="text-lg font-semibold mb-0.5">All caught up!</h6>
          <p className="text-sm text-muted-foreground max-w-[320px]">
            There are no items pending review. New submissions will appear here when editors submit content for approval.
          </p>
        </div>
      ) : displayItems.length === 0 && items.length > 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Inbox className="w-9 h-9 opacity-30 mb-2" />
          <p className="text-sm text-muted-foreground">No items match the selected filter.</p>
        </div>
      ) : (
        <div className="relative pl-4">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-border rounded" />

          {displayItems.map((item, idx) => {
            const isActionLoading = actionLoading === item.metadata.id;

            return (
              <div
                key={item.metadata.id}
                className="relative"
                style={{ paddingBottom: idx < displayItems.length - 1 ? '12px' : 0 }}
              >
                {/* Timeline dot */}
                <div
                  className="absolute -left-7 top-4 w-3 h-3 rounded-full border-2 z-[1]"
                  style={{
                    backgroundColor: item.contentTypeColor,
                    borderColor: 'hsl(var(--background))',
                    boxShadow: '0 0 0 2px hsl(var(--border))',
                  }}
                />

                {/* Card */}
                <div
                  className={`p-2 rounded-element border bg-card transition-[border-color,box-shadow] duration-150 cursor-pointer hover:border-primary hover:shadow-sm ${selectedIds.has(item.metadata.id) ? 'border-primary' : 'border-border'}`}
                  onClick={() => onEdit(item.metadata.source_table, item.metadata.source_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onEdit(item.metadata.source_table, item.metadata.source_id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <Checkbox
                        checked={selectedIds.has(item.metadata.id)}
                        onCheckedChange={() => toggleSelect(item.metadata.id)}
                      />
                    </div>
                    <p className="text-base font-semibold flex-1">{item.title}</p>
                    <Badge
                      className="h-[22px] text-[0.7rem] font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: item.contentTypeColor + '18',
                        color: item.contentTypeColor,
                      }}
                    >
                      {item.contentTypeName}
                    </Badge>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mb-1.5">
                    {item.lastEditedBy && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <User className="w-3 h-3" />
                        Submitted by {item.lastEditedBy.slice(0, 8)}...
                      </span>
                    )}
                    {item.metadata.last_edited_at && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            Waiting {item.waitingDuration}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{new Date(item.metadata.last_edited_at).toLocaleString()}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div
                    className="flex items-center gap-1 pt-1 border-t border-border"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <Button
                      size="sm"
                      disabled={isActionLoading}
                      onClick={() => handleApprove(item)}
                      className="font-semibold text-[0.8rem] py-0.5 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isActionLoading ? (
                        <Loader2 size={14} className="animate-spin mr-1" aria-label="Loading" />
                      ) : (
                        <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                      )}
                      Approve
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isActionLoading}
                      onClick={() => handleReject(item)}
                      className="font-medium text-[0.8rem] py-0.5 border-destructive text-destructive hover:bg-destructive/10"
                    >
                      <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                      Request Changes
                    </Button>

                    <div className="flex-1" />

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(item.metadata.source_table, item.metadata.source_id)}
                          className="font-medium text-[0.8rem] text-muted-foreground"
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />
                          Review
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open in editor</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
