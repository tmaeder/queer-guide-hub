/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListPagination } from '../ListPagination';

/**
 * Gallery / Board / Timeline / Calendar shipped with no pagination at all — the
 * first 25 rows and no way to reach the rest. These pin the shared control so a
 * new view cannot repeat that by omission.
 */

function setup(over: Partial<React.ComponentProps<typeof ListPagination>> = {}) {
  const setPage = vi.fn();
  const setRowsPerPage = vi.fn();
  render(
    <ListPagination
      page={0}
      rowsPerPage={25}
      totalCount={100}
      setPage={setPage}
      setRowsPerPage={setRowsPerPage}
      {...over}
    />,
  );
  return { setPage, setRowsPerPage };
}

describe('ListPagination', () => {
  it('reports the visible range and the true total', () => {
    setup({ page: 1, rowsPerPage: 25, totalCount: 40000 });
    expect(screen.getByText('26-50 of 40,000')).toBeInTheDocument();
  });

  it('clamps the last page to the total', () => {
    setup({ page: 3, rowsPerPage: 25, totalCount: 90 });
    expect(screen.getByText('76-90 of 90')).toBeInTheDocument();
  });

  it('advances a page', () => {
    const { setPage } = setup({ page: 0 });
    fireEvent.click(screen.getByText('Next'));
    expect(setPage).toHaveBeenCalledWith(1);
  });

  it('goes back a page', () => {
    const { setPage } = setup({ page: 2 });
    fireEvent.click(screen.getByText('Previous'));
    expect(setPage).toHaveBeenCalledWith(1);
  });

  it('does not step before the first page', () => {
    const { setPage } = setup({ page: 0 });
    fireEvent.click(screen.getByText('Previous'));
    expect(setPage).not.toHaveBeenCalled();
  });

  it('does not step past the last page', () => {
    const { setPage } = setup({ page: 3, totalCount: 100, rowsPerPage: 25 });
    fireEvent.click(screen.getByText('Next'));
    expect(setPage).not.toHaveBeenCalled();
  });

  it('resets to the first page when the page size changes', () => {
    // Staying on page 4 of a 25-row paging while switching to 100 rows would
    // land past the end of the data.
    const { setPage, setRowsPerPage } = setup({ page: 4 });
    fireEvent.click(screen.getByLabelText('Rows per page'));
    expect(setRowsPerPage).not.toHaveBeenCalled();
    expect(setPage).not.toHaveBeenCalled();
  });

  it('renders nothing when there is nothing to page through', () => {
    const { container } = render(
      <ListPagination
        page={0}
        rowsPerPage={25}
        totalCount={0}
        setPage={vi.fn()}
        setRowsPerPage={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the list is empty even if a count is known', () => {
    const { container } = render(
      <ListPagination
        page={0}
        rowsPerPage={25}
        totalCount={100}
        setPage={vi.fn()}
        setRowsPerPage={vi.fn()}
        hidden
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
