import { describe, it, expect } from 'vitest';
import { getStoryPhase } from '../storyPhase';
import type { FeedbackRetestRun, FeedbackRoutineRun, FeedbackStory } from '../types';

const baseStory: Pick<
  FeedbackStory,
  'status' | 'archived_at' | 'approved_for_claude_at' | 'needs_followup_reason' | 'resolved_at'
> = {
  status: 'open',
  archived_at: null,
  approved_for_claude_at: null,
  needs_followup_reason: null,
  resolved_at: null,
};

const mkRun = (status: FeedbackRoutineRun['status']): FeedbackRoutineRun => ({
  id: 'r1',
  story_id: 's1',
  status,
  runner: 'mock',
  prompt: '',
  prompt_hash: 'h',
  external_ref: null,
  pr_url: null,
  commit_sha: null,
  files_changed: null,
  fix_summary: null,
  confidence: null,
  risks: null,
  error: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  finished_at: null,
});

const mkRetest = (status: FeedbackRetestRun['status']): FeedbackRetestRun => ({
  id: 'rt1',
  routine_run_id: 'r1',
  status,
  kind: 'unit',
  runner: 'mock',
  external_ref: null,
  result: null,
  created_by: null,
  created_at: '',
  finished_at: null,
});

describe('getStoryPhase', () => {
  it('archived dominates everything', () => {
    expect(
      getStoryPhase({ ...baseStory, archived_at: '2026-04-30', status: 'resolved' }, mkRun('fix_proposed'), mkRetest('passed')),
    ).toBe('archived');
  });

  it('resolved when story.status=resolved and not archived', () => {
    expect(getStoryPhase({ ...baseStory, status: 'resolved' }, null, null)).toBe('resolved');
  });

  it('ready_to_verify when retest passed for fix_proposed run', () => {
    expect(getStoryPhase(baseStory, mkRun('fix_proposed'), mkRetest('passed'))).toBe('ready_to_verify');
  });

  it('retesting when retest is running', () => {
    expect(getStoryPhase(baseStory, mkRun('fix_proposed'), mkRetest('running'))).toBe('retesting');
  });

  it('needs_manual_followup when retest failed', () => {
    expect(getStoryPhase(baseStory, mkRun('fix_proposed'), mkRetest('failed'))).toBe('needs_manual_followup');
  });

  it('fix_proposed when run finished but no retest', () => {
    expect(getStoryPhase(baseStory, mkRun('fix_proposed'), null)).toBe('fix_proposed');
  });

  it('fix_in_progress when run is queued/dispatched/in_progress', () => {
    expect(getStoryPhase(baseStory, mkRun('queued'), null)).toBe('fix_in_progress');
    expect(getStoryPhase(baseStory, mkRun('dispatched'), null)).toBe('fix_in_progress');
    expect(getStoryPhase(baseStory, mkRun('in_progress'), null)).toBe('fix_in_progress');
  });

  it('needs_manual_followup when run failed', () => {
    expect(getStoryPhase(baseStory, mkRun('failed'), null)).toBe('needs_manual_followup');
  });

  it('approved when approved but no run yet', () => {
    expect(getStoryPhase({ ...baseStory, approved_for_claude_at: '2026-04-30' }, null, null)).toBe('approved');
  });

  it('needs_more_context when needs_followup_reason set', () => {
    expect(
      getStoryPhase({ ...baseStory, needs_followup_reason: 'unclear repro' }, null, null),
    ).toBe('needs_more_context');
  });

  it('awaiting_review by default with members', () => {
    expect(getStoryPhase(baseStory, null, null)).toBe('awaiting_review');
  });

  it('new when no members and no run', () => {
    expect(getStoryPhase(baseStory, null, null, 0)).toBe('new');
  });

  it('cancelled run does not block phase derivation back to approved', () => {
    // After a cancelled run, the next dispatch creates a new latest run; if the
    // caller passes the cancelled one as latest, fix_in_progress is wrong but
    // ready_to_verify check runs on retest. Treat cancelled as terminal-not-live.
    const cancelled = mkRun('cancelled');
    // cancelled is not in queued/dispatched/in_progress, fix_proposed, or failed,
    // so phase falls through to approved if approved flag set.
    expect(
      getStoryPhase(
        { ...baseStory, approved_for_claude_at: '2026-04-30' },
        cancelled,
        null,
      ),
    ).toBe('approved');
  });
});
