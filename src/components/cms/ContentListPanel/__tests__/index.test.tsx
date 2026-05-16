/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../useContentListController', () => ({
  useContentListController: () => ({
    config: null, items: [], loading: false, error: null,
    contentTypeId: 'venues', search: '', setSearch: vi.fn(),
    sortField: null, sortDir: 'desc', toggleSort: vi.fn(),
    filters: {}, setFilter: vi.fn(), clearFilters: vi.fn(),
    hiddenColumns: [], toggleColumn: vi.fn(),
    selectedIds: new Set(), toggleSelect: vi.fn(),
    page: 1, pageSize: 25, totalPages: 0, setPage: vi.fn(),
    columns: [], dynamicOptions: {},
  }),
}));

import { ContentListPanel } from '../index';

describe('ContentListPanel', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><ContentListPanel contentTypeId="venues" /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
