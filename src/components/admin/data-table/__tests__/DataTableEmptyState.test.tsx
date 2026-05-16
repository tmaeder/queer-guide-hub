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
    const skeletonRows = container.querySelectorAll('.flex.gap-4.py-3');
    expect(skeletonRows).toHaveLength(5);
  });

  it("shows 'No data available yet.' when not loading and no filters", () => {
    render(<DataTableEmptyState isLoading={false} hasFilters={false} columnCount={4} />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('No data available yet.')).toBeInTheDocument();
  });

  it("shows filter hint when hasFilters=true", () => {
    render(<DataTableEmptyState isLoading={false} hasFilters={true} columnCount={4} />);
    expect(screen.getByText(/adjusting your filters/i)).toBeInTheDocument();
  });

  it('caps column skeleton count at 5 even when columnCount is higher', () => {
    const { container } = render(
      <DataTableEmptyState isLoading={true} hasFilters={false} columnCount={20} />,
    );
    // Each row has 1 leading checkbox skeleton + min(columnCount, 5) column skeletons.
    const firstRow = container.querySelector('.flex.gap-4.py-3')!;
    const skeletons = firstRow.querySelectorAll('[class*="Skeleton"], .h-5');
    expect(skeletons.length).toBeLessThanOrEqual(6);
  });
});
