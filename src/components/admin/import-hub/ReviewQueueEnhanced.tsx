import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Eye,
  AlertTriangle,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Search,
  Merge,
  ArrowUpDown,
  Keyboard,
} from 'lucide-react';
import {
  useStagingItems,
  useStagingAction,
  useEntityById,
  type StagingFilters,
  type StagingSort,
} from '@/hooks/useImportHubQueries';
import { supabase } from '@/integrations/supabase/client';
import { StructuredFieldDisplay } from './StructuredFieldDisplay';
import { SideBySideComparison } from './SideBySideComparison';

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'hsl(var(--foreground))',
  medium: 'hsl(var(--foreground) / 0.55)',
  low: 'hsl(var(--destructive))',
};

function getConfidenceLevel(score: number | null): { level: string; color: string } {
  if (score === null) return { level: 'unknown', color: 'hsl(var(--muted-foreground))' };
  if (score >= 0.9) return { level: 'high', color: CONFIDENCE_COLORS.high };
  if (score >= 0.7) return { level: 'medium', color: CONFIDENCE_COLORS.medium };
  return { level: 'low', color: CONFIDENCE_COLORS.low };
}

const DEDUP_STATUS_COLORS: Record<string, string> = {
  unique: 'hsl(var(--foreground))',
  duplicate: 'hsl(var(--destructive))',
  merge_candidate: 'hsl(var(--foreground) / 0.55)',
  pending: 'hsl(var(--muted-foreground))',
};

export function ReviewQueueEnhanced() {
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [filters, setFilters] = useState<StagingFilters>({ review_status: 'pending_review' });
  const [sort, setSort] = useState<StagingSort>({ field: 'created_at', dir: 'desc' });
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareItemId, setCompareItemId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput || null }));
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: pageResult, isLoading, isError, error, refetch } = useStagingItems(filters, page, perPage, sort);
  const stagingAction = useStagingAction();

  const items = pageResult?.items || [];
  const total = pageResult?.total || 0;
  const totalPages = pageResult?.total_pages || 0;

  const expandedItem = items.find((i) => i.id === compareItemId);
  const { data: matchedEntity } = useEntityById(
    expandedItem?.target_table || null,
    expandedItem?.dedup_match_id || null,
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const currentIdx = items.findIndex((i) => i.id === expandedId);

      switch (e.key.toLowerCase()) {
        case 'j':
          if (currentIdx < items.length - 1) setExpandedId(items[currentIdx + 1].id);
          break;
        case 'k':
          if (currentIdx > 0) setExpandedId(items[currentIdx - 1].id);
          break;
        case 'a':
          if (expandedId) handleApprove(expandedId);
          break;
        case 'r':
          if (expandedId) handleReject(expandedId);
          break;
        case ' ':
          e.preventDefault();
          if (expandedId) toggleSelect(expandedId);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId, items]);

  const handleApprove = (id: string) => {
    stagingAction.mutate({ action: 'approve', stagingId: id, notes: reviewNotes || undefined });
    setReviewNotes('');
    setExpandedId(null);
    setCompareItemId(null);
  };

  const handleMerge = (id: string, targetVenueId: string) => {
    stagingAction.mutate({
      action: 'merge',
      stagingId: id,
      targetVenueId,
      notes: reviewNotes || undefined,
    });
    setReviewNotes('');
    setExpandedId(null);
    setCompareItemId(null);
  };

  const handleReject = (id: string) => {
    stagingAction.mutate({ action: 'reject', stagingId: id, notes: reviewNotes || undefined });
    setReviewNotes('');
    setExpandedId(null);
    setCompareItemId(null);
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    stagingAction.mutate({ action: 'bulk_approve', stagingIds: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  const handleBulkReject = () => {
    if (selectedIds.size === 0) return;
    stagingAction.mutate({ action: 'bulk_reject', stagingIds: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = async () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      const { data } = await supabase.rpc('get_staging_ids', {
        p_target_table: filters.target_table || null,
        p_dedup_status: filters.dedup_status || null,
        p_search: filters.search || null,
        p_limit: 50000,
        p_review_status: filters.review_status || null,
      } as Record<string, unknown>);
      const ids: string[] = Array.isArray(data) ? data : [];
      setSelectedIds(new Set(ids));
    }
  };

  const handleFilterChange = (key: keyof StagingFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value === 'all' ? null : value }));
    setPage(1);
  };

  const toggleSort = (field: string) => {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
            <div className="flex gap-2 items-center flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />

              <Select
                value={filters.target_table || 'all'}
                onValueChange={(v) => handleFilterChange('target_table', v)}
              >
                <SelectTrigger style={{ width: 140 }}>
                  <SelectValue placeholder="Table" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tables</SelectItem>
                  <SelectItem value="venues">Venues</SelectItem>
                  <SelectItem value="events">Events</SelectItem>
                  <SelectItem value="personalities">Personalities</SelectItem>
                  <SelectItem value="news_articles">News</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.dedup_status || 'all'}
                onValueChange={(v) => handleFilterChange('dedup_status', v)}
              >
                <SelectTrigger style={{ width: 160 }}>
                  <SelectValue placeholder="Dedup status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dedup</SelectItem>
                  <SelectItem value="pending">Pending Scan</SelectItem>
                  <SelectItem value="unique">Unique</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                  <SelectItem value="merge_candidate">Merge Candidate</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search data..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-[200px] pl-7 h-9"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSort('created_at')}
                className="flex gap-1.5"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Date{' '}
                {sort.field === 'created_at' ? (sort.dir === 'asc' ? '(oldest)' : '(newest)') : ''}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSort('dedup_match_score')}
                className="flex gap-1.5"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Match Score
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="flex gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex gap-1 items-center">
                <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                <Button
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={stagingAction.isPending}
                  className="flex gap-1.5"
                  style={{ backgroundColor: 'hsl(var(--foreground))', color: 'white' }}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkReject}
                  disabled={stagingAction.isPending}
                  className="flex gap-1.5"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Keyboard shortcut hint */}
      {items.length > 0 && (
        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
          <Keyboard className="h-3 w-3" />
          J/K nav &middot; A approve &middot; R reject &middot; Space select
        </span>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-7 w-7 animate-spin" aria-label="Loading" />
        </div>
      )}

      {/* Error State */}
      {isError && (
        <Card>
          <CardContent>
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-2">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <h6 className="font-semibold text-lg mb-1">Failed to load staging items</h6>
            <p className="text-muted-foreground mb-3">
              {error instanceof Error ? error.message : 'The staging query failed. Check the database connection.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} style={{ display: 'flex', gap: 6, margin: '0 auto' }}>
              <RefreshCw style={{ width: 14, height: 14 }} /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !isError && items.length === 0 && (
        <Card>
          <CardContent>
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-2">
              <Inbox className="h-12 w-12 text-muted-foreground" />
            </div>
            <h6 className="font-semibold text-lg mb-1">No Items Found</h6>
            <p className="text-muted-foreground">
              {searchInput || filters.search
                ? 'No items match your search.'
                : 'No items pending review with current filters.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {!isLoading && items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {/* Select All */}
          <div className="flex items-center gap-1 px-1">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size >= total}
              onChange={toggleSelectAll}
              className="w-4 h-4 cursor-pointer"
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected (all pages)`
                : `Select all (${total})`}
            </span>
          </div>

          {items.map((item) => {
            const confidence = getConfidenceLevel(item.ai_confidence_score);
            const normalized = item.normalized_data || {};
            const title = normalized.title || normalized.name || 'Untitled';
            const isExpanded = expandedId === item.id;
            const isComparing = compareItemId === item.id;
            const dedupColor = DEDUP_STATUS_COLORS[item.dedup_status] || 'hsl(var(--muted-foreground))';

            return (
              <Card
                key={item.id}
                style={{
                  backgroundColor: isExpanded ? 'hsl(var(--accent))' : 'hsl(var(--card))',
                  borderLeft: `3px solid ${dedupColor}`,
                  transition: 'background-color 0.15s',
                }}
              >
                <CardContent>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 cursor-pointer mt-1"
                    />

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-0.5 flex-wrap gap-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-semibold text-[0.9rem]">{title}</span>
                          <Badge variant="outline">{item.target_table}</Badge>
                          {item.dedup_status !== 'pending' && item.dedup_status !== 'unique' && (
                            <Badge
                              style={{
                                backgroundColor: `${dedupColor}15`,
                                color: dedupColor,
                                border: `1px solid ${dedupColor}30`,
                              }}
                            >
                              {item.dedup_status === 'duplicate' ? 'Duplicate' : 'Merge Candidate'}
                              {item.dedup_match_score !== null &&
                                ` (${(item.dedup_match_score * 100).toFixed(0)}%)`}
                            </Badge>
                          )}
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 rounded text-[0.7rem] font-semibold"
                            style={{
                              backgroundColor: `${confidence.color}15`,
                              color: confidence.color,
                              padding: '1px 6px',
                            }}
                          >
                            AI:{' '}
                            {item.ai_confidence_score !== null
                              ? `${(item.ai_confidence_score * 100).toFixed(0)}%`
                              : 'N/A'}
                          </span>
                        </div>

                        <div className="flex gap-0.5 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setExpandedId(isExpanded ? null : item.id);
                              setCompareItemId(null);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {item.dedup_match_id && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCompareItemId(isComparing ? null : item.id);
                                  setExpandedId(item.id);
                                }}
                                className="flex gap-1"
                              >
                                <Merge className="h-3.5 w-3.5" />
                                Compare
                              </Button>
                              {item.target_table === 'venues' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleMerge(item.id, item.dedup_match_id as string)}
                                  disabled={stagingAction.isPending}
                                  className="flex gap-1"
                                  style={{
                                    backgroundColor: 'hsl(var(--foreground) / 0.55)',
                                    color: 'white',
                                    padding: '4px 8px',
                                  }}
                                  title="Merge this staging item into the matched venue"
                                >
                                  <Merge className="h-3.5 w-3.5" />
                                  Merge
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleApprove(item.id)}
                            disabled={stagingAction.isPending}
                            style={{
                              backgroundColor: 'hsl(var(--foreground))',
                              color: 'white',
                              padding: '4px 8px',
                            }}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(item.id)}
                            disabled={stagingAction.isPending}
                            style={{ padding: '4px 8px' }}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Compact Summary */}
                      {!isExpanded && (
                        <StructuredFieldDisplay
                          entityType={item.target_table}
                          data={normalized}
                          compact
                        />
                      )}

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-1.5 flex flex-col gap-2">
                          {/* AI Reasoning */}
                          {item.ai_validation_result?.reasoning && (
                            <Alert>
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                <strong>AI:</strong> {item.ai_validation_result.reasoning}
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Side-by-side comparison */}
                          {isComparing && matchedEntity ? (
                            <SideBySideComparison
                              entityType={item.target_table}
                              leftData={normalized}
                              rightData={matchedEntity}
                              leftLabel="Staging (New)"
                              rightLabel="Existing Record"
                              showActions={false}
                            />
                          ) : (
                            <StructuredFieldDisplay
                              entityType={item.target_table}
                              data={normalized}
                            />
                          )}

                          {/* Review Notes */}
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-[0.8rem]">Review Notes</span>
                            <Textarea
                              placeholder="Add notes..."
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              style={{ minHeight: 50 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} items)
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex gap-1.5"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
