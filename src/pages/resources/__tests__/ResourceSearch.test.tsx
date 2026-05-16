/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/resources/TagListRenderer', () => ({
  TagListRenderer: (p: { tags: Array<{ id: string }> }) => <div data-testid="list">{p.tags.length}</div>,
}));
vi.mock('@/components/resources/categoryMeta', () => ({
  getCategoryShortName: (c: string) => c.toUpperCase(),
}));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));

import { ResourceSearch } from '../ResourceSearch';

const tags = [{ id: '1' }, { id: '2' }] as never;

describe('ResourceSearch', () => {
  it("renders 'Search results' heading in search mode", () => {
    render(
      <ResourceSearch
        viewMode="search" filterCategory="all"
        filteredAndSortedTags={tags} tagUsageCounts={{}}
        displayMode={'list' as never} onTagClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Search results')).toBeInTheDocument();
    expect(screen.getByTestId('list')).toHaveTextContent('2');
  });

  it('renders category-specific heading in non-search mode', () => {
    render(
      <ResourceSearch
        viewMode={'category' as never} filterCategory="health"
        filteredAndSortedTags={tags} tagUsageCounts={{}}
        displayMode={'list' as never} onTagClick={vi.fn()}
      />,
    );
    expect(screen.getByText('HEALTH tags')).toBeInTheDocument();
  });

  it('shows empty state when no results', () => {
    render(
      <ResourceSearch
        viewMode="search" filterCategory="all"
        filteredAndSortedTags={[]} tagUsageCounts={{}}
        displayMode={'list' as never} onTagClick={vi.fn()}
      />,
    );
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
