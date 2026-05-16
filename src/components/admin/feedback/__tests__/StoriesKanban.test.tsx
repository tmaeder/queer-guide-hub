/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../constants', () => ({
  storyColumns: [{ id: 'open', label: 'Open' }, { id: 'planned', label: 'Planned' }],
  priorityFor: () => ({ short: 'P1' }),
}));
vi.mock('../storyPhase', () => ({
  getStoryPhase: () => 'planning',
  PHASE_COLORS: { planning: '#000' },
  PHASE_LABELS: { planning: 'Planning' },
}));
vi.mock('@/hooks/useStoryRoutine', () => ({
  useArchiveStory: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
  useLatestRunsByStory: () => ({ data: {} }),
}));

import { StoriesKanban } from '../StoriesKanban';

const empty = { open: [], planned: [], in_progress: [], resolved: [], archived: [] } as never;

describe('StoriesKanban', () => {
  it('renders Select toolbar button', () => {
    render(<StoriesKanban grouped={empty} adminById={{}} onStoryClick={vi.fn()} />);
    expect(screen.getByTestId('enter-select-mode')).toBeInTheDocument();
  });
});
