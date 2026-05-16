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
});
