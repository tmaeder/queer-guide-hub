/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { CMSAdvancedFilters } from '../CMSAdvancedFilters';

const filters = { search: '', contentType: 'all', status: 'all', dateRange: { from: null, to: null }, showDeleted: false } as never;

describe('CMSAdvancedFilters', () => {
  it('renders', () => {
    const { container } = render(
      <CMSAdvancedFilters filters={filters} onFilterChange={vi.fn()} onReset={vi.fn()} filterOptions={{ contentTypes: [], statuses: [] }} totalResults={0} totalRecords={0} />,
    );
    expect(container).toBeTruthy();
  });
});
