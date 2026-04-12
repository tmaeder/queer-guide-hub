/**
 * ReviewBulkBar — Sticky bottom bar for bulk review actions.
 *
 * Appears when items are selected. Shows selection count and action buttons.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import { Check, X, CheckCheck } from 'lucide-react';

interface ReviewBulkBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  loading?: boolean;
}

export const ReviewBulkBar: React.FC<ReviewBulkBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkApprove,
  onBulkReject,
  loading,
}) => {
  if (selectedCount === 0) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'sticky',
        bottom: 16,
        mx: 2,
        px: 2,
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 2,
        zIndex: 50,
      }}
    >
      <Chip
        label={`${selectedCount} selected`}
        color="primary"
        size="small"
      />

      {selectedCount < totalCount && (
        <Button
          size="small"
          variant="text"
          startIcon={<CheckCheck size={14} />}
          onClick={onSelectAll}
          sx={{ textTransform: 'none' }}
        >
          Select all ({totalCount})
        </Button>
      )}

      <Button
        size="small"
        variant="text"
        onClick={onClearSelection}
        sx={{ textTransform: 'none' }}
      >
        Clear
      </Button>

      <Box sx={{ flex: 1 }} />

      <Button
        size="small"
        variant="outlined"
        color="error"
        startIcon={<X size={14} />}
        onClick={onBulkReject}
        disabled={loading}
        sx={{ textTransform: 'none' }}
      >
        Reject
      </Button>

      <Button
        size="small"
        variant="contained"
        color="success"
        startIcon={<Check size={14} />}
        onClick={onBulkApprove}
        disabled={loading}
        sx={{ textTransform: 'none' }}
      >
        Approve
      </Button>
    </Paper>
  );
};

export default ReviewBulkBar;
