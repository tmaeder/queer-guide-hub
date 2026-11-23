/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/useCentralizedTags', () => ({
  useCentralizedTags: () => ({
    allTags: [],
    tagsByCategory: {},
    searchTags: vi.fn().mockReturnValue([]),
  }),
}));

import { GroupFilters } from '../GroupFilters';

const setup = (over: Partial<Parameters<typeof GroupFilters>[0]> = {}) => {
  const props = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    activeFilters: [] as string[],
    onFilterChange: vi.fn(),
    selectedTags: [] as string[],
    onTagsChange: vi.fn(),
    ...over,
  };
  render(<GroupFilters {...props} />);
  return props;
};

describe('GroupFilters', () => {
  it('toggles a filter chip', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /Private/ }));
    expect(p.onFilterChange).toHaveBeenCalledWith(['private']);
  });

  // "My groups" is the tab above; a second toggle for it was redundant.
  it('has no My Groups filter and no tag counter', () => {
    setup();
    expect(screen.queryByRole('button', { name: /My Groups/i })).toBeNull();
    expect(screen.queryByText(/tags selected/)).toBeNull();
  });

  it('offers Clear only when something is filtered, and clears all of it', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    const p = setup({ activeFilters: ['large'], searchQuery: 'x' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(p.onFilterChange).toHaveBeenCalledWith([]);
    expect(p.onSearchChange).toHaveBeenCalledWith('');
    expect(p.onTagsChange).toHaveBeenCalledWith([]);
  });
});
