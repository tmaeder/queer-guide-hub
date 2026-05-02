/**
 * ReviewBulkBar — Sticky bottom bar for bulk review actions.
 */

import React from 'react';
import { Check, X, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <div
      className="sticky bottom-4 mx-4 px-4 py-3 flex items-center gap-4 bg-background z-50"
      style={{ boxShadow: '0 8px 16px rgba(0,0,0,0.15)' }}
    >
      <Badge>{selectedCount} selected</Badge>

      {selectedCount < totalCount && (
        <Button size="sm" variant="ghost" onClick={onSelectAll} style={{ textTransform: 'none' }}>
          <CheckCheck size={14} className="mr-1" />
          Select all ({totalCount})
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={onClearSelection} style={{ textTransform: 'none' }}>
        Clear
      </Button>

      <div className="flex-1" />

      <Button
        size="sm"
        variant="outline"
        onClick={onBulkReject}
        disabled={loading}
        style={{ textTransform: 'none', borderColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))' }}
      >
        <X size={14} className="mr-1" />
        Reject
      </Button>

      <Button
        size="sm"
        onClick={onBulkApprove}
        disabled={loading}
        style={{ textTransform: 'none', backgroundColor: 'hsl(142, 71%, 45%)' }}
      >
        <Check size={14} className="mr-1" />
        Approve
      </Button>
    </div>
  );
};

export default ReviewBulkBar;
