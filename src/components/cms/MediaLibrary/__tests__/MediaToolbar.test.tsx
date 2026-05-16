/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { MediaToolbar } from '../MediaToolbar';

describe('MediaToolbar', () => {
  it('renders', () => {
    const { container } = render(
      <MediaToolbar
        search="" onSearchChange={vi.fn()}
        statusFilter={'all' as never} onStatusFilterChange={vi.fn()}
        entityTypeFilter={'all' as never} onEntityTypeFilterChange={vi.fn()}
        formatFilter={'all' as never} onFormatFilterChange={vi.fn()}
        sourceTypeFilter="all" onSourceTypeFilterChange={vi.fn()}
        sortBy="created_at" onSortByChange={vi.fn()}
        sortDir="desc" onSortDirToggle={vi.fn()}
        viewMode="grid" onViewModeChange={vi.fn()}
        bulkMode={false} onBulkModeToggle={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
