/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomeSectionError } from '../HomeSectionError';

describe('HomeSectionError', () => {
  it('explains the failure and exposes a retry action', () => {
    const onRetry = vi.fn();
    render(<HomeSectionError onRetry={onRetry} />);

    expect(screen.getByRole('status')).toHaveTextContent('This section could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the retry action visibly busy while refetching', () => {
    render(<HomeSectionError onRetry={vi.fn()} retrying />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});
