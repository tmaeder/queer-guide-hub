import { useState, useCallback, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { toast } from 'sonner';
import { ArrowRight, CheckCheck, Inbox, Maximize2 } from 'lucide-react';
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
} from '@/hooks/useUnifiedTriageQueue';
import { useReviewCounts } from '@/hooks/useReviewCounts';
import { queueByKey } from '@/config/adminQueues';
import { useReviewQueueCohorts } from '@/hooks/useReviewQueueCohorts';
import { ReviewBulkBar } from '@/components/admin/review/ReviewBulkBar';
import { TriageFilterBar } from './TriageFilterBar';
import { QualityCohortBar } from './QualityCohortBar';
import { TriageList } from './TriageList';
import { TriageDetailPanel } from './TriageDetailPanel';
import { TriageFocusMode } from './TriageFocusMode';
import { useTriageKeyboard } from './useTriageKeyboard';
import { getTriageDecisionGuidance } from './triageDecisionGuidance';
import {
  resolveDecision,
  isUnbatchablePerson,
  queuedKeepId,
  type TriageAction,
  type TriageAnswers,
} from './resolveDecision';
import { useTriageSourceCapabilities } from '@/hooks/useTriageSourceCapabilities';

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
  const [answers, setAnswers] = useState<Record<string, TriageAnswers>>({});
  // Last approve/reject, for one-step undo (U) — reopens the item in its queue.
  const [lastActed, setLastActed] = useState<{
    id: string;
    queueType: string;
    title: string;
  } | null>(null);

  const { data, isLoading, error } = useUnifiedTriageQueue(filters);
  const { data: reviewCounts } = useReviewCounts();
  const counts = useMemo(
    () =>
      reviewCounts
        ? {
            review_staging: reviewCounts.staging,
            review_cms: reviewCounts.cmsReview,
            review_moderation: reviewCounts.moderation,
            review_submissions: reviewCounts.submissions,
            review_automation: reviewCounts.automation,
            review_tags: reviewCounts.tagSuggestions,
            review_duplicates: reviewCounts.duplicates,
            quality_editorial: reviewCounts.editorial,
            review_feedback: reviewCounts.feedback,
          }
        : undefined,
    [reviewCounts],
  );

  // Quality is in scope when nothing is filtered (the whole inbox) or when at
  // least one quality key is selected. Deliberately `some`, not `every`: the
  // cohort bar's own chips pin a SINGLE quality key, so an `every` test would
  // hide the bar the moment a reviewer used it.
  const qualityInScope =
    !filters.queueTypes || filters.queueTypes.some((k) => k.startsWith('quality-'));
  const { data: cohorts, isLoading: cohortsLoading } = useReviewQueueCohorts(qualityInScope);
  const triageAction = useTriageAction();
  const { externalConsoleFor } = useTriageSourceCapabilities();

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const activeItem = useMemo(() => items.find((i) => i.id === activeId) ?? null, [items, activeId]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const selectedQueueTypes = useMemo(
    () => new Set(selectedItems.map((item) => item.queue_type)),
    [selectedItems],
  );
  const mixedBulkWorkflows = selectedQueueTypes.size > 1;
  const bulkDecisionSummary = useMemo(() => {
    if (selectedItems.length === 0) return undefined;
    if (mixedBulkWorkflows) {
      return 'These items use different approval workflows. Filter to one queue or review them individually before making a bulk decision.';
    }
    const guidance = getTriageDecisionGuidance(selectedItems[0]);
    return `Approve: ${guidance.approve} Reject: ${guidance.reject}`;
  }, [mixedBulkWorkflows, selectedItems]);
  const scopeLabel = useMemo(() => {
    if (!filters.queueTypes) return 'All queues';
    if (filters.queueTypes.length === 1) {
      return queueByKey(filters.queueTypes[0])?.label ?? filters.queueTypes[0];
    }
    return `${filters.queueTypes.length} queues`;
  }, [filters.queueTypes]);

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
    (action: TriageAction) => {
      if (!activeItem) return;

      const decision = resolveDecision(activeItem, action, answers[activeItem.id] ?? {}, {
        externalConsole: externalConsoleFor(activeItem.queue_type),
      });
      if (!decision.ok) {
        toast.warning(decision.reason);
        return;
      }

      if (action === 'skip') {
        advanceToNext();
        return;
      }

      triageAction.mutate(
        {
          itemId: activeItem.id,
          queueType: activeItem.queue_type,
          action,
          notes: decision.notes,
          cannedSlug: decision.cannedSlug,
          payload: decision.payload,
          confirm: decision.confirm,
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
    [activeItem, answers, externalConsoleFor, triageAction, advanceToNext],
  );

  const updateAnswers = useCallback(
    (patch: Partial<TriageAnswers>) => {
      if (!activeId) return;
      setAnswers((previous) => ({
        ...previous,
        [activeId]: { ...previous[activeId], ...patch },
      }));
    },
    [activeId],
  );

  const activeAnswers: TriageAnswers = useMemo(() => {
    if (!activeItem) return {};
    return { keepId: queuedKeepId(activeItem), ...answers[activeItem.id] };
  }, [activeItem, answers]);

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
  const splitRef = useRef<HTMLDivElement>(null);
  const [listShare, setListShare] = useState(36);

  const resizeList = useCallback((clientX: number) => {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect) return;
    const minList = Math.min(272, rect.width * 0.45);
    const maxList = Math.min(544, Math.max(minList, rect.width - 360));
    const width = Math.min(maxList, Math.max(minList, clientX - rect.left));
    setListShare((width / rect.width) * 100);
  }, []);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const onMove = (moveEvent: PointerEvent) => resizeList(moveEvent.clientX);
      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
    },
    [resizeList],
  );

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
  const runBulk = useCallback(
    async (targets: typeof items, action: 'approve' | 'reject') => {
      if (targets.length === 0) return;

      const held = action === 'approve' ? targets.filter(isUnbatchablePerson) : [];
      const actionable =
        action === 'approve' ? targets.filter((i) => !isUnbatchablePerson(i)) : targets;

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
      answers={activeAnswers}
      onAnswersChange={updateAnswers}
      onAction={handleAction}
      isActionLoading={triageAction.isPending}
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-muted/15 px-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-container border border-border-hairline bg-background shadow-soft">
        <Inbox className="size-6" aria-hidden="true" />
      </span>
      <div className="max-w-sm">
        <h3 className="text-title font-semibold leading-tight">Choose a review item</h3>
        <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
          Open an item to see its source, proposed changes, risk signals, and available decisions.
        </p>
      </div>
      {items.length > 0 && (
        <Button onClick={() => handleSelect(items[0].id)}>
          Review first item
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-2xs text-muted-foreground">
        <span>
          <kbd className="rounded-badge border border-border bg-background px-1.5 py-0.5">J</kbd>
          <span className="ml-1">next</span>
        </span>
        <span>
          <kbd className="rounded-badge border border-border bg-background px-1.5 py-0.5">A</kbd>
          <span className="ml-1">approve</span>
        </span>
        <span>
          <kbd className="rounded-badge border border-border bg-background px-1.5 py-0.5">R</kbd>
          <span className="ml-1">reject</span>
        </span>
        <span>
          <kbd className="rounded-badge border border-border bg-background px-1.5 py-0.5">?</kbd>
          <span className="ml-1">all shortcuts</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-4">
          {/* h2, not h1. TriageView is EMBEDDED — /admin/inbox already renders
            its own <h1>Inbox</h1> above this pane, so an h1 here gave that
            route TWO page titles and a screen reader two competing answers to
            "what page am I on".

            Caught by e2e/admin-route-baseline.spec.ts on its first run with a
            real admin session: "/admin/inbox has 2 h1s". The guard had been
            skipping silently since the day it landed, for want of a CI
            session — this is the defect it existed to find. */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-15 font-semibold">Review queue</h2>
              {isLoading && <TrackLoader size={14} />}
            </div>
            <p className="truncate text-2xs text-muted-foreground">{scopeLabel}</p>
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="rounded-badge text-xs tabular-nums">
              {total.toLocaleString()} open
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              <CheckCheck className="mr-1 size-3.5" />
              Approve ≥90% ({highConfCount})
            </Button>
          )}
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={openFocusMode}>
              <Maximize2 className="mr-1 size-3.5" />
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
        <div ref={splitRef} className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 shrink-0 overflow-hidden" style={{ flexBasis: `${listShare}%` }}>
            {listPanel}
          </div>
          <button
            type="button"
            role="separator"
            aria-label="Resize queue and preview"
            aria-orientation="vertical"
            aria-valuemin={28}
            aria-valuemax={60}
            aria-valuenow={Math.round(listShare)}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setListShare((value) => Math.max(28, value - 3));
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                setListShare((value) => Math.min(60, value + 3));
              }
            }}
            className="group relative w-1.5 shrink-0 cursor-col-resize border-x border-border bg-muted/40 outline-none transition-colors hover:bg-muted focus-visible:bg-foreground/15"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-foreground/40" />
          </button>
          <div className="min-w-0 flex-1 overflow-hidden bg-muted/15">{detailPanel}</div>
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
        decisionSummary={bulkDecisionSummary}
        decisionsDisabled={mixedBulkWorkflows}
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
        answers={activeAnswers}
        onAnswersChange={updateAnswers}
        onAction={handleAction}
        isActionLoading={triageAction.isPending}
      />

      <AlertDialog open={confirmHighConf} onOpenChange={setConfirmHighConf}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {highConfCount ?? 0} high-confidence items?</AlertDialogTitle>
            <AlertDialogDescription>
              If you continue, every pending staging item at 90% confidence or higher is marked
              approved across all pages and handed to the commit pipeline. Quality-rejected items
              are excluded; nothing becomes public until commit succeeds. If you cancel, no review
              status or content changes.
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
