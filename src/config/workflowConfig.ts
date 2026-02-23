/**
 * Workflow Configuration
 * State machine defining valid transitions between workflow states,
 * role-based access control, and UI helpers for the CMS.
 */

import type { WorkflowTransition, WorkflowState } from '@/types/cms';

// ── Transition Definitions ─────────────────────────────────────────

export const workflowTransitions: WorkflowTransition[] = [
  {
    from: 'draft',
    to: 'review',
    label: 'Submit for Review',
    requiredRoles: ['admin', 'moderator', 'editor'],
  },
  {
    from: 'draft',
    to: 'published',
    label: 'Publish Now',
    description: 'Skip review and publish directly',
    requiredRoles: ['admin'],
    onTransition: () => ({
      published_at: new Date().toISOString(),
    }),
  },
  {
    from: 'review',
    to: 'published',
    label: 'Approve & Publish',
    requiredRoles: ['admin', 'moderator'],
    onTransition: () => ({
      published_at: new Date().toISOString(),
    }),
  },
  {
    from: 'review',
    to: 'draft',
    label: 'Request Changes',
    requiredRoles: ['admin', 'moderator'],
    requiresComment: true,
  },
  {
    from: 'published',
    to: 'archived',
    label: 'Archive',
    requiredRoles: ['admin', 'moderator'],
  },
  {
    from: 'published',
    to: 'draft',
    label: 'Unpublish',
    requiredRoles: ['admin'],
  },
  {
    from: 'archived',
    to: 'draft',
    label: 'Restore to Draft',
    requiredRoles: ['admin', 'moderator'],
  },
];

// ── Helper Functions ───────────────────────────────────────────────

/**
 * Get transitions available from a given state for a user with specific roles.
 */
export function getAvailableTransitions(
  currentState: WorkflowState,
  userRoles: string[],
): WorkflowTransition[] {
  return workflowTransitions.filter((t) => {
    if (t.from !== currentState) return false;
    return t.requiredRoles.some((role) => userRoles.includes(role));
  });
}

/**
 * Return a CSS-friendly color string for each workflow state.
 * Used for badges, dots, and borders throughout the CMS.
 */
export function getStateColor(state: WorkflowState): string {
  switch (state) {
    case 'draft':
      return '#94a3b8'; // slate-400
    case 'review':
      return '#f59e0b'; // amber-500
    case 'published':
      return '#22c55e'; // green-500
    case 'archived':
      return '#6b7280'; // gray-500
    default:
      return '#94a3b8';
  }
}

/**
 * Return a human-readable label for each workflow state.
 */
export function getStateLabel(state: WorkflowState): string {
  switch (state) {
    case 'draft':
      return 'Draft';
    case 'review':
      return 'In Review';
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
    default:
      return state;
  }
}

/**
 * Map workflow states to Shadcn badge variants for quick UI use.
 */
export function getStateBadgeVariant(
  state: WorkflowState,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'draft':
      return 'secondary';
    case 'review':
      return 'outline';
    case 'published':
      return 'default';
    case 'archived':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Check whether a transition between two specific states is valid
 * for a user with the given roles.
 */
export function canTransition(
  from: WorkflowState,
  to: WorkflowState,
  userRoles: string[],
): boolean {
  return workflowTransitions.some(
    (t) =>
      t.from === from &&
      t.to === to &&
      t.requiredRoles.some((role) => userRoles.includes(role)),
  );
}
