import { useState, useEffect, useCallback } from 'react';
import { useModeration, ModerationFilters } from '@/hooks/useModeration';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { api } from '@/integrations/api/client';
import {
  Flag,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import LinearProgress from '@mui/material/LinearProgress';
import Pagination from '@mui/material/Pagination';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#f59e0b',
  IN_REVIEW: '#3b82f6',
  RESOLVED: '#10b981',
  REJECTED: '#6b7280',
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  REVIEW: 'Needs Review',
  CORRECTION: 'Correction',
  DELETE_REQUEST: 'Delete Request',
  LINK_ISSUE: 'Link Issue',
  DUPLICATE: 'Duplicate',
  OTHER: 'Other',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venue',
  events: 'Event',
  cities: 'City',
  countries: 'Country',
  personalities: 'Personality',
  news_articles: 'News',
  hotels: 'Hotel',
  queer_villages: 'Village',
  festivals: 'Festival',
  marketplace_listings: 'Marketplace',
};

export function ModerationQueue() {
  const { flags, totalCount, loading, fetchFlags, updateFlagStatus, bulkUpdateFlags } =
    useModeration();
  const { canManageContent } = useAdminRoles();
  const [filters, setFilters] = useState<ModerationFilters>({});
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveAction, setResolveAction] = useState<'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolveTargetIds, setResolveTargetIds] = useState<string[]>([]);

  const pageSize = 20;

  useEffect(() => {
    fetchFlags(filters, page, pageSize);
  }, [fetchFlags, filters, page]);

  const handleFilterChange = (key: keyof ModerationFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
    setPage(0);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const [selectAllCount, setSelectAllCount] = useState(0);

  const toggleSelectAll = async () => {
    if (selectedIds.length > 0) {
      setSelectedIds([]);
      setSelectAllCount(0);
    } else {
      // Fetch ALL matching IDs across pages
      let query = api
        .from('moderation_flags')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.flag_type) query = query.eq('flag_type', filters.flag_type);
      if (filters.content_type) query = query.eq('content_type', filters.content_type);
      if (filters.source) query = query.eq('source', filters.source);

      const { data } = await query;
      const allIds = (data || []).map((f: any) => f.id);
      setSelectedIds(allIds);
      setSelectAllCount(allIds.length);
    }
  };

  const openResolveDialog = (ids: string[], action: 'RESOLVED' | 'REJECTED') => {
    setResolveTargetIds(ids);
    setResolveAction(action);
    setResolutionNote('');
    setResolveDialogOpen(true);
  };

  const handleResolve = async () => {
    if (resolveTargetIds.length === 1) {
      const result = await updateFlagStatus(
        resolveTargetIds[0],
        resolveAction,
        resolutionNote || undefined,
      );
      if (result.success) {
        toast.success(`Flag ${resolveAction.toLowerCase()}`);
      } else {
        toast.error(result.error || 'Failed to update flag');
      }
    } else {
      const result = await bulkUpdateFlags(
        resolveTargetIds,
        resolveAction,
        resolutionNote || undefined,
      );
      if (result.success) {
        toast.success(`${resolveTargetIds.length} flags ${resolveAction.toLowerCase()}`);
      } else {
        toast.error(result.error || 'Failed to update flags');
      }
    }
    setResolveDialogOpen(false);
    setSelectedIds([]);
  };

  const openCounts = flags.filter((f) => f.status === 'OPEN').length;

  if (!canManageContent()) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography>You do not have permission to access this page.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="sm" onClick={() => openResolveDialog(selectedIds, 'RESOLVED')}>
            <CheckCircle style={{ width: 14, height: 14, marginRight: 4 }} />
            Resolve ({selectedIds.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openResolveDialog(selectedIds, 'REJECTED')}
          >
            <XCircle style={{ width: 14, height: 14, marginRight: 4 }} />
            Reject ({selectedIds.length})
          </Button>
        </Box>
      )}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filters.status || ''}
            label="Status"
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="OPEN">Open</MenuItem>
            <MenuItem value="IN_REVIEW">In Review</MenuItem>
            <MenuItem value="RESOLVED">Resolved</MenuItem>
            <MenuItem value="REJECTED">Rejected</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Flag Type</InputLabel>
          <Select
            value={filters.flag_type || ''}
            label="Flag Type"
            onChange={(e) => handleFilterChange('flag_type', e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(FLAG_TYPE_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Content Type</InputLabel>
          <Select
            value={filters.content_type || ''}
            label="Content Type"
            onChange={(e) => handleFilterChange('content_type', e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Source</InputLabel>
          <Select
            value={filters.source || ''}
            label="Source"
            onChange={(e) => handleFilterChange('source', e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="user">User</MenuItem>
            <MenuItem value="system">System</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {loading && <LinearProgress />}

      {/* Flags list */}
      {flags.length === 0 && !loading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Flag
            style={{
              width: 48,
              height: 48,
              color: '#d1d5db',
              marginBottom: 16,
              marginLeft: 'auto',
              marginRight: 'auto',
              display: 'block',
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            No flags found
          </Typography>
          <Typography color="text.secondary">
            {Object.keys(filters).length > 0
              ? 'Try adjusting your filters.'
              : 'All clear! No moderation flags to review.'}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Select all */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox
              checked={selectedIds.length > 0 && selectedIds.length >= totalCount}
              indeterminate={selectedIds.length > 0 && selectedIds.length < totalCount}
              onChange={toggleSelectAll}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected (all pages)`
                : `Select all (${totalCount})`}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {flags.map((flag) => (
              <Card
                key={flag.id}
                sx={{
                  border: '1px solid',
                  borderColor: selectedIds.includes(flag.id) ? 'primary.main' : 'divider',
                  '&:hover': { boxShadow: 2 },
                  transition: 'all 200ms',
                }}
              >
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Checkbox
                      checked={selectedIds.includes(flag.id)}
                      onChange={() => toggleSelect(flag.id)}
                      size="small"
                      sx={{ mt: -0.5 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Top row: badges + actions */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 0.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Chip
                          label={flag.status}
                          size="small"
                          sx={{
                            bgcolor: STATUS_COLORS[flag.status] || '#6b7280',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                        <Chip
                          label={FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={CONTENT_TYPE_LABELS[flag.content_type] || flag.content_type}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          icon={
                            flag.source === 'system' ? (
                              <Bot style={{ width: 12, height: 12 }} />
                            ) : (
                              <User style={{ width: 12, height: 12 }} />
                            )
                          }
                          label={flag.source === 'system' ? 'System' : 'User'}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                        <Box sx={{ flex: 1 }} />
                        <Typography variant="caption" color="text.secondary">
                          {new Date(flag.created_at).toLocaleDateString()}{' '}
                          {new Date(flag.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                      </Box>

                      {/* Reason */}
                      <Typography variant="body2" sx={{ mt: 0.5, mb: 1 }}>
                        {flag.reason}
                      </Typography>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {flag.status === 'OPEN' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => updateFlagStatus(flag.id, 'IN_REVIEW')}
                            >
                              <Eye style={{ width: 12, height: 12, marginRight: 4 }} />
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog([flag.id], 'RESOLVED')}
                            >
                              <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog([flag.id], 'REJECTED')}
                            >
                              <XCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Reject
                            </Button>
                          </>
                        )}
                        {flag.status === 'IN_REVIEW' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openResolveDialog([flag.id], 'RESOLVED')}
                            >
                              <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog([flag.id], 'REJECTED')}
                            >
                              <XCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Reject
                            </Button>
                          </>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => setExpandedId(expandedId === flag.id ? null : flag.id)}
                        >
                          {expandedId === flag.id ? (
                            <ChevronUp style={{ width: 16, height: 16 }} />
                          ) : (
                            <ChevronDown style={{ width: 16, height: 16 }} />
                          )}
                        </IconButton>
                      </Box>

                      {/* Expanded detail */}
                      <Collapse in={expandedId === flag.id}>
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mb: 0.5 }}
                          >
                            Content ID: {flag.content_id}
                          </Typography>
                          {flag.reporter_user_id && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mb: 0.5 }}
                            >
                              Reporter: {flag.reporter_user_id}
                            </Typography>
                          )}
                          {flag.suggested_changes && (
                            <Box sx={{ mt: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                              >
                                Suggested Changes:
                              </Typography>
                              <Box
                                component="pre"
                                sx={{
                                  fontSize: '0.75rem',
                                  overflow: 'auto',
                                  maxHeight: 200,
                                  p: 1,
                                  bgcolor: 'background.paper',
                                  borderRadius: 1,
                                }}
                              >
                                {JSON.stringify(flag.suggested_changes, null, 2)}
                              </Box>
                            </Box>
                          )}
                          {flag.resolution_note && (
                            <Box sx={{ mt: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                              >
                                Resolution Note:
                              </Typography>
                              <Typography variant="body2">{flag.resolution_note}</Typography>
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Pagination */}
          {totalCount > pageSize && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={Math.ceil(totalCount / pageSize)}
                page={page + 1}
                onChange={(_, p) => setPage(p - 1)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      {/* Resolve dialog */}
      <Dialog
        open={resolveDialogOpen}
        onClose={() => setResolveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {resolveAction === 'RESOLVED' ? 'Resolve' : 'Reject'}{' '}
          {resolveTargetIds.length > 1 ? `${resolveTargetIds.length} flags` : 'flag'}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Resolution note (optional)"
            multiline
            rows={3}
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={loading}>
            {resolveAction === 'RESOLVED' ? 'Resolve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ModerationQueue;
