/**
 * useEditorQueue — cockpit (review-queue) mode for the CMS editor: N/M
 * navigation, approve / request-changes transitions, and the queue keyboard
 * loop ([ / ] prev-next, ⌘/Ctrl+Enter approve).
 */

import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { ContentTypeConfig, EditorState, WorkflowState } from '@/types/cms';
import type { EditorQueue } from '@/components/admin/shell/AdminShell';

interface UseEditorQueueArgs {
  queue?: EditorQueue;
  onNavigate?: (index: number) => void;
  onClose: () => void;
  state: EditorState;
  config: ContentTypeConfig | undefined;
  save: () => Promise<boolean>;
  transition: (
    sourceTable: string,
    sourceId: string,
    toState: WorkflowState,
    comment?: string,
  ) => Promise<boolean>;
  isTransitioning: boolean;
}

export function useEditorQueue({
  queue,
  onNavigate,
  onClose,
  state,
  config,
  save,
  transition,
  isTransitioning,
}: UseEditorQueueArgs) {
  const inQueue = Boolean(queue && queue.items.length > 0);
  const queueIndex = queue?.index ?? 0;
  const queueTotal = queue?.items.length ?? 0;
  const isFirst = queueIndex <= 0;
  const isLast = queueIndex >= queueTotal - 1;

  const confirmDiscardIfDirty = useCallback(() => {
    if (!state.isDirty) return true;
    return window.confirm('You have unsaved changes. Discard them and continue?');
  }, [state.isDirty]);

  const handlePrev = useCallback(() => {
    if (!inQueue || isFirst) return;
    if (!confirmDiscardIfDirty()) return;
    onNavigate?.(queueIndex - 1);
  }, [inQueue, isFirst, confirmDiscardIfDirty, onNavigate, queueIndex]);

  // Step forward; close + toast when the queue is drained.
  const advance = useCallback(
    (processed: number) => {
      if (!inQueue || isLast) {
        if (inQueue) toast.success(`Queue cleared — ${processed} processed`);
        onClose();
        return;
      }
      onNavigate?.(queueIndex + 1);
    },
    [inQueue, isLast, onClose, onNavigate, queueIndex],
  );

  const handleNext = useCallback(() => {
    if (!inQueue || isLast) return;
    if (!confirmDiscardIfDirty()) return;
    onNavigate?.(queueIndex + 1);
  }, [inQueue, isLast, confirmDiscardIfDirty, onNavigate, queueIndex]);

  const handleApprove = useCallback(async () => {
    if (!state.itemId || !config) return;
    // Persist any pending edits before publishing, else they're lost on advance.
    if (state.isDirty) {
      const saved = await save();
      if (!saved) return;
    }
    const ok = await transition(config.tableName, state.itemId, 'published');
    if (ok) {
      toast.success('Published');
      advance(queueIndex + 1);
    } else {
      toast.error('Could not publish — check workflow state / permissions');
    }
  }, [state.itemId, state.isDirty, config, save, transition, advance, queueIndex]);

  const handleRequestChanges = useCallback(
    async (reason: string) => {
      if (!state.itemId || !config || !reason.trim()) return;
      const ok = await transition(config.tableName, state.itemId, 'draft', reason.trim());
      if (ok) {
        toast.success('Sent back to draft');
        advance(queueIndex + 1);
      } else {
        toast.error('Could not request changes');
      }
    },
    [state.itemId, config, transition, advance, queueIndex],
  );

  // Cockpit keyboard loop: [ / ] prev/next, ⌘/Ctrl+Enter approve. Ignored while
  // typing in a field. Active only in queue mode.
  useEffect(() => {
    if (!inQueue) return;
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isTransitioning && !state.isSaving) handleApprove();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === ']') {
        e.preventDefault();
        handleNext();
      } else if (e.key === '[') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inQueue, isTransitioning, state.isSaving, handleApprove, handleNext, handlePrev]);

  return {
    inQueue,
    queueIndex,
    queueTotal,
    isFirst,
    isLast,
    handlePrev,
    handleNext,
    handleApprove,
    handleRequestChanges,
  };
}
