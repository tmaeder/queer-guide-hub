/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mutateFn, useToggleReactionMock } = vi.hoisted(() => ({
  mutateFn: vi.fn(),
  useToggleReactionMock: vi.fn(),
}));

vi.mock('@/hooks/useTripReactions', () => ({
  REACTION_EMOJIS: ['👍', '❤️', '🔥'],
  useToggleReaction: useToggleReactionMock,
}));

import { PlaceReactionBar } from '../PlaceReactionBar';

beforeEach(() => {
  mutateFn.mockReset();
  useToggleReactionMock.mockReset();
  useToggleReactionMock.mockReturnValue({ mutate: mutateFn, isPending: false });
});

describe('PlaceReactionBar', () => {
  it('renders one button per emoji', () => {
    render(<PlaceReactionBar tripId="t1" placeId="p1" summary={undefined} />);
    expect(screen.getAllByRole('button').length).toBe(3);
  });

  it('renders count next to each emoji when > 0', () => {
    render(
      <PlaceReactionBar
        tripId="t1"
        placeId="p1"
        summary={{ counts: { '👍': 4, '❤️': 0, '🔥': 0 }, mine: new Set() } as never}
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('clicking calls toggle with the right active flag', () => {
    render(
      <PlaceReactionBar
        tripId="t1"
        placeId="p1"
        summary={{ counts: { '👍': 0, '❤️': 0, '🔥': 0 }, mine: new Set(['👍']) } as never}
      />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(mutateFn).toHaveBeenCalledWith({ tripId: 't1', placeId: 'p1', emoji: '👍', active: true });
  });

  it('does not mutate when disabled', () => {
    render(<PlaceReactionBar tripId="t1" placeId="p1" summary={undefined} disabled />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('does not mutate while pending', () => {
    useToggleReactionMock.mockReturnValue({ mutate: mutateFn, isPending: true });
    render(<PlaceReactionBar tripId="t1" placeId="p1" summary={undefined} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(mutateFn).not.toHaveBeenCalled();
  });
});
