import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useUnifiedTriageQueue,
  useTriageAction,
  type TriageFilters,
} from '@/hooks/useUnifiedTriageQueue';
import { useReviewCounts } from '@/hooks/useReviewCounts';
import { ReviewBulkBar } from '@/components/admin/review/ReviewBulkBar';
import { TriageFilterBar } from './TriageFilterBar';
import { TriageList } from './TriageList';
import { TriageDetailPanel } from './TriageDetailPanel';
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

  const [bulkLoading, setBulkLoading] = useState(false);

  const handleBulkAction = useCallback(
    async (action: 'approve' | 'reject') => {
      const selected = items.filter((i) => selectedIds.has(i.id));
      if (selected.length === 0) return;
      setBulkLoading(true);
      let ok = 0;
      let fail = 0;
      for (const item of selected) {
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
    [items, selectedIds, triageAction],
  );

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
      <p className="text-[10px]">
        <kbd className="px-1 border">j</kbd>/<kbd className="px-1 border">k</kbd> navigate
        {' · '}
        <kbd className="px-1 border">a</kbd> approve
        {' · '}
        <kbd className="px-1 border">r</kbd> reject
        {' · '}
        <kbd className="px-1 border">s</kbd> skip
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
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      {/* Filters */}
      <TriageFilterBar filters={filters} counts={counts} onFiltersChange={updateFilters} />

      {/* Split pane — use simple flex layout instead of resizable panels */}
      {isMobile ? (
        <>
          <div className="flex-1 overflow-hidden">{listPanel}</div>
          <Sheet
            open={!!activeItem}
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
    </div>
  );
}
