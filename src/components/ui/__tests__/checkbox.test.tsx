/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from '../checkbox';

describe('Checkbox', () => {
  it('distinguishes a partial selection from selecting every row', () => {
    const { container } = render(<Checkbox checked="indeterminate" aria-label="Select all rows" />);
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    expect(container.querySelector('svg[data-icon="minus"]')).not.toBeNull();
    expect(container.querySelector('svg[data-icon="check"]')).toBeNull();
  });

  it('renders', () => {
    render(<Checkbox />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });
});
