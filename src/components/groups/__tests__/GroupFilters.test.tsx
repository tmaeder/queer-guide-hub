/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCentralizedTags', () => ({
  useCentralizedTags: () => ({ allTags: [], tagsByCategory: {}, searchTags: vi.fn().mockReturnValue([]) }),
}));

import { GroupFilters } from '../GroupFilters';

describe('GroupFilters', () => {
  it('renders', () => {
    const { container } = render(
      <GroupFilters
        searchQuery=""
        onSearchChange={vi.fn()}
        activeFilters={[]}
        onFilterChange={vi.fn()}
        showMyGroups={false}
        onShowMyGroupsChange={vi.fn()}
        selectedTags={[]}
        onTagsChange={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
