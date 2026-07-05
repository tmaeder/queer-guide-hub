import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { KinkRatingControl } from '../KinkRatingControl';

function wrap(node: React.ReactNode) {
  return <TooltipProvider>{node}</TooltipProvider>;
}

describe('KinkRatingControl', () => {
  it('renders all six rating values', () => {
    render(
      wrap(
        <KinkRatingControl
          side="general"
          rating={null}
          needsDiscussion={false}
          onRate={vi.fn()}
          onToggleDiscussion={vi.fn()}
        />,
      ),
    );
    for (const label of ['Favorite', 'Like', 'Curious', 'Maybe', 'No', 'Hard limit']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('selects a rating on click and clears on second click', () => {
    const onRate = vi.fn();
    const { rerender } = render(
      wrap(
        <KinkRatingControl
          side="giving"
          rating={null}
          needsDiscussion={false}
          onRate={onRate}
          onToggleDiscussion={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Favorite' }));
    expect(onRate).toHaveBeenCalledWith('favorite');

    rerender(
      wrap(
        <KinkRatingControl
          side="giving"
          rating="favorite"
          needsDiscussion={false}
          onRate={onRate}
          onToggleDiscussion={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('radio', { name: 'Favorite' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Favorite' }));
    expect(onRate).toHaveBeenLastCalledWith(null);
  });

  it('shows the discuss-first toggle only for positive ratings', () => {
    const { rerender } = render(
      wrap(
        <KinkRatingControl
          side="general"
          rating="hard_limit"
          needsDiscussion={false}
          onRate={vi.fn()}
          onToggleDiscussion={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: /talk about it first/i })).toBeNull();

    rerender(
      wrap(
        <KinkRatingControl
          side="general"
          rating="curious"
          needsDiscussion={false}
          onRate={vi.fn()}
          onToggleDiscussion={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: /talk about it first/i })).toBeInTheDocument();
  });

  it('labels the axis side', () => {
    render(
      wrap(
        <KinkRatingControl
          side="receiving"
          rating={null}
          needsDiscussion={false}
          onRate={vi.fn()}
          onToggleDiscussion={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('Receiving')).toBeInTheDocument();
  });
});
