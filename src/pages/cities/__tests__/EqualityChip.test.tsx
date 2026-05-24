/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EqualityChip } from '../EqualityChip';

describe('EqualityChip', () => {
  it('renders the numeric score for known data', () => {
    render(<EqualityChip score={89} />);
    expect(screen.getByText('89')).toBeInTheDocument();
  });

  it('rounds non-integer scores', () => {
    render(<EqualityChip score={87.4} />);
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('renders "No data" for null', () => {
    render(<EqualityChip score={null} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders the tier label when showLabel=true', () => {
    render(<EqualityChip score={89} showLabel />);
    expect(screen.getByText('Very High')).toBeInTheDocument();
  });

  it('exposes a descriptive aria-label', () => {
    render(<EqualityChip score={45} />);
    const chip = screen.getByLabelText(/Equality score 45, Moderate/i);
    expect(chip).toBeInTheDocument();
  });

  it('sets data-tier attribute for styling hooks', () => {
    const { container } = render(<EqualityChip score={5} />);
    expect(container.firstChild).toHaveAttribute('data-tier', 'very-low');
  });
});
