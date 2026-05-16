/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ResourcesFilterBar } from '../ResourcesFilterBar';

describe('ResourcesFilterBar', () => {
  it('renders', () => {
    const { container } = render(
      <ResourcesFilterBar
        searchQuery=""
        onSearch={vi.fn()}
        displayMode="list"
        onDisplayModeChange={vi.fn()}
        viewMode="list"
        onToggleGraph={vi.fn()}
        filterCategory="all"
        onFilterCategoryChange={vi.fn()}
        usageFilter="all"
        onUsageFilterChange={vi.fn()}
        hasImageFilter={false}
        onHasImageFilterChange={vi.fn()}
        sortBy="name"
        onSortByChange={vi.fn()}
        sortDirection="desc"
        onSortDirectionToggle={vi.fn()}
        categoriesTree={{}}
      />,
    );
    expect(container).toBeTruthy();
  });
});
