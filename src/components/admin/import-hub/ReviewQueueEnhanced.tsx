import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  high: '#16a34a',
  medium: '#ca8a04',
  low: '#dc2626',
};

function getConfidenceLevel(score: number | null): { level: string; color: string } {
  if (score === null) return { level: 'unknown', color: '#6b7280' };
  if (score >= 0.9) return { level: 'high', color: CONFIDENCE_COLORS.high };
  if (score >= 0.7) return { level: 'medium', color: CONFIDENCE_COLORS.medium };
  return { level: 'low', color: CONFIDENCE_COLORS.low };
}

const DEDUP_STATUS_COLORS: Record<string, string> = {
  unique: '#16a34a',
  duplicate: '#dc2626',
  merge_candidate: '#ca8a04',
  pending: '#6b7280',
};

export function ReviewQueueEnhanced() {
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [filters, setFilters] = useState<StagingFilters>({});
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

  const { data: pageResult, isLoading, refetch } = useStagingItems(filters, page, perPage, sort);
  const stagingAction = useStagingAction();

  const items = pageResult?.items || [];
  const total = pageResult?.total || 0;
  const totalPages = pageResult?.total_pages || 0;

  // Load the matched existing record when comparing
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
        case 'j': // Next
          if (currentIdx < items.length - 1) setExpandedId(items[currentIdx + 1].id);
          break;
        case 'k': // Previous
          if (currentIdx > 0) setExpandedId(items[currentIdx - 1].id);
          break;
        case 'a': // Approve
          if (expandedId) handleApprove(expandedId);
          break;
        case 'r': // Reject
          if (expandedId) handleReject(expandedId);
          break;
        case ' ': // Toggle select
          e.preventDefault();
          if (expandedId) toggleSelect(expandedId);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleApprove/handleReject are stable handlers, only re-bind on expandedId/items change
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
      // Use lightweight RPC returning JSON array (bypasses PostgREST row limit)
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Filters */}
      <Card>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 2,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Filter style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />

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

              <TextField
                size="small"
                placeholder="Search data..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                sx={{ width: 200 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSort('created_at')}
                style={{ display: 'flex', gap: 6 }}
              >
                <ArrowUpDown style={{ height: 14, width: 14 }} />
                Date{' '}
                {sort.field === 'created_at' ? (sort.dir === 'asc' ? '(oldest)' : '(newest)') : ''}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSort('dedup_match_score')}
                style={{ display: 'flex', gap: 6 }}
              >
                <ArrowUpDown style={{ height: 14, width: 14 }} />
                Match Score
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                style={{ display: 'flex', gap: 6 }}
              >
                <RefreshCw
                  style={{
                    height: 14,
                    width: 14,
                    ...(isLoading ? { animation: 'spin 1s linear infinite' } : {}),
                  }}
                />
              </Button>
            </Box>

            {selectedIds.size > 0 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                  {selectedIds.size} selected
                </Typography>
                <Button
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={stagingAction.isPending}
                  style={{ display: 'flex', gap: 6, backgroundColor: '#16a34a', color: 'white' }}
                >
                  <ThumbsUp style={{ height: 14, width: 14 }} />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkReject}
                  disabled={stagingAction.isPending}
                  style={{ display: 'flex', gap: 6 }}
                >
                  <ThumbsDown style={{ height: 14, width: 14 }} />
                  Reject
                </Button>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Keyboard shortcut hint */}
      <Typography
        variant="caption"
        sx={{ color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        <Keyboard style={{ height: 12, width: 12 }} />
        J/K nav &middot; A approve &middot; R reject &middot; Space select
      </Typography>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {/* Empty State */}
      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent>
            <Box
              sx={{
                mx: 'auto',
                width: 96,
                height: 96,
                bgcolor: 'var(--muted)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <Inbox style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              No Items Found
            </Typography>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>
              {filters.search
                ? 'No items match your search.'
                : 'No items pending review with current filters.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {!isLoading && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Select All */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size >= total}
              onChange={toggleSelectAll}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
              {selectedIds.size > 0
                ? `${selectedIds.size} selected (all pages)`
                : `Select all (${total})`}
            </Typography>
          </Box>

          {items.map((item) => {
            const confidence = getConfidenceLevel(item.ai_confidence_score);
            const normalized = item.normalized_data || {};
            const title = normalized.title || normalized.name || 'Untitled';
            const isExpanded = expandedId === item.id;
            const isComparing = compareItemId === item.id;
            const dedupColor = DEDUP_STATUS_COLORS[item.dedup_status] || '#6b7280';

            return (
              <Card
                key={item.id}
                style={{
                  backgroundColor: isExpanded ? 'var(--accent)' : 'var(--card)',
                  borderLeft: `3px solid ${dedupColor}`,
                  transition: 'background-color 0.15s',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 4 }}
                    />

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Header */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 0.5,
                          flexWrap: 'wrap',
                          gap: 1,
                        }}
                      >
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                        >
                          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {title}
                          </Typography>
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
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 0.75,
                              py: 0.15,
                              borderRadius: 0.5,
                              bgcolor: `${confidence.color}15`,
                              color: confidence.color,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                            }}
                          >
                            AI:{' '}
                            {item.ai_confidence_score !== null
                              ? `${(item.ai_confidence_score * 100).toFixed(0)}%`
                              : 'N/A'}
                          </Box>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setExpandedId(isExpanded ? null : item.id);
                              setCompareItemId(null);
                            }}
                          >
                            <Eye style={{ height: 14, width: 14 }} />
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
                                style={{ display: 'flex', gap: 4 }}
                              >
                                <Merge style={{ height: 14, width: 14 }} />
                                Compare
                              </Button>
                              {item.target_table === 'venues' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleMerge(item.id, item.dedup_match_id as string)}
                                  disabled={stagingAction.isPending}
                                  style={{
                                    backgroundColor: '#ca8a04',
                                    color: 'white',
                                    padding: '4px 8px',
                                    display: 'flex',
                                    gap: 4,
                                  }}
                                  title="Merge this staging item into the matched venue"
                                >
                                  <Merge style={{ height: 14, width: 14 }} />
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
                              backgroundColor: '#16a34a',
                              color: 'white',
                              padding: '4px 8px',
                            }}
                          >
                            <ThumbsUp style={{ height: 14, width: 14 }} />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(item.id)}
                            disabled={stagingAction.isPending}
                            style={{ padding: '4px 8px' }}
                          >
                            <ThumbsDown style={{ height: 14, width: 14 }} />
                          </Button>
                        </Box>
                      </Box>

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
                        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {/* AI Reasoning */}
                          {item.ai_validation_result?.reasoning && (
                            <Alert>
                              <AlertTriangle style={{ height: 16, width: 16 }} />
                              <AlertDescription>
                                <strong>AI:</strong> {item.ai_validation_result.reasoning}
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Side-by-side comparison with matched entity */}
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
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 500, fontSize: '0.8rem' }}
                            >
                              Review Notes
                            </Typography>
                            <Textarea
                              placeholder="Add notes..."
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              style={{ minHeight: 50 }}
                            />
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                pt: 2,
              }}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ display: 'flex', gap: 6 }}
              >
                <ChevronLeft style={{ height: 16, width: 16 }} />
                Previous
              </Button>
              <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                Page {page} of {totalPages} ({total} items)
              </Typography>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ display: 'flex', gap: 6 }}
              >
                Next
                <ChevronRight style={{ height: 16, width: 16 }} />
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
