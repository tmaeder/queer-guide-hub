import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Keyboard,
  RefreshCw,
  Search,
  FlaskConical,
  CircleAlert,
} from '@/components/icons';
import { toast } from 'sonner';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';
import { TriageDetailPanel } from '@/components/admin/triage/TriageDetailPanel';
import { TriageItemRow } from '@/components/admin/triage/TriageItemRow';
import {
  resolveDecision,
  type TriageAction,
  type TriageAnswers,
} from '@/components/admin/triage/resolveDecision';
import { ReviewCleanupStatus } from '@/components/admin/review-workspace/ReviewCleanupStatus';
import { ReviewTaskDetail } from '@/components/admin/review-workspace/ReviewTaskDetail';
import { ReviewCaseDetail } from '@/components/admin/review-workspace/ReviewCaseDetail';
import {
  MERGE_REVIEW_SOURCES,
  TAG_REVIEW_SOURCES,
  hasSpecialReview,
  reviewKey,
} from '@/components/admin/review-workspace/reviewContracts';
import {
  useAdminReview,
  useReviewDecision,
  useReviewBulk,
  useSelectedReviewItem,
  DEFAULT_REVIEW_SCOPE,
  type ReviewDecision,
  type ReviewFilters,
  type ReviewItem,
} from '@/hooks/useAdminReview';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDebounce } from '@/hooks/useDebounce';
import { useNewsReviewList } from '@/hooks/useNewsStagingSummaries';
import { newsGateKey, newsReviewKey, type NewsGroupBy } from '@/lib/newsStaging';
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

// Lead with independent, ready cases. Research, blocked jobs, raw decision rows
// and the inclusive detector union remain separately reachable and labelled.
const scopeOptions = [
  'ready',
  'research',
  'blocked',
  'all',
  'decisions',
  'safety',
  'overdue',
  'public',
] as const;

/**
 * Renders a count that may be absent, WITHOUT substituting a different one.
 *
 * `decisions_total` and `findings_total` arrive only from a backend carrying migration
 * 99991791872772, so between the Pages deploy and `db push` they are undefined -- and
 * `undefined.toLocaleString()` throws, taking the whole admin page down. Falling back to
 * `all_total` is the tempting fix and is wrong: it would silently print 335,495 under the label
 * "decisions", which is exactly the conflation this change exists to remove. An em dash degrades
 * visibly instead.
 */
const fmtCount = (n: number | undefined | null) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';
const sortOptions = ['priority', 'age', 'confidence'] as const;
const selectClass =
  'h-10 min-w-0 rounded-element border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const EMPTY_ITEMS: ReviewItem[] = [];

export default function AdminReviewQueue() {
  const [params, setParams] = useSearchParams();
  const mobile = useIsMobile();
  const [help, setHelp] = useState(false);
  const search = params.get('q') ?? '';
  const debouncedSearch = useDebounce(search, 300);
  const [lastActed, setLastActed] = useState<ReviewItem | null>(null);
  const [answersByKey, setAnswersByKey] = useState<Record<string, TriageAnswers>>({});
  const detailRef = useRef<HTMLDivElement>(null);
  const mutation = useReviewDecision();
  const bulk = useReviewBulk();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkNotes, setBulkNotes] = useState('');
  const family = params.get('family');
  const queue = params.get('queue');
  const scopeRaw = params.get('scope');
  const sortRaw = params.get('sort');
  const filters: ReviewFilters = {
    queues: queue
      ? [queue]
      : family === 'tags'
        ? TAG_REVIEW_SOURCES
        : family === 'merge'
          ? MERGE_REVIEW_SOURCES
          : family === 'enrichment'
            ? ['ai-suggestions', 'tag-enrichment']
            : null,
    search: debouncedSearch,
    scope: scopeOptions.includes(scopeRaw as ReviewFilters['scope'])
      ? (scopeRaw as ReviewFilters['scope'])
      : DEFAULT_REVIEW_SCOPE,
    sort: sortOptions.includes(sortRaw as ReviewFilters['sort'])
      ? (sortRaw as ReviewFilters['sort'])
      : 'priority',
    page: Number.isFinite(Number(params.get('page')))
      ? Math.min(21474836, Math.max(1, Math.floor(Number(params.get('page')) || 1)))
      : 1,
  };
  const query = useAdminReview(filters);
  const summary = query.summary ?? query.data;
  const items = query.data?.items ?? EMPTY_ITEMS;
  const groupBy = (['reason', 'publication'] as const).find((g) => g === params.get('group')) as
    NewsGroupBy | undefined;
  const [confirmReject, setConfirmReject] = useState(false);
  const { newsOf, reasonTitleFor, reasonTitles, groups } = useNewsReviewList(items, groupBy);
  const bulkAvailable =
    queue === 'staging' && Boolean(summary?.sources.find((s) => s.key === 'staging')?.can_bulk);
  const selectedKey = params.get('selected');
  const onPage = items.find((item) => reviewKey(item) === selectedKey || item.id === selectedKey);
  const bookmarked = useSelectedReviewItem(
    selectedKey,
    queue,
    !!selectedKey && !onPage && !query.isLoading,
  );
  const selected =
    items.find((item) => reviewKey(item) === selectedKey || item.id === selectedKey) ??
    bookmarked.data ??
    (!selectedKey && !mobile ? items[0] : undefined);
  const activeAnswers = selected ? (answersByKey[reviewKey(selected)] ?? {}) : {};

  const changeParams = useCallback(
    (changes: Record<string, string | null>, reset = true) => {
      if (reset || changes.page) setSelectedIds(new Set());
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (reset) {
            next.delete('selected');
            next.delete('page');
          }
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const runBulk = (action: 'approve' | 'reject') =>
    bulk.mutate(
      { ids: [...selectedIds], action, notes: bulkNotes },
      {
        onSuccess: (result) => {
          setSelectedIds(new Set());
          changeParams({ selected: null }, false);
          toast.success(`${result.count} decisions saved`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  useEffect(() => {
    document.title = 'Review queue · Admin · Queer Guide';
  }, []);
  const choose = useCallback(
    (item?: ReviewItem) => {
      mutation.reset();
      changeParams({ selected: item ? reviewKey(item) : null }, false);
    },
    [changeParams, mutation],
  );
  const navigateItem = useCallback(
    (delta: number) => {
      const index = selected ? items.indexOf(selected) : -1;
      const next = items[index + delta];
      if (next) choose(next);
      else if (delta > 0 && query.data && filters.page * 50 < query.data.total)
        changeParams({ page: String(filters.page + 1), selected: null }, false);
    },
    [selected, items, choose, query.data, filters.page, changeParams],
  );
  const skip = () => navigateItem(1);
  const decide = useCallback(
    (decision: ReviewDecision) => {
      if (mutation.isPending || bulk.isPending) return;
      const index = items.findIndex((item) => reviewKey(item) === reviewKey(decision.item));
      const next = items[index + 1] ?? items[index - 1];
      mutation.mutate(decision, {
        onSuccess: () => {
          toast.success(`Decision saved: ${decision.item.title}`);
          setLastActed(decision.item.can_reopen ? decision.item : null);
          changeParams({ selected: next ? reviewKey(next) : null }, false);
        },
        onError: (err) => toast.error(err.message),
      });
    },
    [mutation, bulk.isPending, items, changeParams],
  );
  const legacyAction = useCallback(
    (action: TriageAction) => {
      if (!selected || mutation.isPending) return;
      if (action === 'skip') {
        navigateItem(1);
        return;
      }
      const result = resolveDecision(selected, action, answersByKey[reviewKey(selected)] ?? {});
      if (!result.ok) {
        toast.warning(result.reason);
        return;
      }
      decide({
        item: selected,
        action,
        notes: result.notes,
        confirm: result.confirm,
        payload: {
          ...result.payload,
          canned_slug: result.cannedSlug,
          namesake_confirmed: answersByKey[reviewKey(selected)]?.namesakeConfirmed,
        },
      });
    },
    [selected, mutation.isPending, navigateItem, answersByKey, decide],
  );
  const undo = useCallback(() => {
    if (!lastActed || mutation.isPending) return;
    mutation.mutate(
      { item: lastActed, action: 'reopen' },
      {
        onSuccess: () => {
          toast.success('Decision undone');
          setLastActed(null);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }, [lastActed, mutation]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]') ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === '?') {
        event.preventDefault();
        setHelp(true);
        return;
      }
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        navigateItem(event.key === 'j' ? 1 : -1);
      }
      if (event.key === 's') {
        event.preventDefault();
        navigateItem(1);
      }
      if (event.key === 'u') {
        event.preventDefault();
        undo();
      }
      if ((event.key === 'a' || event.key === 'r') && selected) {
        event.preventDefault();
        const action = event.key === 'a' ? 'approve' : 'reject';
        detailRef.current
          ?.querySelector<HTMLButtonElement>(`[data-review-action="${action}"]`)
          ?.click();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigateItem, selected, legacyAction, undo]);
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50));
  const error = mutation.error?.message;
  useEffect(() => {
    if (query.data && filters.page > pages)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile URL pagination after the server's pending population shrinks
      changeParams({ page: String(pages), selected: null }, false);
  }, [query.data, filters.page, pages, changeParams]);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4 md:px-6">
        <div>
          {/* eslint-disable-next-line queerguide/admin-ui-primitives -- compact title inside the full-height review workspace */}
          <h1 className="font-sans text-title font-bold tracking-tight">Review queue</h1>
          <p
            className={`${mobile && selected ? 'hidden' : ''} mt-1 text-sm text-muted-foreground`}
            aria-live="polite"
          >
            {query.data ? (
              <>
                <span className="tabular-nums">{fmtCount(summary!.ready_total)}</span> ready ·{' '}
                <span className="tabular-nums">{fmtCount(summary!.research_total)}</span>{' '}
                researching ·{' '}
                <span className="tabular-nums">{fmtCount(summary!.blocked_total)}</span> blocked
              </>
            ) : (
              'Loading review cases…'
            )}
          </p>
          {summary && (!mobile || !selected) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtCount(summary.case_total)} cases from {fmtCount(summary.decisions_total)} source
              tasks.{' '}
              <button
                className="underline underline-offset-4"
                onClick={() => changeParams({ scope: 'decisions' })}
              >
                Inspect raw tasks
              </button>
              {summary.research_enabled === false && ' · Automatic research is paused.'}
              {summary.worklist_as_of &&
                ` · Updated ${new Date(summary.worklist_as_of).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastActed && (
            <Button variant="outline" size="sm" onClick={undo} disabled={mutation.isPending}>
              Undo last decision
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={17} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh review queue"
            aria-busy={query.isFetching}
          >
            {query.isFetching ? (
              <TrackLoader size={16} label="Refreshing review queue" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
            <Link to="/admin/diagnostics">Diagnostics</Link>
          </Button>
        </div>
      </header>
      {(!mobile || !selected) && <ReviewCleanupStatus />}
      <div
        className={`${mobile && selected ? 'hidden' : 'flex'} shrink-0 flex-col gap-4 border-b border-border px-4 py-4 md:px-6`}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div
            role="group"
            aria-label="Review scope"
            className="flex min-w-0 gap-1 overflow-x-auto"
          >
            {(
              [
                { key: 'ready', label: 'Ready', icon: Inbox },
                { key: 'research', label: 'Research', icon: FlaskConical },
                { key: 'blocked', label: 'Blocked', icon: CircleAlert },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={filters.scope === key ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={filters.scope === key}
                className="min-h-10 shrink-0"
                onClick={() => changeParams({ scope: key === DEFAULT_REVIEW_SCOPE ? null : key })}
              >
                <Icon size={14} className="mr-1.5" />
                {label}
                {query.data && (
                  <span className="ml-2 hidden tabular-nums sm:inline">
                    {fmtCount(
                      key === 'ready'
                        ? summary!.ready_total
                        : key === 'research'
                          ? summary!.research_total
                          : summary!.blocked_total,
                    )}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <select
            aria-label="Source task scope"
            className={`${selectClass} w-full sm:max-w-64`}
            value={
              ['all', 'decisions', 'safety', 'overdue', 'public'].includes(filters.scope)
                ? filters.scope
                : ''
            }
            onChange={(event) => changeParams({ scope: event.target.value })}
          >
            <option value="" disabled>
              Inspect source tasks & findings
            </option>
            <option value="decisions">Raw decisions ({fmtCount(summary?.decisions_total)})</option>
            <option value="safety">
              High-risk source rows ({fmtCount(summary?.safety_total)})
            </option>
            <option value="overdue">
              Overdue source rows ({fmtCount(summary?.overdue_total)})
            </option>
            <option value="all">All source rows & findings ({fmtCount(summary?.all_total)})</option>
            <option value="public">Public-impact source rows</option>
          </select>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,12rem)_minmax(0,12rem)]">
          <select
            aria-label="Review type"
            value={queue ?? (family ? `family:${family}` : 'all')}
            className={`${selectClass} w-full`}
            onChange={(e) => {
              const value = e.target.value;
              changeParams({
                queue: value.startsWith('family:') || value === 'all' ? null : value,
                family: value.startsWith('family:') ? value.slice(7) : null,
              });
            }}
          >
            <option value="all">All review types</option>
            <option value="family:tags">Tags & glossary</option>
            <option value="family:merge">Duplicates & merges</option>
            <option value="family:enrichment">AI & enrichment</option>
            {summary?.sources
              .filter((source) => source.count > 0 || source.key === queue)
              .map((source) => (
                <option key={source.key} value={source.key}>
                  {source.label} ({source.count.toLocaleString()})
                </option>
              ))}
          </select>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search review queue"
              placeholder="Search names or review reasons"
              className="h-10 pl-10"
              value={search}
              onChange={(e) => changeParams({ q: e.target.value || null })}
            />
          </div>
          <select
            aria-label="Group review queue"
            className={selectClass}
            value={groupBy ?? ''}
            onChange={(e) => changeParams({ group: e.target.value || null }, false)}
          >
            <option value="">No grouping</option>
            <option value="reason">Group by gate reason (this page)</option>
            <option value="publication">Group by publication (this page)</option>
          </select>
          <select
            aria-label="Sort review queue"
            className={selectClass}
            value={filters.sort}
            onChange={(e) =>
              changeParams({ sort: e.target.value === 'priority' ? null : e.target.value })
            }
          >
            <option value="priority">Risk, then oldest</option>
            <option value="age">Oldest first</option>
            <option value="confidence">Lowest confidence</option>
          </select>
        </div>
      </div>
      {query.isError ? (
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h2 className="font-sans text-title font-bold">The review queue could not be loaded</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : query.isLoading ? (
        <div className="p-6">
          <AdminTableSkeleton />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {(!mobile || !selected) && (
            <section
              className="flex min-h-0 w-full flex-col border-r border-border md:w-[38%] md:min-w-72 md:max-w-lg"
              aria-label="Review worklist"
            >
              <div className="flex min-h-11 shrink-0 items-center justify-between gap-4 border-b border-border px-4 text-sm">
                <span>
                  {filters.scope === 'ready'
                    ? 'Ready decisions'
                    : filters.scope === 'research'
                      ? 'Automatic research'
                      : filters.scope === 'blocked'
                        ? 'Blocked research'
                        : 'Source tasks'}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {query.data?.total.toLocaleString()}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                    <Check className="size-7 text-muted-foreground" />
                    {/* Keyed on decisions_total, not all_total: all_total also counts the 281k
                        machine findings, so "All caught up" could never display -- not even with
                        every decision in the queue made. */}
                    <h2 className="font-sans text-title font-bold">
                      {filters.scope === 'ready' && query.data?.ready_total === 0
                        ? 'No decisions ready'
                        : query.data?.decisions_total === 0
                          ? 'All caught up'
                          : 'No matching decisions'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {filters.scope === 'ready' && query.data?.ready_total === 0
                        ? 'Research and blocked cases remain visible in their own views.'
                        : query.data?.decisions_total === 0
                          ? 'There are no pending decisions for your permissions.'
                          : 'Clear the filters to see the remaining work.'}
                    </p>
                    {query.data?.decisions_total !== 0 && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          changeParams({ queue: null, family: null, scope: null, q: null });
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                ) : (
                  (groups ?? ([['', items]] as Array<[string, ReviewItem[]]>)).map(
                    ([groupKey, groupItems]) => (
                      <div key={groupKey || 'all'}>
                        {groups && (
                          <div className="sticky top-0 z-20 flex min-h-11 items-center justify-between gap-2 border-b border-border bg-background px-4 text-xs">
                            <span className="min-w-0 truncate font-semibold">
                              {groupBy === 'reason' &&
                              !['Other', 'No reason recorded'].includes(groupKey)
                                ? (reasonTitles?.get(newsGateKey(groupKey))?.title ??
                                  reasonTitles?.get(newsReviewKey(groupKey))?.title ?? (
                                    <code className="bg-muted px-1 rounded-badge">{groupKey}</code>
                                  ))
                                : groupKey}
                              <span className="ml-2 tabular-nums font-normal text-muted-foreground">
                                {groupItems.length}
                              </span>
                            </span>
                            {bulkAvailable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedIds(new Set(groupItems.map((i) => i.id)))}
                              >
                                Select group
                              </Button>
                            )}
                          </div>
                        )}
                        {groupItems.map((item) => (
                          <div key={reviewKey(item)}>
                            <TriageItemRow
                              hideSelection={!bulkAvailable}
                              sourceLabel={item.source_label}
                              riskLevel={item.risk}
                              slaHours={item.sla_hours ?? undefined}
                              item={item}
                              news={newsOf(item)}
                              newsReasonTitle={reasonTitleFor(item)}
                              isActive={!!selected && reviewKey(selected) === reviewKey(item)}
                              isSelected={selectedIds.has(item.id)}
                              onSelect={() => choose(item)}
                              onToggleCheck={() =>
                                setSelectedIds((old) => {
                                  const next = new Set(old);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ),
                  )
                )}
              </div>
              {bulkAvailable && selectedIds.size > 0 && (
                <div className="shrink-0 border-t border-border bg-muted px-4 py-4">
                  <p className="text-sm font-semibold">
                    {selectedIds.size} source records selected
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Approve sends these records to the commit pipeline. Publication follows
                    successful commit. Reject prevents ingestion.
                  </p>
                  <Input
                    aria-label="Bulk review note"
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    className="my-2"
                    placeholder="Optional review note"
                  />
                  {bulk.error && (
                    <p role="alert" className="mb-2 text-xs text-destructive">
                      {bulk.error.message}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(['approve', 'reject'] as const).map((action) => (
                      <Button
                        key={action}
                        variant={action === 'approve' ? 'default' : 'outline'}
                        size="sm"
                        disabled={bulk.isPending || mutation.isPending}
                        onClick={() =>
                          action === 'reject' ? setConfirmReject(true) : runBulk('approve')
                        }
                      >
                        {bulk.isPending
                          ? 'Saving…'
                          : action === 'approve'
                            ? 'Approve & queue'
                            : 'Reject selected'}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <nav
                aria-label="Review queue pages"
                className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-t border-border px-4 text-sm"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Previous page"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    changeParams({ page: String(filters.page - 1), selected: null }, false)
                  }
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="tabular-nums">
                  Page {Math.min(filters.page, pages)} of {pages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Next page"
                  disabled={filters.page >= pages}
                  onClick={() =>
                    changeParams({ page: String(filters.page + 1), selected: null }, false)
                  }
                >
                  <ChevronRight size={16} />
                </Button>
              </nav>
            </section>
          )}
          {(!mobile || selected) && (
            <div ref={detailRef} className="min-h-0 min-w-0 flex-1">
              {selected ? (
                selected.queue_type === 'review-case' ? (
                  <ReviewCaseDetail
                    key={reviewKey(selected)}
                    item={selected}
                    busy={mutation.isPending || bulk.isPending}
                    error={error}
                    onDecision={decide}
                    onSkip={skip}
                    onBack={() => choose()}
                  />
                ) : hasSpecialReview(selected) ? (
                  <ReviewTaskDetail
                    key={reviewKey(selected)}
                    item={selected}
                    busy={mutation.isPending || bulk.isPending}
                    error={error}
                    onDecision={decide}
                    onSkip={skip}
                    onBack={() => choose()}
                  />
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    {mobile && (
                      <Button
                        variant="ghost"
                        className="shrink-0 self-start"
                        onClick={() => choose()}
                      >
                        Back to queue
                      </Button>
                    )}
                    {error && (
                      <p role="alert" className="shrink-0 px-4 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <div className="min-h-0 flex-1">
                      <TriageDetailPanel
                        key={reviewKey(selected)}
                        item={selected}
                        answers={activeAnswers}
                        onAnswersChange={(patch) =>
                          setAnswersByKey((old) => ({
                            ...old,
                            [reviewKey(selected)]: { ...activeAnswers, ...patch },
                          }))
                        }
                        onAction={legacyAction}
                        isActionLoading={mutation.isPending || bulk.isPending}
                      />
                    </div>
                  </div>
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                  <Inbox className="size-7 text-muted-foreground" />
                  <h2 className="font-sans text-title font-bold">
                    {bookmarked.isLoading
                      ? 'Loading bookmarked decision'
                      : selectedKey
                        ? 'This decision is no longer pending'
                        : 'Choose a decision to review'}
                  </h2>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {selectedKey
                      ? 'It may have been reviewed already, or it may require different permissions. Choose another pending item.'
                      : 'The evidence, proposed changes, and available decisions appear here.'}
                  </p>
                  {items[0] && <Button onClick={() => choose(items[0])}>Review first item</Button>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selectedIds.size} source records?</AlertDialogTitle>
            <AlertDialogDescription>
              Rejected records are not ingested. Undo only reopens the most recent single decision,
              so a bulk rejection cannot be undone from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runBulk('reject')}>Reject selected</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Review shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="flex flex-col gap-4">
            {[
              ['J / K', 'Next / previous item'],
              ['A / R', 'Approve / reject with the same review checks'],
              ['S', 'Skip without changing status'],
              ['U', 'Undo the last supported decision'],
              ['?', 'Show shortcuts'],
            ].map(([key, label]) => (
              <div key={key} className="flex justify-between gap-4 text-sm">
                <dt>{label}</dt>
                <dd className="shrink-0">
                  <kbd className="rounded-badge border border-border px-2 py-1">{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
