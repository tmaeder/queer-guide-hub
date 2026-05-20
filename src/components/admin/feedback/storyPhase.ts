// Derive the user-facing "phase" for a story from the persisted state machines.
// The persisted truth is split across three rows (story + latest routine run +
// latest retest run); this helper collapses them into a single label for chips
// and filters. Pure: no side effects.

import type {
  FeedbackRetestRun,
  FeedbackRoutineRun,
  FeedbackStory,
  StoryPhase,
} from './types';

export function getStoryPhase(
  story: Pick<
    FeedbackStory,
    'status' | 'archived_at' | 'approved_for_claude_at' | 'needs_followup_reason' | 'resolved_at'
  >,
  latestRun: FeedbackRoutineRun | null | undefined,
  latestRetest: FeedbackRetestRun | null | undefined,
  memberCount = 1,
): StoryPhase {
  if (story.archived_at) return 'archived';
  if (story.status === 'resolved') return 'resolved';

  if (latestRetest && latestRun?.status === 'fix_proposed') {
    if (latestRetest.status === 'running' || latestRetest.status === 'queued') return 'retesting';
    if (latestRetest.status === 'failed' || latestRetest.status === 'error') return 'needs_manual_followup';
    if (latestRetest.status === 'passed') return 'ready_to_verify';
  }

  if (latestRun) {
    if (latestRun.status === 'fix_proposed') return 'fix_proposed';
    if (latestRun.status === 'queued' || latestRun.status === 'dispatched' || latestRun.status === 'in_progress') {
      return 'fix_in_progress';
    }
    if (latestRun.status === 'failed') return 'needs_manual_followup';
  }

  if (story.needs_followup_reason) return 'needs_more_context';
  if (story.approved_for_claude_at) return 'approved';
  if (memberCount === 0) return 'new';
  return 'awaiting_review';
}

export const PHASE_LABELS: Record<StoryPhase, string> = {
  new: 'New',
  awaiting_review: 'Awaiting review',
  needs_more_context: 'Needs more context',
  approved: 'Approved for Claude',
  fix_in_progress: 'Fix in progress',
  fix_proposed: 'Fix proposed',
  retesting: 'Retesting',
  needs_manual_followup: 'Needs manual follow-up',
  ready_to_verify: 'Ready to verify',
  resolved: 'Resolved',
  archived: 'Archived',
};

export const PHASE_COLORS: Record<StoryPhase, string> = {
  new: 'hsl(var(--muted-foreground))',
  awaiting_review: 'hsl(var(--muted-foreground))',
  needs_more_context: 'hsl(var(--foreground) / 0.55)',
  approved: 'hsl(var(--muted-foreground))',
  fix_in_progress: 'hsl(var(--foreground) / 0.55)',
  fix_proposed: 'hsl(var(--foreground))',
  retesting: 'hsl(var(--foreground) / 0.55)',
  needs_manual_followup: 'hsl(var(--destructive))',
  ready_to_verify: 'hsl(var(--foreground))',
  resolved: 'hsl(var(--muted-foreground))',
  archived: 'hsl(var(--muted-foreground))',
};
