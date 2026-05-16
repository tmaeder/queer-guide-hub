/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingList } from '../LoadingList';

describe('LoadingList', () => {
  it('renders with default count', () => {
    render(<LoadingList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
