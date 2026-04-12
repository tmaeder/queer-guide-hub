/**
 * useCMSWorkflow - Workflow transition hook
 * Manages workflow state transitions with validation, comments, and side effects.
 */

import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import type { WorkflowState, CMSContentMetadata, WorkflowTransition } from '@/types/cms';

interface UseCMSWorkflowReturn {
  /** Available transitions for the current state and user role */
  availableTransitions: WorkflowTransition[];
  /** Execute a workflow transition */
  transition: (
    sourceTable: string,
    sourceId: string,
    toState: WorkflowState,
    comment?: string,
  ) => Promise<boolean>;
  /** Loading state */
  isTransitioning: boolean;
  /** Error from last transition attempt */
  error: string | null;
}

// Import transitions inline to avoid circular deps
const workflowTransitions: WorkflowTransition[] = [
  { from: 'draft', to: 'review', label: 'Submit for Review', requiredRoles: ['admin', 'moderator', 'editor'] },
  { from: 'draft', to: 'published', label: 'Publish Now', description: 'Skip review and publish directly', requiredRoles: ['admin'] },
  { from: 'review', to: 'published', label: 'Approve & Publish', requiredRoles: ['admin', 'moderator'] },
  { from: 'review', to: 'draft', label: 'Request Changes', requiredRoles: ['admin', 'moderator'], requiresComment: true },
  { from: 'published', to: 'archived', label: 'Archive', requiredRoles: ['admin', 'moderator'] },
  { from: 'published', to: 'draft', label: 'Unpublish', requiredRoles: ['admin'] },
  { from: 'archived', to: 'draft', label: 'Restore to Draft', requiredRoles: ['admin', 'moderator'] },
];

export function useCMSWorkflow(currentState?: WorkflowState): UseCMSWorkflowReturn {
  const { user } = useAuth();
  const { isAdmin, isModerator } = useAdminRoles();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine user's roles (memoized to keep useCallback deps stable)
  const userRoles = useMemo(() => {
    const roles: string[] = [];
    if (isAdmin) roles.push('admin');
    if (isModerator) roles.push('moderator');
    if (isAdmin || isModerator) roles.push('editor');
    return roles;
  }, [isAdmin, isModerator]);

  // Get available transitions
  const availableTransitions = currentState
    ? workflowTransitions.filter(t =>
        t.from === currentState &&
        t.requiredRoles.some(role => userRoles.includes(role))
      )
    : [];

  const transition = useCallback(async (
    sourceTable: string,
    sourceId: string,
    toState: WorkflowState,
    comment?: string,
  ): Promise<boolean> => {
    if (!user || !currentState) return false;

    // Validate transition exists
    const trans = workflowTransitions.find(
      t => t.from === currentState && t.to === toState
    );
    if (!trans) {
      setError(`Invalid transition from ${currentState} to ${toState}`);
      return false;
    }

    // Check role permission
    if (!trans.requiredRoles.some(role => userRoles.includes(role))) {
      setError(`You don't have permission for this action`);
      return false;
    }

    // Check comment requirement
    if (trans.requiresComment && !comment?.trim()) {
      setError('A comment is required for this action');
      return false;
    }

    setIsTransitioning(true);
    setError(null);

    try {
      // Build metadata updates
      const metaUpdates: Partial<CMSContentMetadata> = {
        workflow_state: toState,
        last_edited_by: user.id,
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Side effects
      if (toState === 'published') {
        metaUpdates.published_at = new Date().toISOString();
        metaUpdates.published_by = user.id;
        metaUpdates.scheduled_publish_at = undefined;
      }

      // Upsert cms_content_metadata
      const { error: metaError } = await supabase
        .from('cms_content_metadata' as 'venues')
        .upsert({
          source_table: sourceTable,
          source_id: sourceId,
          ...metaUpdates,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'source_table,source_id',
        });

      if (metaError) throw metaError;

      // Write review comment if provided
      if (comment?.trim()) {
        const commentType = toState === 'published' ? 'approval'
          : toState === 'draft' && currentState === 'review' ? 'change_request'
          : 'comment';

        await supabase
          .from('cms_review_comments' as 'venues')
          .insert({
            source_table: sourceTable,
            source_id: sourceId,
            body: comment.trim(),
            comment_type: commentType,
            created_by: user.id,
          });
      }

      // Write audit log
      await supabase
        .from('cms_audit_log' as 'venues')
        .insert({
          source_table: sourceTable,
          source_id: sourceId,
          action: `workflow_${currentState}_to_${toState}`,
          actor_id: user.id,
          changes: { from: currentState, to: toState },
          metadata: comment ? { comment } : {},
          timestamp: new Date().toISOString(),
        });

      return true;
    } catch (err) {
      console.error('Workflow transition error:', err);
      setError((err as Error).message);
      return false;
    } finally {
      setIsTransitioning(false);
    }
  }, [user, currentState, userRoles]);

  return {
    availableTransitions,
    transition,
    isTransitioning,
    error,
  };
}
