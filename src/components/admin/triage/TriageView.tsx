import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Maximize2, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useUnifiedTriageQueue,
  useTriageAction,
  useHighConfCount,
  useBulkApproveHighConf,
  type TriageFilters,
} from '@/hooks/useUnifiedTriageQueue';
import { useReviewCounts } from '@/hooks/useReviewCounts';
import { ReviewBulkBar } from '@/components/admin/review/ReviewBulkBar';
import { TriageFilterBar } from './TriageFilterBar';
import { TriageList } from './TriageList';
import { TriageDetailPanel } from './TriageDetailPanel';
import { TriageFocusMode } from './TriageFocusMode';
import { useTriageKeyboard } from './useTriageKeyboard';

interface TriageViewProps {
  initialQueueType?: string;
}

export function TriageView({ initialQueueType }: TriageViewProps) {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<TriageFilters>({
    queueTypes: initialQueueType ? [initialQueueType] : null,
    contentTypes: null,
    search: '',
    sort: 'priority',
    page: 1,
    perPage: 50,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Last approve/reject, for one-step undo (U) — reopens the item in its queue.
  const [lastActed, setLastActed] = useState<{
    id: string;
    queueType: string;
    title: string;
  } | null>(null);

  const { data, isLoading, error } = useUnifiedTriageQueue(filters);
  const { data: counts } = useReviewCounts();
  const triageAction = useTriageAction();

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const activeItem = useMemo(
    () => items.find((i) => i.id === activeId) ?? null,
    [items, activeId],
  );

  function updateFilters(partial: Partial<TriageFilters>) {
    setFilters((f) => ({ ...f, ...partial }));
  }

  function handleSelect(id: string) {
    setActiveId(id);
  }

  function handleToggleCheck(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const advanceToNext = useCallback(() => {
    const idx = items.findIndex((i) => i.id === activeId);
    if (idx < items.length - 1) {
      setActiveId(items[idx + 1].id);
    } else if (idx === items.length - 1 && items.length > 1) {
      setActiveId(items[idx - 1].id);
    } else {
      setActiveId(null);
    }
  }, [items, activeId]);

  const handleAction = useCallback(
    (action: 'approve' | 'reject' | 'skip' | 'flag', notes?: string, cannedSlug?: string) => {
      if (!activeItem) return;

      if (action === 'skip') {
        advanceToNext();
        return;
      }

      triageAction.mutate(
        {
          itemId: activeItem.id,
          queueType: activeItem.queue_type,
          action,
          notes,
          cannedSlug,
        },
        {
          onSuccess: () => {
            toast.success(`${action}d: ${activeItem.title.slice(0, 40)}`);
            // Only approve/reject remove the item from the queue → undoable.
            if (action === 'approve' || action === 'reject') {
              setLastActed({
                id: activeItem.id,
                queueType: activeItem.queue_type,
                title: activeItem.title,
              });
            }
            advanceToNext();
          },
          onError: (err) => {
            toast.error(`Failed: ${(err as Error).message}`);
          },
        },
      );
    },
    [activeItem, triageAction, advanceToNext],
  );

  const handleUndo = useCallback(() => {
    if (!lastActed) {
      toast.message('Nothing to undo');
      return;
    }
    const target = lastActed;
    triageAction.mutate(
      { itemId: target.id, queueType: target.queueType, action: 'reopen' },
      {
        onSuccess: () => {
          toast.success(`Reopened: ${target.title.slice(0, 40)}`);
          setLastActed(null);
          setActiveId(target.id);
        },
        onError: (err) => {
          toast.error(`Undo failed: ${(err as Error).message}`);
        },
      },
    );
  }, [lastActed, triageAction]);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [confirmHighConf, setConfirmHighConf] = useState(false);

  const runBulk = useCallback(
    async (targets: typeof items, action: 'approve' | 'reject') => {
      if (targets.length === 0) return;
      setBulkLoading(true);
      let ok = 0;
      let fail = 0;
      for (const item of targets) {
        try {
          await triageAction.mutateAsync({
            itemId: item.id,
            queueType: item.queue_type,
            action,
          });
          ok++;
        } catch {
          fail++;
        }
      }
      setBulkLoading(false);
      setSelectedIds(new Set());
      setActiveId(null);
      toast.success(`${action}d ${ok} item${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`);
    },
    [triageAction],
  );

  const handleBulkAction = useCallback(
    (action: 'approve' | 'reject') => runBulk(items.filter((i) => selectedIds.has(i.id)), action),
    [items, selectedIds, runBulk],
  );

  // High-confidence bulk approve: server-side, ALL eligible staging rows at
  // ≥90% (not just the current page). Count comes from the RPC's dry-run.
  const stagingSelected = !filters.queueTypes || filters.queueTypes.includes('staging');
  const { data: highConfCount, refetch: refetchHighConf } = useHighConfCount(
    stagingSelected ? filters.contentTypes : null,
    stagingSelected,
  );
  const bulkHighConf = useBulkApproveHighConf();

  const runHighConfApprove = useCallback(() => {
    bulkHighConf.mutate(
      { contentTypes: filters.contentTypes },
      {
        onSuccess: (res) => {
          toast.success(`Approved ${res.approved} high-confidence item${res.approved !== 1 ? 's' : ''}`);
          setActiveId(null);
          refetchHighConf();
        },
        onError: (err) => toast.error(`Bulk approve failed: ${(err as Error).message}`),
      },
    );
  }, [bulkHighConf, filters.contentTypes, refetchHighConf]);

  const openFocusMode = useCallback(() => {
    if (!activeId && items.length > 0) setActiveId(items[0].id);
    setFocusOpen(true);
  }, [activeId, items]);

  useTriageKeyboard({
    items,
    activeId,
    onNavigate: handleSelect,
    onApprove: () => handleAction('approve'),
    onReject: () => handleAction('reject'),
    onSkip: () => handleAction('skip'),
    onFlag: () => handleAction('flag'),
    onToggleCheck: () => {
      if (activeId) handleToggleCheck(activeId);
    },
    onUndo: handleUndo,
    enabled: !isMobile,
  });

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load triage queue: {(error as Error).message}
      </div>
    );
  }

  const listPanel = (
    <TriageList
      items={items}
      activeId={activeId}
      selectedIds={selectedIds}
      total={total}
      page={filters.page}
      perPage={filters.perPage}
      onSelect={handleSelect}
      onToggleCheck={handleToggleCheck}
      onPageChange={(p) => updateFilters({ page: p })}
    />
  );

  const detailPanel = activeItem ? (
    <TriageDetailPanel
      item={activeItem}
      onAction={handleAction}
      isActionLoading={triageAction.isPending}
    />
  ) : (
    <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground gap-2">
      <p>Select an item to preview</p>
      <p className="text-2xs">
        <kbd className="px-1 border">j</kbd>/<kbd className="px-1 border">k</kbd> navigate
        {' · '}
        <kbd className="px-1 border">a</kbd> approve
        {' · '}
        <kbd className="px-1 border">r</kbd> reject
        {' · '}
        <kbd className="px-1 border">s</kbd> skip
        {' · '}
        <kbd className="px-1 border">f</kbd> flag
        {' · '}
        <kbd className="px-1 border">u</kbd> undo
        {' · '}
        <kbd className="px-1 border">?</kbd> help
      </p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-medium">Review</h1>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total}
            </Badge>
          )}
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} selected
            </span>
          )}
          {(highConfCount ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmHighConf(true)}
              disabled={bulkLoading || bulkHighConf.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Approve ≥90% ({highConfCount})
            </Button>
          )}
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={openFocusMode}>
              <Maximize2 className="h-3.5 w-3.5 mr-1" />
              Focus mode
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <TriageFilterBar filters={filters} counts={counts} onFiltersChange={updateFilters} />

      {/* Split pane — use simple flex layout instead of resizable panels */}
      {isMobile ? (
        <>
          <div className="flex-1 overflow-hidden">{listPanel}</div>
          <Sheet
            open={!!activeItem && !focusOpen}
            onOpenChange={(open) => {
              if (!open) setActiveId(null);
            }}
          >
            <SheetContent side="right" className="w-full sm:max-w-lg p-0">
              {detailPanel}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[40%] min-w-[300px] border-r overflow-hidden">
            {listPanel}
          </div>
          <div className="flex-1 overflow-hidden">
            {detailPanel}
          </div>
        </div>
      )}

      <ReviewBulkBar
        selectedCount={selectedIds.size}
        totalCount={items.length}
        onSelectAll={() => setSelectedIds(new Set(items.map((i) => i.id)))}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkApprove={() => handleBulkAction('approve')}
        onBulkReject={() => handleBulkAction('reject')}
        loading={bulkLoading}
      />

      <TriageFocusMode
        open={focusOpen}
        onOpenChange={setFocusOpen}
        items={items}
        activeItem={activeItem}
        total={total}
        page={filters.page}
        perPage={filters.perPage}
        onNavigate={handleSelect}
        onAction={handleAction}
        isActionLoading={triageAction.isPending}
      />

      <AlertDialog open={confirmHighConf} onOpenChange={setConfirmHighConf}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {highConfCount ?? 0} high-confidence items?</AlertDialogTitle>
            <AlertDialogDescription>
              This approves every pending staging item with a confidence score of 90% or higher
              — across all pages, not just the visible ones. Items the quality check rejected are
              excluded. Approved items move on to commit and can be reopened individually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmHighConf(false);
                runHighConfApprove();
              }}
            >
              Approve {highConfCount ?? 0}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
