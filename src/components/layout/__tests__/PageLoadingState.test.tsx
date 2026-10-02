import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageLoadingState } from '../PageLoadingState';

describe('PageLoadingState', () => {
  afterEach(() => vi.useRealTimers());

  it('should render loading skeleton', () => {
    const { container } = render(<PageLoadingState />);
    expect(container.children.length).toBeGreaterThan(0);
  });
  it('should accept count prop', () => {
    const { container } = render(<PageLoadingState count={3} />);
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('keeps fast loads visually quiet, then reveals content-shaped skeletons', () => {
    vi.useFakeTimers();
    render(<PageLoadingState label="Loading venues" />);
    expect(screen.getByRole('status', { name: 'Loading venues' })).toHaveClass('invisible');
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole('status', { name: 'Loading venues' })).not.toHaveClass('invisible');
  });

  it('stops pretending to progress after eight seconds', () => {
    vi.useFakeTimers();
    render(<PageLoadingState label="Loading venues" onRetry={() => undefined} />);
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
