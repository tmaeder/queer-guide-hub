import { useState, useCallback, useMemo } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { toast } from 'sonner';
import { Maximize2, CheckCheck } from 'lucide-react';
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
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useUnifiedTriageQueue,
  useTriageAction,
  useHighConfCount,
  useBulkApproveHighConf,
  type TriageFilters,
  type TriageItem,
} from '@/hooks/useUnifiedTriageQueue';
import { useReviewCounts } from '@/hooks/useReviewCounts';
import { useReviewQueueCohorts } from '@/hooks/useReviewQueueCohorts';
import { ReviewBulkBar } from '@/components/admin/review/ReviewBulkBar';
import { TriageFilterBar } from './TriageFilterBar';
import { QualityCohortBar } from './QualityCohortBar';
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

  // Quality is in scope when nothing is filtered (the whole inbox) or when at
  // least one quality key is selected. Deliberately `some`, not `every`: the
  // cohort bar's own chips pin a SINGLE quality key, so an `every` test would
  // hide the bar the moment a reviewer used it.
  const qualityInScope =
    !filters.queueTypes || filters.queueTypes.some((k) => k.startsWith('quality-'));
  const { data: cohorts, isLoading: cohortsLoading } = useReviewQueueCohorts(qualityInScope);
  const triageAction = useTriageAction();

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const activeItem = useMemo(() => items.find((i) => i.id === activeId) ?? null, [items, activeId]);

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
    (
      action: 'approve' | 'reject' | 'skip' | 'flag',
      notes?: string,
      cannedSlug?: string,
      // Queue-specific extras. `triage_action` has accepted `p_payload` since
      // 20260801050000 and `useTriageAction` has always had the parameter, but this
      // handler dropped it — which is why dedup-review's canonical flip (`keep_id`)
      // was reachable from SQL and from the hook and from no button anywhere.
      payload?: Record<string, unknown>,
      // Outing-safety confirmation, forwarded to triage_action's p_confirm.
      // Set only by TriageDetailPanel, only on approve, and only after the
      // reviewer ticks the box — see the gate there. Without it,
      // approve_entity_review raises 42501 for every risk-gated row, which is
      // what made 347 proposals un-approvable from this screen.
      confirm?: boolean,
    ) => {
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
          payload,
          confirm,
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

  /**
   * A namesake merge can never be a bulk decision.
   *
   * `TriageDetailPanel` gates approving a personality dedup pair behind an explicit
   * "these are the same person" confirmation, because two different people merged
   * into one profile is an outing risk and `_personality_merge_core` repoints the
   * relationship graph — which no undo fully rebuilds, since it DROPS self-loops and
   * already-existing edges rather than moving them.
   *
   * That gate protected the one-at-a-time path and nothing else: select-all →
   * Approve went straight to `triage_action`, which has no such check, so the button
   * beside the gate bypassed it for all 46 open personality pairs at once.
   *
   * `approve_dedup_review_batch` already refuses personalities in its own WHERE for
   * exactly this reason; the bulk path does not route through it, so the rule has to
   * be restated here. Reject and skip stay available — "these are two different
   * people" must remain the easy answer.
   */
  const isNamesakePair = (i: TriageItem) =>
    i.queue_type === 'dedup-review' && i.content_type === 'personality';

  const runBulk = useCallback(
    async (targets: typeof items, action: 'approve' | 'reject') => {
      if (targets.length === 0) return;

      const held = action === 'approve' ? targets.filter(isNamesakePair) : [];
      const actionable = action === 'approve' ? targets.filter((i) => !isNamesakePair(i)) : targets;

      if (held.length > 0 && actionable.length === 0) {
        toast.warning(
          `${held.length} namesake pair${held.length === 1 ? '' : 's'} held back — approve these one at a time.`,
          {
            description:
              'Merging two different people is an outing risk and the relationship graph cannot be fully rebuilt.',
          },
        );
        return;
      }

      setBulkLoading(true);
      let ok = 0;
      let fail = 0;
      for (const item of actionable) {
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
      toast.success(
        `${action}d ${ok} item${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`,
        held.length > 0
          ? {
              description: `${held.length} namesake pair${held.length === 1 ? '' : 's'} held back — approve those individually.`,
            }
          : undefined,
      );
    },
    [triageAction],
  );

  const handleBulkAction = useCallback(
    (action: 'approve' | 'reject') =>
      runBulk(
        items.filter((i) => selectedIds.has(i.id)),
        action,
      ),
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
          toast.success(
            `Approved ${res.approved} high-confidence item${res.approved !== 1 ? 's' : ''}`,
          );
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
          {/* h2, not h1. TriageView is EMBEDDED — /admin/inbox already renders
            its own <h1>Inbox</h1> above this pane, so an h1 here gave that
            route TWO page titles and a screen reader two competing answers to
            "what page am I on".

            Caught by e2e/admin-route-baseline.spec.ts on its first run with a
            real admin session: "/admin/inbox has 2 h1s". The guard had been
            skipping silently since the day it landed, for want of a CI
            session — this is the defect it existed to find. */}
          <h2 className="text-lg font-medium">Review</h2>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total}
            </Badge>
          )}
          {isLoading && <TrackLoader size={14} />}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
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
      {/*
        Only while Quality is in scope. The bar answers "which pile should I
        work" and that question is meaningless across the whole inbox, where
        the queue chips already answer it.
      */}
      {qualityInScope && (
        <QualityCohortBar
          cohorts={cohorts}
          isLoading={cohortsLoading}
          filters={filters}
          onFiltersChange={updateFilters}
        />
      )}

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
            {/* aria-label, not a SheetTitle: this is the mobile presentation of
                the detail panel, which carries its own heading and is also used
                un-sheeted in the desktop two-pane layout below. */}
            <SheetContent side="right" className="w-full sm:max-w-lg p-0" aria-label="Item detail">
              {detailPanel}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[40%] min-w-[300px] border-r overflow-hidden">{listPanel}</div>
          <div className="flex-1 overflow-hidden">{detailPanel}</div>
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
              This approves every pending staging item with a confidence score of 90% or higher —
              across all pages, not just the visible ones. Items the quality check rejected are
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
