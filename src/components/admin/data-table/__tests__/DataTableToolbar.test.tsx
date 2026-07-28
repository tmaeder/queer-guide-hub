/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTableToolbar } from '../DataTableToolbar';

const baseProps = {
  search: '',
  onSearchChange: vi.fn(),
  columns: [{ id: 'name', label: 'Name', visible: true, hideable: true }],
  onToggleColumn: vi.fn(),
  activeFilterCount: 0,
  onClearFilters: vi.fn(),
  totalCount: 100,
};

describe('DataTableToolbar', () => {
  it('renders search input', () => {
    render(<DataTableToolbar {...baseProps} />);
    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
  });

  it('hides search when disabled', () => {
    render(<DataTableToolbar {...baseProps} enableSearch={false} />);
    expect(screen.queryByPlaceholderText(/Search/i)).toBeNull();
  });

  it('fires onSearchChange', () => {
    const onChange = vi.fn();
    render(<DataTableToolbar {...baseProps} onSearchChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'q' } });
    expect(onChange).toHaveBeenCalledWith('q');
  });

  it('shows total count', () => {
    render(<DataTableToolbar {...baseProps} totalCount={1234} />);
    expect(screen.getByText(/1,234/)).toBeInTheDocument();
  });

  // ── A1 regression: the count used to be REPLACED by "Loading..." whenever
  // isFetching was true. Search refetches, so every keystroke blanked the
  // number and reflowed the toolbar — on every admin table.
  it('keeps the last known count visible while refetching', () => {
    render(<DataTableToolbar {...baseProps} totalCount={1234} isFetching />);
    expect(screen.getByText(/1,234/)).toBeInTheDocument();
  });

  it('never renders bare "Loading..." text in place of the count', () => {
    const { container } = render(
      <DataTableToolbar {...baseProps} totalCount={1234} isFetching />,
    );
    expect(container.textContent).not.toMatch(/Loading\s*[.…]/);
  });

  it('marks the count as stale with a spinner while refetching', () => {
    const { rerender } = render(<DataTableToolbar {...baseProps} totalCount={1234} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<DataTableToolbar {...baseProps} totalCount={1234} isFetching />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
