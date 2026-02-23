/**
 * WorkflowTransitionDialog
 * MUI Dialog for confirming a workflow state transition.
 * Optionally requires a comment before proceeding.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Stack,
  CircularProgress,
} from '@mui/material';
import { AlertCircle } from 'lucide-react';
import type { WorkflowTransition } from '@/types/cms';

interface WorkflowTransitionDialogProps {
  open: boolean;
  onClose: () => void;
  transition: WorkflowTransition;
  onConfirm: (comment?: string) => void;
  loading?: boolean;
}

export function WorkflowTransitionDialog({
  open,
  onClose,
  transition,
  onConfirm,
  loading = false,
}: WorkflowTransitionDialogProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (transition.requiresComment && !comment.trim()) {
      setError('A comment is required for this action.');
      return;
    }
    setError('');
    onConfirm(comment.trim() || undefined);
  };

  const handleClose = () => {
    if (loading) return;
    setComment('');
    setError('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: { borderRadius: 2 },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="span" fontWeight={600}>
          {transition.label}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {transition.description && (
            <Typography variant="body2" color="text.secondary">
              {transition.description}
            </Typography>
          )}

          <Typography variant="body2" color="text.secondary">
            This will move the content from{' '}
            <strong>{transition.from}</strong> to{' '}
            <strong>{transition.to}</strong>.
          </Typography>

          <TextField
            label={transition.requiresComment ? 'Comment (required)' : 'Comment (optional)'}
            multiline
            minRows={3}
            maxRows={6}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (error) setError('');
            }}
            placeholder="Add a note about this transition..."
            required={transition.requiresComment}
            error={!!error}
            helperText={error}
            fullWidth
            size="small"
          />

          {transition.requiresComment && (
            <Stack direction="row" spacing={1} alignItems="center">
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <Typography variant="caption" color="text.secondary">
                A comment is required to complete this transition.
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading} color="inherit" size="small">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading}
          variant="contained"
          size="small"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {loading ? 'Processing...' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
