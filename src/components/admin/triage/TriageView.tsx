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
  AUTO_DECISION_MIN_CONFIDENCE,
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
  bulkHoldReason,
  buildBulkGovernance,
  queuedKeepId,
  type TriageAction,
  type TriageAnswers,
} from './resolveDecision';
import { useTriageSourceCapabilities } from '@/hooks/useTriageSourceCapabilities';

/**
 * The success toast used to be `${action}d`, which is correct for `approve`
 * and gave "rejectd" and "skipd" for the rest.
 */
const ACTION_PAST_TENSE: Record<TriageAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  skip: 'Skipped',
};

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
  // Bulk approve consults the review registry through this. `loaded` is false
  // while the query is in flight, and `bulkHoldReason` fails CLOSED on that —
  // a bulk approve that raced the cohort fetch would otherwise publish fields
  // the registry marks not-batchable.
  const bulkGovernance = useMemo(
    () => buildBulkGovernance(cohorts, !cohortsLoading),
    [cohorts, cohortsLoading],
  );
  const triageAction = useTriageAction();
  const { externalConsoleFor, canReopenFor } = useTriageSourceCapabilities();

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
            toast.success(`${ACTION_PAST_TENSE[action]}: ${activeItem.title.slice(0, 40)}`);
            // Only approve/reject remove the item from the queue → undoable,
            // and only on a queue whose approve the registry says is
            // reversible. Arming undo on the other ten is what let a reviewer
            // press U after an irreversible merge and read "Reopened".
            if (
              (action === 'approve' || action === 'reject') &&
              canReopenFor(activeItem.queue_type)
            ) {
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
    [activeItem, answers, externalConsoleFor, canReopenFor, triageAction, advanceToNext],
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
    // `lastActed` is only armed for a reopenable queue, so this is a backstop
    // rather than the gate — but it is the one that survives a future caller
    // that arms it differently, and it refuses locally instead of sending a
    // write the RPC will reject.
    if (!canReopenFor(target.queueType)) {
      toast.warning(`${target.queueType} cannot be undone from the inbox — its approve is final.`);
      setLastActed(null);
      return;
    }
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
  }, [lastActed, canReopenFor, triageAction]);

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
   * Bulk approve routes through the SAME resolver as the single-item path, and
   * consults the review registry before touching anything.
   *
   * TWO GATES EXISTED IN SQL AND NEITHER WAS REACHABLE FROM THIS BUTTON.
   *
   * (1) `approve_dedup_review_batch` refuses every personality pair in its own
   * WHERE, because two different people merged into one profile is an outing
   * risk and `_personality_merge_core` repoints the relationship graph —
   * which no undo fully rebuilds, since it DROPS self-loops and
   * already-existing edges rather than moving them.
   *
   * (2) `approve_entity_review_batch` honours
   * `review_field_registry.batchable AND active`, the fix 99991789843323
   * landed after a confidence-threshold-only auto-approve published 723
   * `venue.accessibility_*` and 285 `city.lgbt_friendly_rating` rows — both
   * fields this repo documents as never-auto-published.
   *
   * Select-all → Approve looped `triage_action` directly, so it reached
   * neither, AND it dropped `p_confirm` and the canonical flip on the floor:
   * `resolveDecision` — whose own header says one resolver for both callers
   * "is the only shape under which the rule cannot drift apart again" — was
   * not on this path at all. Measured when this was written: 12 of 23 open
   * quality-city rows were `batchable=false` and one click from publishing.
   *
   * Reject is never held back. "This should not publish" must stay the easy
   * answer, or every gate here pushes reviewers toward approving to clear the
   * queue.
   */
  const runBulk = useCallback(
    async (targets: typeof items, action: 'approve' | 'reject') => {
      if (targets.length === 0) return;

      // Every hold-back reason, from the registry rather than from a list
      // restated here. Reject is never held: "this should not publish" has to
      // stay the easy answer or the gates push reviewers toward approving.
      const holds =
        action === 'approve'
          ? targets.map((i) => [i, bulkHoldReason(i, bulkGovernance)] as const)
          : targets.map((i) => [i, null] as const);
      const held = holds.filter(([, r]) => r !== null);
      const actionable = holds.filter(([, r]) => r === null).map(([i]) => i);

      // One line per distinct reason, so "9 held back" says WHY rather than
      // leaving the reviewer to guess which rule fired.
      const heldSummary = Object.entries(
        held.reduce<Record<string, number>>((acc, [, r]) => {
          acc[r as string] = (acc[r as string] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([reason, n]) => `${n} × ${reason}`)
        .join('; ');

      if (held.length > 0 && actionable.length === 0) {
        toast.warning(
          `${held.length} item${held.length === 1 ? '' : 's'} held back — approve these one at a time.`,
          { description: heldSummary },
        );
        return;
      }

      setBulkLoading(true);
      let ok = 0;
      let fail = 0;
      let blocked = 0;
      let firstError: string | null = null;
      for (const item of actionable) {
        // Route through the SAME resolver the single-item path and the keyboard
        // use. Bypassing it is what dropped `p_confirm` and the canonical flip
        // from every bulk decision, and what let a per-item gate be walked
        // past by the button beside it.
        const decision = resolveDecision(item, action, answers[item.id] ?? {}, {
          externalConsole: externalConsoleFor(item.queue_type),
        });
        if (!decision.ok) {
          blocked++;
          firstError ??= decision.reason;
          continue;
        }
        try {
          await triageAction.mutateAsync({
            itemId: item.id,
            queueType: item.queue_type,
            action,
            notes: decision.notes,
            cannedSlug: decision.cannedSlug,
            payload: decision.payload,
            confirm: decision.confirm,
          });
          ok++;
        } catch (err) {
          fail++;
          // `catch { fail++ }` reported "1 failed" with no reason, so a
          // 42501 from the outing-safety gate looked like a network blip.
          firstError ??= (err as Error).message;
        }
      }
      setBulkLoading(false);
      setSelectedIds(new Set());
      setActiveId(null);

      const parts = [`${ACTION_PAST_TENSE[action]} ${ok} item${ok !== 1 ? 's' : ''}`];
      if (blocked) parts.push(`${blocked} needs a confirmation`);
      if (fail) parts.push(`${fail} failed`);
      const description = [heldSummary, firstError].filter(Boolean).join(' — ') || undefined;
      const body = parts.join(', ');
      // A HOLD IS NOT A FAILURE, and `warning` here would cry wolf. Now that
      // the registry holds back whole fields, a partial bulk is the COMMON
      // outcome on the quality queues — so routing every hold to `warning`
      // makes the channel permanently on, which is the shape this repo keeps
      // having to remove (the median-vs-oldest backlog rule, the zero-invariant
      // that ships red). Holds are reported in the description instead, which
      // is what `TriageViewBulkNamesake` asserts and was right to.
      // `warning` is kept for the two cases where something actually went
      // wrong: an RPC error, or a row a per-item gate refused.
      if (fail || blocked) toast.warning(body, { description });
      else toast.success(body, description ? { description } : undefined);
    },
    [answers, bulkGovernance, externalConsoleFor, triageAction],
  );

  const handleBulkAction = useCallback(
    (action: 'approve' | 'reject') =>
      runBulk(
        items.filter((i) => selectedIds.has(i.id)),
        action,
      ),
    [items, selectedIds, runBulk],
  );

  // High-confidence bulk approve: server-side, ALL eligible staging rows at or
  // above AUTO_DECISION_MIN_CONFIDENCE (not just the current page). Count comes
  // from the RPC's dry-run, so the button and the count share one predicate.
  // The threshold is NOT spelled here: it was `≥90%` in three strings on this
  // screen plus two literals in the hook, and the cron moved to 0.80 without
  // them. Interpolate the constant.
  const confPct = Math.round(AUTO_DECISION_MIN_CONFIDENCE * 100);
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
              Approve ≥{confPct}% ({highConfCount})
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
              If you continue, every pending staging item at {confPct}% confidence or higher is
              marked approved across all pages and handed to the commit pipeline. Quality-rejected
              items are excluded; nothing becomes public until commit succeeds. If you cancel, no
              review status or content changes.
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
