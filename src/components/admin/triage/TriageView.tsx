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
  /**
   * What the reviewer has told us, KEYED BY ITEM ID.
   *
   * This used to be two separate pieces of component state — `perPair` inside
   * `TriageDetailPanel` and `notes`/`cannedSlug` inside `ActionBar` — and neither was
   * reachable from the keyboard, which is wired here. Lifting them is what lets one
   * resolver see everything an action carries.
   *
   * Keyed by id rather than reset on advance, so a leak across items is impossible by
   * CONSTRUCTION rather than by remembering a `key` prop. That matters most for
   * `safetyConfirmed`: a confirmation that survived the advance would already be
   * satisfied for a row nobody read.
   */
  const [answers, setAnswers] = useState<Record<string, TriageAnswers>>({});
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
  // Read from `triage_sources`, not from a literal: a queue decided in its own
  // console has no `triage_action` branch, so every action on it must be refused
  // here too — not only hidden in the panel.
  const { externalConsoleFor } = useTriageSourceCapabilities();

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

  /**
   * THE ONE PLACE AN ACTION IS DECIDED, for the mouse and the keyboard alike.
   *
   * Previously the panel computed `confirm` / `{keep_id}` / the namesake refusal and
   * handed this function the result, while `useTriageKeyboard` called it directly —
   * so the keyboard skipped every gate. Both callers now hand over an intent and
   * `resolveDecision` answers with what it carries, or refuses and says why.
   */
  const handleAction = useCallback(
    (action: TriageAction) => {
      if (!activeItem) return;

      const decision = resolveDecision(activeItem, action, answers[activeItem.id] ?? {}, {
        externalConsole: externalConsoleFor(activeItem.queue_type),
      });

      if (!decision.ok) {
        // A shortcut that silently does nothing reads as a broken keyboard, which
        // is how a reviewer learns to stop using it.
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

  /** Merge one reviewer answer into the ACTIVE item's record. */
  const updateAnswers = useCallback(
    (patch: Partial<TriageAnswers>) => {
      if (!activeId) return;
      setAnswers((prev) => ({ ...prev, [activeId]: { ...prev[activeId], ...patch } }));
    },
    [activeId],
  );

  const activeAnswers: TriageAnswers = useMemo(() => {
    if (!activeItem) return {};
    const stored = answers[activeItem.id];
    // The canonical defaults to whatever the sweep queued, so the compare table has
    // something to mark as "keeping" before the reviewer touches anything.
    return { keepId: queuedKeepId(activeItem), ...stored };
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
  const [confirmBulkReject, setConfirmBulkReject] = useState(false);

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
   *
   * NOTE the predicate is `isUnbatchablePerson`, NOT the resolver's
   * `needsNamesakeConfirm`, and the difference is deliberate: bulk holds back EVERY
   * personality dedup pair (flagged or not, matching that RPC's WHERE) because it has
   * no checkbox to offer and nobody reading the pair, while the single-item gate has
   * to match the predicate the checkbox renders on. Collapsing the two is wrong in
   * both directions — see `resolveDecision.ts`.
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
    <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground gap-2">
      <p>Select an item to preview</p>
      {/* The full shortcut legend used to live here — the third of three copies,
          and the one that vanishes the moment you select something, i.e. exactly
          when a reminder would be useful. `?` opens the dialog that works at any
          time; that is the only copy left. */}
      <p className="text-2xs">
        <kbd className="px-1 border">?</kbd> for shortcuts
      </p>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          {/* NO heading here at all.
              This used to read <h2>Review</h2> — deliberately an h2 rather than an
              h1, because /admin/inbox renders its own <h1>Inbox</h1> above this pane
              and two h1s gave a screen reader two competing answers to "what page am
              I on" (caught by e2e/admin-route-baseline.spec.ts on its first run with
              a real admin session). The h2 was the correct fix for that and still
              left FOUR names for one screen visible at once: `Triage` in the mode
              nav, `Inbox` in the h1, `Review` here, and `Governance` in
              document.title. The count is the only thing this row was carrying that
              a reviewer needs. */}
          {/* The total gets a NOUN. A bare `3997` is one of the two unlabelled
              numbers this pass set out to remove; the machine/human framing that
              qualifies it stays in `AutomationStatusCard` above, because that card
              shows both halves of one population and a cross-queue sum placed beside
              this filtered total would compare different denominators — 4,710
              "needs you" against a 3,997 total, which is worse than no framing. */}
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total.toLocaleString()} open
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
        // Bulk approve is already gated by `runBulk`'s namesake hold-back and by the
        // high-confidence dialog. Bulk REJECT had nothing: 50 rows closed on one
        // click, with the only feedback a toast afterwards. Rejecting is recoverable
        // per row via Undo but not in bulk, so it gets the confirmation.
        onBulkReject={() => setConfirmBulkReject(true)}
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
        answers={activeAnswers}
        onAnswersChange={updateAnswers}
        onAction={handleAction}
        isActionLoading={triageAction.isPending}
      />

      <AlertDialog open={confirmBulkReject} onOpenChange={setConfirmBulkReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selectedIds.size} selected item(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Undo (U) reopens the LAST action only, so a bulk rejection is not
                  reversible from this screen — which is exactly why it is worth
                  confirming, and worth saying so rather than implying symmetry with
                  the per-row case. */}
              Each row is closed in its queue. Undo reopens only the most recent action,
              so a bulk rejection cannot be reversed from here — individual rows have to
              be reopened in their own queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmBulkReject(false);
                handleBulkAction('reject');
              }}
            >
              Reject {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
