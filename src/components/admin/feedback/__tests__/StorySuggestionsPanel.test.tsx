/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StorySuggestionsPanel } from '../StorySuggestionsPanel';

const sugs = [
  { id: 's1', proposed_title: 'Cluster A', member_ids: ['a', 'b', 'c'], avg_similarity: 0.85, method: 'embedding' },
] as never;

describe('StorySuggestionsPanel', () => {
  it('renders nothing when no suggestions', () => {
    const { container } = render(<StorySuggestionsPanel suggestions={[]} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders suggestion card with title + badges', () => {
    render(<StorySuggestionsPanel suggestions={sugs} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Cluster A')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('85% match')).toBeInTheDocument();
    expect(screen.getByText('embedding')).toBeInTheDocument();
  });

  it('Accept fires onAccept(id)', () => {
    const onAccept = vi.fn();
    render(<StorySuggestionsPanel suggestions={sugs} onAccept={onAccept} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Accept$/ }));
    expect(onAccept).toHaveBeenCalledWith('s1');
  });

  it('Dismiss fires onDismiss(id)', () => {
    const onDismiss = vi.fn();
    render(<StorySuggestionsPanel suggestions={sugs} onAccept={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(onDismiss).toHaveBeenCalledWith('s1');
  });

  it('Edit opens dialog with title input', () => {
    render(<StorySuggestionsPanel suggestions={sugs} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    expect(screen.getByDisplayValue('Cluster A')).toBeInTheDocument();
  });

  it('Accept with title fires onAccept(id, editedTitle)', () => {
    const onAccept = vi.fn();
    render(<StorySuggestionsPanel suggestions={sugs} onAccept={onAccept} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    const input = screen.getByDisplayValue('Cluster A');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /Accept with title/ }));
    expect(onAccept).toHaveBeenCalledWith('s1', 'Renamed');
  });
});
