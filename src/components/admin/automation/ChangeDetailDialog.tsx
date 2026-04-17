/**
 * ChangeDetailDialog — Shows old vs new diff for a proposed content change.
 */

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import type { ContentChange } from '@/hooks/useAutomation';

interface Props {
  change: ContentChange | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRevert: (id: string) => void;
}

function formatValue(value: unknown): string {
  if (value == null) return '(empty)';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

export function ChangeDetailDialog({
  change,
  open,
  onClose,
  onApprove,
  onReject,
  onRevert,
}: Props) {
  if (!change) return null;

  const isApplied = change.status === 'applied' || change.status === 'auto_approved';
  const isPending = change.status === 'pending';
  const isFlag = change.change_type === 'flag';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Change Detail
        <Chip size="small" label={change.change_type} color="info" sx={{ ml: 1 }} />
        <Chip
          size="small"
          label={change.status}
          color={isPending ? 'warning' : isApplied ? 'success' : 'default'}
        />
      </DialogTitle>

      <DialogContent dividers>
        {/* Metadata */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Content
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {change.content_name}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Type
            </Typography>
            <Typography variant="body2">{change.content_type}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Field
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {change.field_name}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Confidence
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {Math.round(change.confidence * 100)}%
            </Typography>
          </Box>
        </Box>

        {/* Reasoning */}
        {change.reasoning && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Reasoning
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}
            >
              {change.reasoning}
            </Typography>
          </Box>
        )}

        {/* Diff view */}
        {!isFlag && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 0.5, display: 'block' }}
              >
                Old Value
              </Typography>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: '#fef2f2',
                  border: '1px solid #fecaca',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {formatValue(change.old_value)}
              </Box>
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 0.5, display: 'block' }}
              >
                New Value
              </Typography>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {formatValue(change.new_value)}
              </Box>
            </Box>
          </Box>
        )}

        {isFlag && (
          <Box sx={{ p: 2, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 1 }}>
            <Typography variant="body2">
              This is a <strong>flag-only</strong> change. No data modification proposed — review
              the issue described above.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {isPending && (
          <>
            <Button variant="outline" onClick={() => onReject(change.id)}>
              <XCircle size={14} />
              Reject
            </Button>
            {!isFlag && (
              <Button onClick={() => onApprove(change.id)}>
                <CheckCircle2 size={14} />
                Approve & Apply
              </Button>
            )}
            {isFlag && (
              <Button variant="outline" onClick={() => onReject(change.id)}>
                Dismiss Flag
              </Button>
            )}
          </>
        )}
        {isApplied && (
          <Button variant="outline" onClick={() => onRevert(change.id)}>
            <RotateCcw size={14} />
            Revert
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
