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
}

export const ReviewBulkBar = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkApprove,
  onBulkReject,
  loading,
}: ReviewBulkBarProps) => {
  if (selectedCount === 0) return null;

  return (
    // `shadow-soft-lg` is the system's floating-surface elevation. This carried an
    // inline `boxShadow` literal, which evaded the hex/hsl ESLint rule only by being
    // in a `style` prop rather than a class.
    <div className="sticky bottom-4 mx-4 px-4 py-4 flex items-center gap-4 bg-card rounded-container shadow-soft-lg z-50">
      <Badge>{selectedCount} selected</Badge>

      {selectedCount < totalCount && (
        <Button size="sm" variant="ghost" onClick={onSelectAll} className="normal-case">
          <CheckCheck size={14} className="mr-1" />
          {/* "on this page" is load-bearing, not padding: `totalCount` is
              `items.length` — the 50 rows currently rendered — while the queue total is
              in the thousands. "Select all (50)" beside a header reading 3,997 claims
              to be selecting everything and is not. */}
          Select all on this page ({totalCount})
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={onClearSelection} className="normal-case">
        Clear
      </Button>

      <div className="flex-1" />

      {/* Bulk REJECT is the asymmetry that mattered: bulk approve has always had a
          full AlertDialog, while rejecting 50 rows was one unconfirmed click. The
          confirmation lives in TriageView, which owns the selection and knows what is
          in it; this stays a plain button so the bar has one job. */}
      <Button
        size="sm"
        variant="outline"
        onClick={onBulkReject}
        disabled={loading}
        className="normal-case border-destructive text-destructive"
      >
        <X size={14} className="mr-1" />
        Reject
      </Button>

      <Button size="sm" onClick={onBulkApprove} disabled={loading} className="normal-case">
        <Check size={14} className="mr-1" />
        Approve
      </Button>
    </div>
  );
};

export default ReviewBulkBar;
