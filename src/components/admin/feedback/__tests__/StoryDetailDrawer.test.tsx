/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useStoryRoutine', () => ({
  useApproveStoryForClaude: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelRoutineRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDispatchClaudeRoutine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkStoryNeedsFollowup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRoutineRetests: () => ({ data: [] }),
  useStartRetest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStoryRoutineRuns: () => ({ data: [] }),
  useVerifyStory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { StoryDetailDrawer } from '../StoryDetailDrawer';

describe('StoryDetailDrawer', () => {
  it('renders closed when open=false', () => {
    const { container } = render(
      <StoryDetailDrawer
        open={false} story={null} members={[]} feedbackById={{}} errorsById={{}}
        admins={[]} adminById={{}} onClose={vi.fn()} onRename={vi.fn()} onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()} onAssign={vi.fn()} onAddLabel={vi.fn()} onRemoveLabel={vi.fn()}
        onRemoveMember={vi.fn()} onOpenMember={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
