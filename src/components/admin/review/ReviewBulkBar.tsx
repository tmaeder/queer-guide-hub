/**
 * ReviewBulkBar — Sticky bottom bar for bulk review actions.
 */

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
  decisionSummary?: string;
  decisionsDisabled?: boolean;
}

export const ReviewBulkBar = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkApprove,
  onBulkReject,
  loading,
  decisionSummary,
  decisionsDisabled = false,
}: ReviewBulkBarProps) => {
  if (selectedCount === 0) return null;

  return (
    <div
      className="sticky bottom-4 mx-4 px-4 py-4 flex items-center gap-4 bg-background z-50"
      style={{ boxShadow: '0 8px 16px hsl(var(--foreground) / 0.15)' }}
    >
      <Badge>{selectedCount} selected</Badge>

      {decisionSummary && (
        <p className="max-w-xl text-2xs leading-relaxed text-muted-foreground">{decisionSummary}</p>
      )}

      {selectedCount < totalCount && (
        <Button size="sm" variant="ghost" onClick={onSelectAll} style={{ textTransform: 'none' }}>
          <CheckCheck size={14} className="mr-1" />
          Select all on this page ({totalCount})
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={onClearSelection}
        style={{ textTransform: 'none' }}
      >
        Clear
      </Button>

      <div className="flex-1" />

      <Button
        size="sm"
        variant="outline"
        onClick={onBulkReject}
        disabled={loading || decisionsDisabled}
        style={{ textTransform: 'none', borderColor: 'hsl(var(--destructive))' }}
        className="text-destructive"
      >
        <X size={14} className="mr-1" />
        Reject
      </Button>

      <Button
        size="sm"
        onClick={onBulkApprove}
        disabled={loading || decisionsDisabled}
        style={{ textTransform: 'none' }}
      >
        <Check size={14} className="mr-1" />
        Approve
      </Button>
    </div>
  );
};

export default ReviewBulkBar;
