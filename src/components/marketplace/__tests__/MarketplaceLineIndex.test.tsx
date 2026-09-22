/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const departmentCounts = vi.fn();

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceDepartmentCounts: () => departmentCounts(),
}));
vi.mock('@/hooks/useAdultContent', () => ({
  useAdultAcknowledgement: () => ({ acknowledged: false }),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { MarketplaceLineIndex } from '../MarketplaceLineIndex';

beforeEach(() => {
  departmentCounts.mockReset();
});

describe('MarketplaceLineIndex', () => {
  it('exposes its independent aggregate loading state', () => {
    departmentCounts.mockReturnValue({ data: [], loading: true });
    const { rerender } = render(<MarketplaceLineIndex />);

    expect(screen.getByRole('region', { name: 'Departments' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    departmentCounts.mockReturnValue({
      data: [{ slug: 'apparel', count: 42 }],
      loading: false,
    });
    rerender(<MarketplaceLineIndex />);

    expect(screen.getByRole('region', { name: 'Departments' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(screen.getByText('42 listings')).toBeInTheDocument();
  });
});
