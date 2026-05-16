/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useStoryRoutine', () => ({
  useApproveStoryForClaude: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useArchiveStory: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useCancelRoutineRun: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useDispatchClaudeRoutine: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useMarkStoryNeedsFollowup: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useRoutineRetests: () => ({ data: [] }),
  useStartRetest: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useStoryRoutineRuns: () => ({ data: [] }),
  useVerifyStory: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
}));
vi.mock('../storyPhase', () => ({
  getStoryPhase: () => 'planning',
  PHASE_COLORS: { planning: '#000' },
  PHASE_LABELS: { planning: 'Planning' },
}));

import { RoutineLoopSection } from '../RoutineLoopSection';

const story = { id: 's1', title: 'Test', status: 'open', priority: 'P2', created_at: '2026-05-15T00:00:00Z' } as never;

describe('RoutineLoopSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<RoutineLoopSection story={story} feedbackMembers={[]} errorMembers={[]} memberCount={0} />);
    expect(container).toBeTruthy();
  });
});
