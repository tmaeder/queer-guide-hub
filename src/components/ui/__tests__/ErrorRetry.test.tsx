/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorRetry } from '../ErrorRetry';

describe('ErrorRetry', () => {
  it('renders error and retry button', () => {
    const onRetry = vi.fn();
    render(<ErrorRetry error="Boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
