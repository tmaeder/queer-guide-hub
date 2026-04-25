/**
 * RevisionPanel
 * Compact sidebar panel showing the last 5 revisions.
 * Designed for the editor sidebar. Has a "View all" button to expand full history.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  CircularProgress,
  Tooltip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import { History, Clock, X } from 'lucide-react';
import { useCMSRevisions } from '@/hooks/useCMSRevisions';
import { RevisionHistory } from '@/components/cms/revisions/RevisionHistory';

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

interface RevisionPanelProps {
  sourceTable: string;
  sourceId: string;
}

export function RevisionPanel({ sourceTable, sourceId }: RevisionPanelProps) {
  const { revisions, loading, loadRevisions } = useCMSRevisions();
  const [showFullHistory, setShowFullHistory] = useState(false);

  useEffect(() => {
    loadRevisions(sourceTable, sourceId);
  }, [sourceTable, sourceId, loadRevisions]);

  const recentRevisions = revisions.slice(0, 5);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={18} aria-label="Loading" />
      </Box>
    );
  }

  return (
    <>
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <History size={14} className="text-gray-500" />
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Revisions
          </Typography>
        </Stack>

        {recentRevisions.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No revisions yet.
          </Typography>
        ) : (
          <Stack spacing={0} divider={<Divider />}>
            {recentRevisions.map((revision) => (
              <Box
                key={revision.id}
                sx={{
                  py: 1,
                  px: 0.5,
                  '&:hover': { backgroundColor: 'action.hover' },
                  borderRadius: 0.5,
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                    #{revision.revision_number}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Clock size={10} className="text-gray-400" />
                    <Tooltip title={new Date(revision.created_at).toLocaleString()}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        {formatRelativeTime(revision.created_at)}
                      </Typography>
                    </Tooltip>
                  </Stack>
                </Stack>

                {revision.change_summary && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '0.7rem',
                      mt: 0.25,
                    }}
                  >
                    {revision.change_summary}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}

        {revisions.length > 5 && (
          <Button
            size="small"
            variant="text"
            onClick={() => setShowFullHistory(true)}
            sx={{ mt: 1, fontSize: '0.75rem', textTransform: 'none' }}
            fullWidth
          >
            View all {revisions.length} revisions
          </Button>
        )}

        {revisions.length > 0 && revisions.length <= 5 && (
          <Button
            size="small"
            variant="text"
            onClick={() => setShowFullHistory(true)}
            sx={{ mt: 1, fontSize: '0.75rem', textTransform: 'none' }}
            fullWidth
          >
            View full history
          </Button>
        )}
      </Box>

      {/* Full history dialog */}
      <Dialog
        open={showFullHistory}
        onClose={() => setShowFullHistory(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 2, maxHeight: '80vh' },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={600}>
            Revision History
          </Typography>
          <IconButton size="small" onClick={() => setShowFullHistory(false)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <RevisionHistory sourceTable={sourceTable} sourceId={sourceId} />
        </DialogContent>
      </Dialog>
    </>
  );
}
