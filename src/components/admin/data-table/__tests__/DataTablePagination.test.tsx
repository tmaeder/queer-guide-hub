/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTablePagination } from '../DataTablePagination';

describe('DataTablePagination', () => {
  it('shows range + total formatted', () => {
    render(
      <DataTablePagination
        page={2} pageSize={10} totalCount={1234}
        onPageChange={vi.fn()} onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('11-20 of 1,234')).toBeInTheDocument();
  });

  it('shows selected count when > 0', () => {
    render(
      <DataTablePagination
        page={1} pageSize={10} totalCount={50}
        selectedCount={4}
        onPageChange={vi.fn()} onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });

  it('disables Prev/First on page 1', () => {
    render(
      <DataTablePagination
        page={1} pageSize={10} totalCount={50}
        onPageChange={vi.fn()} onPageSizeChange={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('disables Next/Last on last page', () => {
    render(
      <DataTablePagination
        page={5} pageSize={10} totalCount={50}
        onPageChange={vi.fn()} onPageSizeChange={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 2]).toBeDisabled();
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it('Prev/Next call onPageChange with neighboring page', () => {
    const onPage = vi.fn();
    render(
      <DataTablePagination
        page={3} pageSize={10} totalCount={50}
        onPageChange={onPage} onPageSizeChange={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[buttons.length - 2]);
    expect(onPage).toHaveBeenCalledWith(2);
    expect(onPage).toHaveBeenCalledWith(4);
  });
});
