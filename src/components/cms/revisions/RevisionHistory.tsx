/**
 * RevisionHistory
 * Full timeline of revisions for a content item.
 * Each revision shows revision number, change summary, author, and timestamp.
 * Supports viewing diffs and restoring revisions.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Avatar,
  Tooltip,
} from '@mui/material';
import { History, Eye, RotateCcw, Clock, User } from 'lucide-react';
import { useCMSRevisions } from '@/hooks/useCMSRevisions';
import type { CMSRevision } from '@/types/cms';
import { RevisionDiff } from './RevisionDiff';

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

interface RevisionHistoryProps {
  sourceTable: string;
  sourceId: string;
}

export function RevisionHistory({ sourceTable, sourceId }: RevisionHistoryProps) {
  const { revisions, loading, error, loadRevisions, restoreRevision, diffRevisions } =
    useCMSRevisions();

  const [selectedDiff, setSelectedDiff] = useState<Record<string, { old: unknown; new: unknown }> | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<CMSRevision | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadRevisions(sourceTable, sourceId);
  }, [sourceTable, sourceId, loadRevisions]);

  const handleViewDiff = (revision: CMSRevision, index: number) => {
    // If the revision has pre-computed changes, use those
    if (revision.changes && Object.keys(revision.changes).length > 0) {
      setSelectedDiff(revision.changes);
      return;
    }

    // Otherwise diff against the previous revision (next in the list since sorted desc)
    const prevRevision = revisions[index + 1];
    if (prevRevision) {
      const diffs = diffRevisions(prevRevision, revision);
      const changesMap: Record<string, { old: unknown; new: unknown }> = {};
      for (const d of diffs) {
        changesMap[d.field] = { old: d.oldValue, new: d.newValue };
      }
      setSelectedDiff(changesMap);
    } else {
      // First revision ever -- show all fields as "added"
      const changesMap: Record<string, { old: unknown; new: unknown }> = {};
      const snapshot = revision.snapshot || {};
      for (const [key, val] of Object.entries(snapshot)) {
        if (!['id', 'created_at', 'updated_at', 'created_by'].includes(key)) {
          changesMap[key] = { old: undefined, new: val };
        }
      }
      setSelectedDiff(changesMap);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setIsRestoring(true);
    const success = await restoreRevision(restoreTarget);
    setIsRestoring(false);
    setRestoreTarget(null);
    if (success) {
      // Reload revisions to show the new restore entry
      await loadRevisions(sourceTable, sourceId);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load revisions: {error}
      </Alert>
    );
  }

  if (revisions.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <History size={24} className="text-gray-400 mx-auto mb-2" />
        <Typography variant="body2" color="text.secondary">
          No revisions yet. Changes will be tracked once the content is saved.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <History size={18} className="text-gray-500" />
        <Typography variant="subtitle1" fontWeight={600}>
          Revision History
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ({revisions.length} revision{revisions.length !== 1 ? 's' : ''})
        </Typography>
      </Stack>

      {/* Diff viewer */}
      {selectedDiff && (
        <Box sx={{ mb: 3 }}>
          <RevisionDiff changes={selectedDiff} onClose={() => setSelectedDiff(null)} />
        </Box>
      )}

      {/* Timeline */}
      <Stack spacing={0}>
        {revisions.map((revision, index) => {
          const authorName =
            revision.author?.display_name || revision.author?.email || 'Unknown';
          const initials = authorName
            .split(/[\s@]/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0]?.toUpperCase() || '')
            .join('');

          return (
            <Box key={revision.id}>
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  py: 1.5,
                  px: 2,
                  borderRadius: 1,
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                {/* Timeline indicator */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    pt: 0.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: index === 0 ? 'primary.main' : 'grey.400',
                      flexShrink: 0,
                    }}
                  />
                  {index < revisions.length - 1 && (
                    <Box
                      sx={{
                        width: 1,
                        flex: 1,
                        backgroundColor: 'divider',
                        mt: 0.5,
                      }}
                    />
                  )}
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600}>
                      Revision #{revision.revision_number}
                    </Typography>
                    {index === 0 && (
                      <Typography
                        variant="caption"
                        sx={{
                          backgroundColor: 'primary.main',
                          color: 'primary.contrastText',
                          px: 0.75,
                          py: 0.125,
                          borderRadius: 0.5,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          lineHeight: 1.4,
                        }}
                      >
                        CURRENT
                      </Typography>
                    )}
                  </Stack>

                  {revision.change_summary && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {revision.change_summary}
                    </Typography>
                  )}

                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Avatar
                        sx={{ width: 18, height: 18, fontSize: '0.55rem', bgcolor: 'grey.400' }}
                      >
                        {initials || <User size={10} />}
                      </Avatar>
                      <Typography variant="caption" color="text.secondary">
                        {authorName}
                      </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Clock size={12} className="text-gray-400" />
                      <Tooltip title={new Date(revision.created_at).toLocaleString()}>
                        <Typography variant="caption" color="text.secondary">
                          {formatRelativeTime(revision.created_at)}
                        </Typography>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  {/* Actions */}
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<Eye size={14} />}
                      onClick={() => handleViewDiff(revision, index)}
                      sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                    >
                      View
                    </Button>
                    {index > 0 && (
                      <Button
                        size="small"
                        variant="text"
                        color="warning"
                        startIcon={<RotateCcw size={14} />}
                        onClick={() => setRestoreTarget(revision)}
                        sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                      >
                        Restore
                      </Button>
                    )}
                  </Stack>
                </Box>
              </Box>

              {index < revisions.length - 1 && <Divider sx={{ ml: 4.5 }} />}
            </Box>
          );
        })}
      </Stack>

      {/* Restore confirmation dialog */}
      <Dialog
        open={!!restoreTarget}
        onClose={() => !isRestoring && setRestoreTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Restore Revision</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to restore to{' '}
            <strong>Revision #{restoreTarget?.revision_number}</strong>? This will overwrite
            the current content and create a new revision entry.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRestoreTarget(null)}
            disabled={isRestoring}
            color="inherit"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestoreConfirm}
            disabled={isRestoring}
            variant="contained"
            color="warning"
            size="small"
            startIcon={
              isRestoring ? <CircularProgress size={14} color="inherit" /> : <RotateCcw size={14} />
            }
          >
            {isRestoring ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
