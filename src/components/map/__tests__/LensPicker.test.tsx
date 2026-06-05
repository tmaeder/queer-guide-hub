import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LensPicker } from '@/components/map/LensPicker';

describe('LensPicker', () => {
  it('renders a Combined pill and marks the active lens', () => {
    render(
      <LensPicker
        lenses={['combined', 'pins', 'density']}
        value="combined"
        onChange={vi.fn()}
      />,
    );
    const combined = screen.getByRole('radio', { name: 'Combined' });
    expect(combined).toBeInTheDocument();
    expect(combined).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Pins' })).toHaveAttribute('aria-checked', 'false');
  });
});
