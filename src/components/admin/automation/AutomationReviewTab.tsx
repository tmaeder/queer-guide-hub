/**
 * AutomationReviewTab — Automation review queue embedded in the unified Review & Moderation page.
 * Reuses the existing ReviewQueue + ChangeDetailDialog components with the useAutomation hook.
 */

import { useState } from 'react';
import { useAutomation, type ContentChange } from '@/hooks/useAutomation';
import { ReviewQueue } from './ReviewQueue';
import { ChangeDetailDialog } from './ChangeDetailDialog';

export function AutomationReviewTab() {
  const [detailChange, setDetailChange] = useState<ContentChange | null>(null);

  const {
    pendingChanges,
    approveChange,
    rejectChange,
    bulkApprove,
    bulkReject,
    revertChange,
    isApproving,
    isRejecting,
  } = useAutomation();

  return (
    <>
      <ReviewQueue
        changes={pendingChanges}
        onApprove={approveChange}
        onReject={rejectChange}
        onBulkApprove={bulkApprove}
        onBulkReject={bulkReject}
        onViewDetail={setDetailChange}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />

      <ChangeDetailDialog
        change={detailChange}
        open={!!detailChange}
        onClose={() => setDetailChange(null)}
        onApprove={(id) => {
          approveChange(id);
          setDetailChange(null);
        }}
        onReject={(id) => {
          rejectChange(id);
          setDetailChange(null);
        }}
        onRevert={(id) => {
          revertChange(id);
          setDetailChange(null);
        }}
      />
    </>
  );
}
