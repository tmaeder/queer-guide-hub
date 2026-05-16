/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useUnarchiveMock, unarchiveMutate } = vi.hoisted(() => ({
  useUnarchiveMock: vi.fn(),
  unarchiveMutate: vi.fn(),
}));

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '2h ago' }));
vi.mock('@/hooks/useStoryRoutine', () => ({ useUnarchiveStory: useUnarchiveMock }));

import { ArchivedStoriesPanel } from '../ArchivedStoriesPanel';

beforeEach(() => {
  useUnarchiveMock.mockReset();
  unarchiveMutate.mockReset();
  useUnarchiveMock.mockReturnValue({ mutate: unarchiveMutate });
});

describe('ArchivedStoriesPanel', () => {
  it('shows empty state when nothing archived', () => {
    render(<ArchivedStoriesPanel archived={[]} adminById={{}} onOpen={vi.fn()} />);
    expect(screen.getByText(/No archived stories/i)).toBeInTheDocument();
  });

  it('renders one row per archived story with metadata', () => {
    render(
      <ArchivedStoriesPanel
        archived={[
          { id: 's1', title: 'X', brief_title: 'XX', archived_by: 'u1', archived_at: '2026-05-15', member_count: 3, archive_reason: 'fixed' } as never,
        ]}
        adminById={{ u1: { display_name: 'Alice' } } as never}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('XX')).toBeInTheDocument();
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Reason: fixed/)).toBeInTheDocument();
  });

  it('Open calls onOpen(id), Unarchive triggers mutation', () => {
    const onOpen = vi.fn();
    render(
      <ArchivedStoriesPanel
        archived={[{ id: 's1', title: 'X', brief_title: 'X', archived_at: '', member_count: 0 } as never]}
        adminById={{}}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open/i }));
    expect(onOpen).toHaveBeenCalledWith('s1');
    fireEvent.click(screen.getByTestId('unarchive-s1'));
    expect(unarchiveMutate).toHaveBeenCalledWith({ storyId: 's1' }, expect.any(Object));
  });
});
