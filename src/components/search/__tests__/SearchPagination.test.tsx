import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchPagination } from '../SearchPagination';

// P0-4: pagination contract: render only when needed, disable boundaries,
// fire onPageChange with the right number, expose accessible controls.
describe('SearchPagination', () => {
  it('renders nothing when totalHits ≤ hitsPerPage', () => {
    const { container } = render(
      <SearchPagination page={1} hitsPerPage={20} totalHits={10} onPageChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('disables Prev on the first page and enables Next', () => {
    render(
      <SearchPagination page={1} hitsPerPage={20} totalHits={100} onPageChange={() => {}} />,
    );
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
  });

  it('disables Next on the last page', () => {
    render(
      <SearchPagination page={5} hitsPerPage={20} totalHits={100} onPageChange={() => {}} />,
    );
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('calls onPageChange with the next page number', () => {
    const onPageChange = vi.fn();
    render(
      <SearchPagination page={2} hitsPerPage={20} totalHits={100} onPageChange={onPageChange} />,
    );
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
