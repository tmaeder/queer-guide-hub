/**
 * ReviewQueue -- Shows all content items currently in "review" state across all content types.
 * Features: vertical timeline layout, quick approve/reject actions, sort/filter controls,
 * rich empty state, and relative timestamps showing how long items have been waiting.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Tooltip from '@mui/material/Tooltip';
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
import Checkbox from '@mui/material/Checkbox';
import { useContext } from 'react';
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
  /** Called when editing an item. Falls back to AdminShell context. */
  onEdit?: (contentType: string, itemId: string) => void;
}

type SortOrder = 'newest' | 'oldest';

/** Compute a human-readable "waiting since" string */
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
  // Fallback to AdminShell context for editor integration
  const shellCtx = useContext(AdminShellContext);
  const onEdit = propOnEdit ?? ((ct: string, id: string) => shellCtx?.openEditor(ct, id));
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Filters and sorting
  const [filterContentType, setFilterContentType] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // Workflow hook for approve/reject
  const { transition } = useCMSWorkflow('review' as WorkflowState);

  // Content type options for filter dropdown
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

      // Enrich with title from source tables
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

  // Handle approve action
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
        // Remove from list optimistically
        setItems((prev) => prev.filter((i) => i.metadata.id !== item.metadata.id));
      } else {
        setActionError(`Failed to approve "${item.title}".`);
      }
    },
    [transition],
  );

  // Handle reject action (back to draft with comment requirement)
  const handleReject = useCallback(
    async (item: ReviewQueueItem) => {
      const comment = window.prompt('Please provide a reason for requesting changes:');
      if (!comment?.trim()) return; // Requires comment per workflow config

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

  // ── Selection helpers ──────────────────────────────────────────

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

  // ── Bulk approve ─────────────────────────────────────────────

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
    let _successCount = 0;

    for (const item of items) {
      const ok = await transition(item.metadata.source_table, item.metadata.source_id, 'published');
      if (ok) _successCount++;
    }

    setBulkLoading(false);
    setSelectedIds(new Set());
    loadQueue();
  }, [items, transition, loadQueue]);

  // Filtered and sorted items
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 10,
          gap: 2,
        }}
      >
        <CircularProgress size={36} aria-label="Loading" />
        <Typography variant="body2" color="text.secondary">
          Loading review queue...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Review Queue
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {items.length} item{items.length !== 1 ? 's' : ''} awaiting review
          </Typography>
        </Box>
        {items.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {selectedIds.size > 0 && (
              <Button
                size="small"
                variant="contained"
                color="success"
                disabled={bulkLoading}
                onClick={handleBulkApprove}
                startIcon={
                  bulkLoading ? (
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <CheckCheck size={14} />
                  )
                }
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
              >
                Approve Selected ({selectedIds.size})
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              color="success"
              disabled={bulkLoading}
              onClick={handleApproveAll}
              startIcon={
                bulkLoading ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <CheckCheck size={14} />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              Approve All ({items.length})
            </Button>
          </Box>
        )}
      </Box>

      {/* ── Action error banner ─────────────────────────────── */}
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      {/* ── Select All + Filters / Sort ────────────────────── */}
      {items.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            mb: 3,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Checkbox
              size="small"
              checked={selectedIds.size === displayItems.length && displayItems.length > 0}
              indeterminate={selectedIds.size > 0 && selectedIds.size < displayItems.length}
              onChange={toggleSelectAll}
            />
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="review-filter-label">
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Filter style={{ width: 14, height: 14 }} />
                Content Type
              </Box>
            </InputLabel>
            <Select
              labelId="review-filter-label"
              value={filterContentType}
              onChange={(e) => setFilterContentType(e.target.value)}
              label="Content Type"
              sx={{ fontSize: '0.875rem' }}
            >
              <MenuItem value="all">All Types</MenuItem>
              {contentTypeOptions.map((ct) => (
                <MenuItem key={ct.id} value={ct.id}>
                  {ct.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="review-sort-label">
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ArrowUpDown style={{ width: 14, height: 14 }} />
                Sort
              </Box>
            </InputLabel>
            <Select
              labelId="review-sort-label"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              label="Sort"
              sx={{ fontSize: '0.875rem' }}
            >
              <MenuItem value="newest">Newest First</MenuItem>
              <MenuItem value="oldest">Oldest First</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {/* ── Empty State ─────────────────────────────────────── */}
      {displayItems.length === 0 && items.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 8,
            px: 4,
            textAlign: 'center',
          }}
        >
          {/* Checkmark-in-circle illustration */}
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'success.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2.5,
              opacity: 0.9,
              boxShadow: (theme) => `0 0 0 8px ${theme.palette.success.main}18`,
            }}
          >
            <CheckCircle2 style={{ width: 40, height: 40, color: '#ffffff' }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            All caught up!
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
            There are no items pending review. New submissions will appear here when editors submit
            content for approval.
          </Typography>
        </Box>
      ) : displayItems.length === 0 && items.length > 0 ? (
        /* Filtered to empty */
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 6,
            textAlign: 'center',
          }}
        >
          <Inbox style={{ width: 36, height: 36, opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            No items match the selected filter.
          </Typography>
        </Box>
      ) : (
        /* ── Timeline ─────────────────────────────────────── */
        <Box sx={{ position: 'relative', pl: 4 }}>
          {/* Vertical connecting line */}
          <Box
            sx={{
              position: 'absolute',
              left: 11,
              top: 12,
              bottom: 12,
              width: 2,
              bgcolor: 'divider',
              borderRadius: 1,
            }}
          />

          {displayItems.map((item, idx) => {
            const isActionLoading = actionLoading === item.metadata.id;

            return (
              <Box
                key={item.metadata.id}
                sx={{
                  position: 'relative',
                  pb: idx < displayItems.length - 1 ? 1.5 : 0,
                }}
              >
                {/* Timeline dot */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -28,
                    top: 16,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: item.contentTypeColor,
                    border: '2px solid',
                    borderColor: 'background.paper',
                    boxShadow: (theme) => `0 0 0 2px ${theme.palette.divider}`,
                    zIndex: 1,
                  }}
                />

                {/* Card */}
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: selectedIds.has(item.metadata.id) ? 'primary.main' : 'divider',
                    bgcolor: 'background.paper',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: (theme) => `0 2px 8px ${theme.palette.action.hover}`,
                    },
                  }}
                  onClick={() => onEdit(item.metadata.source_table, item.metadata.source_id)}
                >
                  {/* Top row: checkbox + title + content type badge */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 1.5,
                      mb: 1,
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(item.metadata.id)}
                      onChange={() => toggleSelect(item.metadata.id)}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ mt: -0.5, ml: -0.5, mr: -0.5 }}
                    />
                    <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
                      {item.title}
                    </Typography>
                    <Chip
                      label={item.contentTypeName}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: item.contentTypeColor + '18',
                        color: item.contentTypeColor,
                        flexShrink: 0,
                      }}
                    />
                  </Box>

                  {/* Meta row: submitted by, waiting duration */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      mb: 1.5,
                    }}
                  >
                    {item.lastEditedBy && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <User style={{ width: 12, height: 12 }} />
                        Submitted by {item.lastEditedBy.slice(0, 8)}...
                      </Typography>
                    )}
                    {item.metadata.last_edited_at && (
                      <Tooltip title={new Date(item.metadata.last_edited_at).toLocaleString()}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          <Clock style={{ width: 12, height: 12 }} />
                          Waiting {item.waitingDuration}
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>

                  {/* Action buttons */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      pt: 1,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      disabled={isActionLoading}
                      onClick={() => handleApprove(item)}
                      startIcon={
                        isActionLoading ? (
                          <CircularProgress size={14} color="inherit" aria-label="Loading" />
                        ) : (
                          <ThumbsUp style={{ width: 14, height: 14 }} />
                        )
                      }
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        py: 0.5,
                      }}
                    >
                      Approve
                    </Button>

                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      disabled={isActionLoading}
                      onClick={() => handleReject(item)}
                      startIcon={<ThumbsDown style={{ width: 14, height: 14 }} />}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.8rem',
                        py: 0.5,
                      }}
                    >
                      Request Changes
                    </Button>

                    <Box sx={{ flex: 1 }} />

                    <Tooltip title="Open in editor">
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => onEdit(item.metadata.source_table, item.metadata.source_id)}
                        startIcon={<Edit style={{ width: 14, height: 14 }} />}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 500,
                          fontSize: '0.8rem',
                          color: 'text.secondary',
                        }}
                      >
                        Review
                      </Button>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
