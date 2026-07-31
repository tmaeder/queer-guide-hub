/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTableEmptyState } from '../DataTableEmptyState';

describe('DataTableEmptyState', () => {
  it('renders 5 skeleton rows while loading', () => {
    const { container } = render(
      <DataTableEmptyState isLoading={true} hasFilters={false} columnCount={4} />,
    );
    // 5 row divs each containing skeletons.
    const skeletonRows = container.querySelectorAll('.flex.gap-4.py-4');
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
    render(<DataTableEmptyState isLoading={false} hasFilters={true} columnCount={4} noun="venues" />);
    expect(screen.getByText('No venues match these filters.')).toBeInTheDocument();
    expect(screen.getByText(/adjust the filters/i)).toBeInTheDocument();
  });

  it('caps column skeleton count at 5 even when columnCount is higher', () => {
    const { container } = render(
      <DataTableEmptyState isLoading={true} hasFilters={false} columnCount={20} />,
    );
    // Each row has 1 leading checkbox skeleton + min(columnCount, 5) column skeletons.
    const firstRow = container.querySelector('.flex.gap-4.py-4')!;
    const skeletons = firstRow.querySelectorAll('[class*="Skeleton"], .h-5');
    expect(skeletons.length).toBeLessThanOrEqual(6);
  });
});
