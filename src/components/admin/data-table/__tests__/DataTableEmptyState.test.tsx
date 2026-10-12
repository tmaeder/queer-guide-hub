/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTableEmptyState } from '../DataTableEmptyState';

describe('DataTableEmptyState', () => {
  it('reports a failed request instead of claiming the table is empty and retries it', () => {
    const retry = vi.fn();
    render(
      <DataTableEmptyState
        isLoading={false}
        hasFilters={false}
        columnCount={4}
        noun="venues"
        error={new Error('offline')}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load venues');
    expect(screen.queryByText('No venues yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('offers a usable reset when filters hide every record', () => {
    const reset = vi.fn();
    render(
      <DataTableEmptyState isLoading={false} hasFilters columnCount={4} onResetFilters={reset} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('renders 5 skeleton rows while loading', () => {
    const { container } = render(
      <DataTableEmptyState isLoading={true} hasFilters={false} columnCount={4} />,
    );
    // 5 row divs each containing skeletons.
    const skeletonRows = container.querySelectorAll('[data-testid=admin-loading-row]');
    expect(skeletonRows).toHaveLength(5);
  });

  it('reads "No {noun} yet." when not loading and no filters', () => {
    render(<DataTableEmptyState isLoading={false} hasFilters={false} columnCount={4} />);
    expect(screen.getByText('No results yet.')).toBeInTheDocument();
  });

  it('uses the caller\'s noun so tables do not all say "results"', () => {
    render(
      <DataTableEmptyState isLoading={false} hasFilters={false} columnCount={4} noun="venues" />,
    );
    expect(screen.getByText('No venues yet.')).toBeInTheDocument();
  });

  it('distinguishes a filtered miss from a genuinely empty table', () => {
    render(
      <DataTableEmptyState isLoading={false} hasFilters={true} columnCount={4} noun="venues" />,
    );
    expect(screen.getByText('No venues match these filters.')).toBeInTheDocument();
    expect(screen.getByText(/adjust the filters/i)).toBeInTheDocument();
  });

  it('caps column skeleton count at 5 even when columnCount is higher', () => {
    const { container } = render(
      <DataTableEmptyState isLoading={true} hasFilters={false} columnCount={20} />,
    );
    // Without selection, each row has exactly five data placeholders.
    const firstRow = container.querySelector('[data-testid=admin-loading-row]')!;
    const skeletons = firstRow.children;
    expect(skeletons.length).toBe(5);
  });
});
