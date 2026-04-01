/**
 * useReviewBulkActions — Extracted bulk action logic for the Review & Moderation page.
 * Handles all 7 bulk operations via a single server-side RPC (admin_bulk_review_action)
 * to avoid client-side row limits and RLS issues.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Inbox,
  CheckCheck,
  Zap,
  Clock,
  XCircle,
  Sparkles,
  VolumeX,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ReviewCounts } from '@/hooks/useReviewCounts';

// ── Types ────────────────────────────────────────────────────────────────────────

export type BulkActionType =
  | 'approve'
  | 'enrich'
  | 'dedup'
  | 'reject_stale'
  | 'approve_confident'
  | 'dismiss_low'
  | 'reject_all';

export interface BulkActionLabel {
  title: string;
  desc: string;
  icon: typeof Inbox;
  color: string;
  severity?: 'warning' | 'error';
}

// ── Hook ─────────────────────────────────────────────────────────────────────────

export function useReviewBulkActions(
  counts: ReviewCounts,
  userId?: string,
  onComplete?: () => void,
) {
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkActionType | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);

  const c = counts;

  const bulkActionLabels = useMemo<Record<BulkActionType, BulkActionLabel>>(() => ({
    approve: {
      title: 'Approve Everything',
      desc: `This will approve all ${c.tagSuggestions} tag suggestions, publish all ${c.cmsReview} content items in review, and resolve all ${c.moderation} moderation flags.`,
      icon: CheckCheck,
      color: '#10b981',
    },
    enrich: {
      title: 'Apply All Enrichments',
      desc: `This will apply all ${c.automation} pending automation suggestions to their target content. Suggested values will overwrite current values.`,
      icon: Zap,
      color: '#DB2777',
    },
    dedup: {
      title: 'Resolve Duplicates',
      desc: `This will auto-approve all unique staging items and auto-reject all confirmed duplicates from the staging queue.`,
      icon: Inbox,
      color: '#ea580c',
    },
    reject_stale: {
      title: 'Reject Stale Items',
      desc: 'This will reject/dismiss all items older than 7 days across moderation flags, tag suggestions, and staging items.',
      icon: Clock,
      color: '#6b7280',
    },
    approve_confident: {
      title: 'Approve High-Confidence',
      desc: 'This will approve only tag suggestions with confidence >= 80%. Low-confidence items are left for manual review.',
      icon: Sparkles,
      color: '#0ea5e9',
    },
    dismiss_low: {
      title: 'Dismiss Low-Severity',
      desc: 'This will dismiss all info and warning-level automation flags. Error and critical severity flags are kept for manual review.',
      icon: VolumeX,
      color: '#a855f7',
    },
    reject_all: {
      title: 'Reject Everything',
      desc: `This will reject ALL ${c.total} pending items across every queue: moderation flags, tag suggestions, CMS content (back to draft), and staging items.`,
      icon: XCircle,
      color: '#ef4444',
      severity: 'error',
    },
  }), [c.tagSuggestions, c.cmsReview, c.moderation, c.automation, c.total]);

  const openBulkDialog = (action: BulkActionType) => {
    setBulkAction(action);
    setBulkResult(null);
    setBulkDialogOpen(true);
  };

  const closeBulkDialog = () => {
    if (!bulkRunning) setBulkDialogOpen(false);
  };

  const handleBulkExecute = useCallback(async () => {
    if (!bulkAction || !userId) return;
    setBulkRunning(true);

    try {
      const { data, error } = await supabase.rpc('admin_bulk_review_action' as any, {
        p_action: bulkAction,
        p_user_id: userId,
      });

      if (error) {
        console.error('Bulk action RPC error:', error);
        setBulkResult({ success: 0, failed: 1 });
        toast.error(`Bulk action failed: ${error.message}`);
      } else {
        const result = data as { success: number; failed: number; error?: string };
        if (result.error) {
          setBulkResult({ success: 0, failed: 1 });
          toast.error(`Bulk action failed: ${result.error}`);
        } else {
          setBulkResult({ success: result.success, failed: result.failed });
          if (result.success > 0) {
            toast.success(`${result.success} items processed successfully`);
          }
        }
      }
    } catch (err) {
      console.error('Bulk action error:', err);
      setBulkResult({ success: 0, failed: 1 });
      toast.error('Bulk action failed');
    }

    setBulkRunning(false);
    onComplete?.();
  }, [bulkAction, userId, onComplete]);

  return {
    bulkDialogOpen,
    bulkAction,
    bulkRunning,
    bulkResult,
    bulkActionLabels,
    openBulkDialog,
    closeBulkDialog,
    handleBulkExecute,
  };
}
