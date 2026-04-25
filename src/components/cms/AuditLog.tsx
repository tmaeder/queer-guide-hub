/**
 * AuditLog
 * Displays the CMS audit trail. Can show content-specific or global entries.
 * Supports filtering by action type and pagination.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  CircularProgress,
  Alert,
  Divider,
  Avatar,
  Chip,
  Tooltip,
  Select,
  MenuItem,
  Pagination,
} from '@mui/material';
import { History, Clock, User } from 'lucide-react';
import { useCMSAudit } from '@/hooks/useCMSAudit';

/** Relative time formatter */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/** Human-readable action label */
function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Color for action type chips */
function getActionColor(
  action: string,
): 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' {
  if (action.includes('publish') || action.includes('approved')) return 'success';
  if (action.includes('archive') || action.includes('delete')) return 'error';
  if (action.includes('review') || action.includes('change_request')) return 'warning';
  if (action.includes('create') || action.includes('restore')) return 'info';
  if (action.includes('workflow')) return 'primary';
  return 'default';
}

/** Extract known action values for filtering */
const KNOWN_ACTIONS = [
  'workflow_draft_to_review',
  'workflow_draft_to_published',
  'workflow_review_to_published',
  'workflow_review_to_draft',
  'workflow_published_to_archived',
  'workflow_published_to_draft',
  'workflow_archived_to_draft',
  'content_created',
  'content_updated',
  'content_deleted',
  'revision_created',
  'revision_restored',
  'comment_added',
  'media_uploaded',
  'media_deleted',
];

interface AuditLogProps {
  sourceTable?: string;
  sourceId?: string;
}

const PAGE_SIZE = 20;

export function AuditLog({ sourceTable, sourceId }: AuditLogProps) {
  const { entries, loading, error, totalCount, loadForContent, loadGlobal } = useCMSAudit();
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const isContentSpecific = !!(sourceTable && sourceId);

  const loadData = useCallback(() => {
    if (isContentSpecific) {
      loadForContent(sourceTable!, sourceId!);
    } else {
      loadGlobal({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter !== 'all' ? actionFilter : undefined,
      });
    }
  }, [isContentSpecific, sourceTable, sourceId, page, actionFilter, loadForContent, loadGlobal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFilterChange = (newAction: string) => {
    setActionFilter(newAction);
    setPage(1);
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
  };

  // For content-specific mode, filter client-side
  const displayEntries =
    isContentSpecific && actionFilter !== 'all'
      ? entries.filter((e) => e.action === actionFilter)
      : entries;

  const totalPages = isContentSpecific
    ? Math.ceil(displayEntries.length / PAGE_SIZE)
    : Math.ceil(totalCount / PAGE_SIZE);

  // Paginate client-side for content-specific mode
  const paginatedEntries = isContentSpecific
    ? displayEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : displayEntries;

  // Collect unique actions for the filter dropdown
  const uniqueActions = isContentSpecific
    ? [...new Set(entries.map((e) => e.action))]
    : KNOWN_ACTIONS;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <History size={18} className="text-gray-500" />
          <Typography variant="subtitle1" fontWeight={600}>
            Audit Log
          </Typography>
          {totalCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              ({totalCount} entr{totalCount !== 1 ? 'ies' : 'y'})
            </Typography>
          )}
        </Stack>

        <Select
          value={actionFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          size="small"
          sx={{ minWidth: 180, fontSize: '0.8rem' }}
        >
          <MenuItem value="all">All Actions</MenuItem>
          {uniqueActions.map((action) => (
            <MenuItem key={action} value={action} sx={{ fontSize: '0.8rem' }}>
              {formatAction(action)}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} aria-label="Loading" />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load audit log: {error}
        </Alert>
      ) : paginatedEntries.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <History size={24} className="text-gray-400 mx-auto mb-2" />
          <Typography variant="body2" color="text.secondary">
            No audit entries found.
          </Typography>
        </Paper>
      ) : (
        <>
          <Stack spacing={0} divider={<Divider />}>
            {paginatedEntries.map((entry) => {
              const actorName =
                entry.actor?.display_name || entry.actor?.email || 'System';
              const initials = actorName
                .split(/[\s@]/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() || '')
                .join('');

              return (
                <Box
                  key={entry.id}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    py: 1.5,
                    px: 1,
                    '&:hover': { backgroundColor: 'action.hover' },
                    borderRadius: 1,
                  }}
                >
                  <Avatar
                    sx={{ width: 28, height: 28, fontSize: '0.6rem', bgcolor: 'grey.400', mt: 0.25 }}
                  >
                    {initials || <User size={14} />}
                  </Avatar>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Typography variant="body2" fontWeight={600}>
                        {actorName}
                      </Typography>
                      <Chip
                        size="small"
                        label={formatAction(entry.action)}
                        color={getActionColor(entry.action)}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 20 }}
                      />
                      {entry.source_table && !isContentSpecific && (
                        <Chip
                          size="small"
                          label={entry.source_table}
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                      <Clock size={12} className="text-gray-400" />
                      <Tooltip title={new Date(entry.timestamp).toLocaleString()}>
                        <Typography variant="caption" color="text.secondary">
                          {formatRelativeTime(entry.timestamp)}
                        </Typography>
                      </Tooltip>
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Stack>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                size="small"
                color="primary"
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
