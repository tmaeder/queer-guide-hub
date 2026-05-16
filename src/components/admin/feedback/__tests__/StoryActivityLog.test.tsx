/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useStoryEventsMock } = vi.hoisted(() => ({ useStoryEventsMock: vi.fn() }));

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '5m ago' }));
vi.mock('@/hooks/useStoryRoutine', () => ({ useStoryEvents: useStoryEventsMock }));

import { StoryActivityLog } from '../StoryActivityLog';

beforeEach(() => useStoryEventsMock.mockReset());

describe('StoryActivityLog', () => {
  it('renders nothing when no events', () => {
    useStoryEventsMock.mockReturnValue({ data: [] });
    const { container } = render(<StoryActivityLog storyId="s1" adminById={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows count in collapsed header', () => {
    useStoryEventsMock.mockReturnValue({
      data: [{ id: 'e1', kind: 'archived', actor_id: 'u1', created_at: 'now', payload: { reason: 'dup' } }],
    });
    render(<StoryActivityLog storyId="s1" adminById={{ u1: { user_id: 'u1', display_name: 'Alice' } }} />);
    expect(screen.getByText(/Story timeline \(1\)/)).toBeInTheDocument();
  });

  it('expands timeline on click', () => {
    useStoryEventsMock.mockReturnValue({
      data: [
        { id: 'e1', kind: 'archived', actor_id: 'u1', created_at: 'now', payload: { reason: 'dup' } },
        { id: 'e2', kind: 'verified', actor_id: null, actor_kind: 'runner', created_at: 'now', payload: { outcome: 'ok' } },
      ],
    });
    render(<StoryActivityLog storyId="s1" adminById={{ u1: { user_id: 'u1', display_name: 'Alice' } }} />);
    fireEvent.click(screen.getByRole('button', { name: /Story timeline/ }));
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Archived: dup/)).toBeInTheDocument();
    expect(screen.getByText(/Verified \(ok\)/)).toBeInTheDocument();
    expect(screen.getByText(/Runner/)).toBeInTheDocument();
  });
});
