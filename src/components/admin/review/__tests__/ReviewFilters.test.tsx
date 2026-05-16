/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewFilters } from '../ReviewFilters';

const statusOpts = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
];

describe('ReviewFilters', () => {
  it('renders search input + selects', () => {
    render(
      <ReviewFilters
        filters={{ search: '', status: 'all', contentType: 'all' }}
        onFiltersChange={vi.fn()}
        statusOptions={statusOpts}
      />,
    );
    expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
  });

  it('fires update on search change', () => {
    const onChange = vi.fn();
    render(
      <ReviewFilters
        filters={{ search: '', status: 'all', contentType: 'all' }}
        onFiltersChange={onChange}
        statusOptions={statusOpts}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'x' }));
  });

  it('shows clear-search button when search has value', () => {
    const onChange = vi.fn();
    render(
      <ReviewFilters
        filters={{ search: 'hi', status: 'all', contentType: 'all' }}
        onFiltersChange={onChange}
        statusOptions={statusOpts}
      />,
    );
    const clearBtn = screen.getAllByRole('button')[0];
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: '' }));
  });
});
