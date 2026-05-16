/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { voteFn, useFeedbackVoteMock } = vi.hoisted(() => ({
  voteFn: vi.fn(),
  useFeedbackVoteMock: vi.fn(),
}));

vi.mock('@/hooks/useSearchActions', () => ({
  useFeedbackVote: useFeedbackVoteMock,
}));

import { SearchFeedbackButtons } from '../SearchFeedbackButtons';

const entity = { id: 'v1', type: 'venue' } as never;

beforeEach(() => {
  voteFn.mockReset();
  useFeedbackVoteMock.mockReset();
  useFeedbackVoteMock.mockReturnValue(voteFn);
});

describe('SearchFeedbackButtons', () => {
  it('renders thumbs up + down buttons', () => {
    render(<SearchFeedbackButtons entity={entity} />);
    expect(screen.getByLabelText(/Thumbs up/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Thumbs down/i)).toBeInTheDocument();
  });

  it('calls vote() with direction up when thumbs-up clicked', () => {
    render(<SearchFeedbackButtons entity={entity} query="berlin" />);
    fireEvent.click(screen.getByLabelText(/Thumbs up/i));
    expect(voteFn).toHaveBeenCalledWith(entity, 'up', 'berlin');
  });

  it('calls vote() with direction down when thumbs-down clicked', () => {
    render(<SearchFeedbackButtons entity={entity} />);
    fireEvent.click(screen.getByLabelText(/Thumbs down/i));
    expect(voteFn).toHaveBeenCalledWith(entity, 'down', undefined);
  });

  it('does not re-vote in the same direction', () => {
    render(<SearchFeedbackButtons entity={entity} />);
    fireEvent.click(screen.getByLabelText(/Thumbs up/i));
    fireEvent.click(screen.getByLabelText(/Thumbs up/i));
    expect(voteFn).toHaveBeenCalledTimes(1);
  });
});
