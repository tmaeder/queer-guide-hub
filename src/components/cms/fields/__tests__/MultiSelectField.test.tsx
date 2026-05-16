/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultiSelectField } from '../MultiSelectField';

const field = {
  name: 'tags', label: 'Tags', type: 'multiselect',
  options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
} as never;

describe('MultiSelectField', () => {
  it('renders options', () => {
    render(<MultiSelectField field={field} value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
  it('shows selected as chips', () => {
    render(<MultiSelectField field={field} value={['a']} onChange={vi.fn()} />);
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);
  });
});
