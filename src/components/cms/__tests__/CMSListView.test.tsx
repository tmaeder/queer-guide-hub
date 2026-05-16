/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSFilters', () => ({
  useCMSFilters: () => ({
    filters: { search: '', contentType: 'all', status: 'all', dateRange: { from: null, to: null }, showDeleted: false },
    updateFilter: vi.fn(), updateSort: vi.fn(), resetFilters: vi.fn(),
    filteredData: [], filterOptions: { contentTypes: [], statuses: [] }, totalResults: 0, totalRecords: 0,
    totalPages: 0, currentPage: 1, pageSize: 25,
  }),
}));
vi.mock('@/hooks/useCMSShortcuts', () => ({ useCMSShortcuts: vi.fn() }));
vi.mock('@/hooks/usePageFetchers', () => ({ updateRow: vi.fn() }));

import { CMSListView } from '../CMSListView';

describe('CMSListView', () => {
  it('renders empty', () => {
    const { container } = render(
      <CMSListView data={[]} loading={false} error={null} onEdit={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} viewMode="list" onViewModeChange={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
