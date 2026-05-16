/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuplicateBanner } from '../DuplicateBanner';

const baseProps = {
  current: { id: 'c1' } as never,
  itemsById: { p1: { id: 'p1', data: { title: 'Partner item' } } } as never,
  onOpenPartner: vi.fn(),
  onMerge: vi.fn(),
  onDismiss: vi.fn(),
};

describe('DuplicateBanner', () => {
  it('renders nothing when no suggestions or parent story', () => {
    const { container } = render(<DuplicateBanner {...baseProps} suggestions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders parent story when provided', () => {
    render(
      <DuplicateBanner
        {...baseProps}
        suggestions={[]}
        parentStory={{ story_id: 's1', title: 'Story A', status: 'open' }}
        onOpenStory={vi.fn()}
      />,
    );
    expect(screen.getByText(/Part of story: Story A/)).toBeInTheDocument();
  });

  it('renders dupe-of-that + that-is-dup-of-this buttons', () => {
    render(<DuplicateBanner {...baseProps} suggestions={[{ partnerId: 'p1', suggestionId: 'sg1', similarity: 0.8 }]} />);
    expect(screen.getByText(/Possible duplicate/i)).toBeInTheDocument();
    expect(screen.getByText('Partner item')).toBeInTheDocument();
    expect(screen.getByText('80% match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /This is a dup of that/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /That's a dup of this/ })).toBeInTheDocument();
  });

  it('Merge calls onMerge with correct ids', () => {
    const onMerge = vi.fn();
    render(<DuplicateBanner {...baseProps} onMerge={onMerge} suggestions={[{ partnerId: 'p1', suggestionId: 'sg1', similarity: 0.5 }]} />);
    fireEvent.click(screen.getByRole('button', { name: /This is a dup of that/ }));
    expect(onMerge).toHaveBeenCalledWith({ duplicateId: 'c1', canonicalId: 'p1', suggestionId: 'sg1' });
  });

  it('Dismiss calls onDismiss(suggestionId)', () => {
    const onDismiss = vi.fn();
    render(<DuplicateBanner {...baseProps} onDismiss={onDismiss} suggestions={[{ partnerId: 'p1', suggestionId: 'sg1', similarity: 0.5 }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Not a dup/ }));
    expect(onDismiss).toHaveBeenCalledWith('sg1');
  });
});
