/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCMSFilters } from '../useCMSFilters';

type Row = Record<string, unknown>;

const ROWS: Row[] = [
  { id: '1', title: 'Berghain', description: 'Techno club', content_type: 'venue', status: 'published', updated_at: '2026-03-10T00:00:00Z' },
  { id: '2', title: 'Pride Berlin', description: 'Annual parade', content_type: 'event', status: 'draft', updated_at: '2026-04-15T00:00:00Z' },
  { id: '3', title: 'SchwuZ', description: 'Bar', content_type: 'venue', status: 'published', updated_at: '2026-02-01T00:00:00Z' },
  { id: '4', title: 'Old News', description: 'Article', content_type: 'news', status: 'archived', updated_at: '2026-01-01T00:00:00Z', deleted_at: '2026-04-01T00:00:00Z' },
];

describe('useCMSFilters', () => {
  describe('Initial state', () => {
    it('renders all non-deleted rows by default, sorted by updated_at desc', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      // Non-deleted only by default; deleted_at row excluded.
      expect(result.current.totalResults).toBe(3);
      expect(result.current.filteredData.map((r: Row) => r.id)).toEqual(['2', '1', '3']);
    });

    it('exposes total records, including deleted', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      expect(result.current.totalRecords).toBe(4);
    });
  });

  describe('Search filter', () => {
    it('matches title case-insensitively', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('search', 'berghain'));
      expect(result.current.filteredData.map((r: Row) => r.id)).toEqual(['1']);
    });

    it('matches description', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('search', 'parade'));
      expect(result.current.filteredData.map((r: Row) => r.id)).toEqual(['2']);
    });

    it('resets to page 1 when search changes', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('page', 2));
      expect(result.current.filters.page).toBe(2);
      act(() => result.current.updateFilter('search', 'x'));
      expect(result.current.filters.page).toBe(1);
    });
  });

  describe('Content type filter', () => {
    it('filters to a single content type', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('contentType', 'venue'));
      expect(result.current.filteredData.map((r: Row) => r.id).sort()).toEqual(['1', '3']);
    });
  });

  describe('Status filter', () => {
    it('filters by published status', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('status', 'published'));
      expect(result.current.filteredData.map((r: Row) => r.id).sort()).toEqual(['1', '3']);
    });
  });

  describe('Date range filter', () => {
    it('restricts to a date window', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() =>
        result.current.updateFilter('dateRange', {
          from: new Date('2026-03-01'),
          to: new Date('2026-05-01'),
        }),
      );
      expect(result.current.filteredData.map((r: Row) => r.id).sort()).toEqual(['1', '2']);
    });
  });

  describe('Show deleted', () => {
    it('reveals soft-deleted rows when toggled on', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('showDeleted', true));
      expect(result.current.filteredData.length).toBe(4);
    });
  });

  describe('Sorting', () => {
    it('updateSort flips order when called on same column', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      // Initial: sortBy=updated_at, sortOrder=desc. First updateSort on
      // 'updated_at' takes the `===` branch and flips to asc.
      act(() => result.current.updateSort('updated_at'));
      expect(result.current.filters.sortOrder).toBe('asc');

      act(() => result.current.updateSort('updated_at'));
      expect(result.current.filters.sortOrder).toBe('desc');
    });

    it("updateSort on new column resets to 'asc'", () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateSort('title'));
      expect(result.current.filters.sortBy).toBe('title');
      expect(result.current.filters.sortOrder).toBe('asc');
    });

    it('sorts strings case-insensitively', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateSort('title'));
      const titles = result.current.filteredData.map((r: Row) => r.title);
      // alphabetical asc — non-deleted only: Berghain, Pride Berlin, SchwuZ
      expect(titles).toEqual(['Berghain', 'Pride Berlin', 'SchwuZ']);
    });
  });

  describe('Pagination', () => {
    it('paginates by pageSize', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('pageSize', 2));
      expect(result.current.filteredData).toHaveLength(2);
      expect(result.current.totalPages).toBe(2);

      act(() => result.current.updateFilter('page', 2));
      expect(result.current.filteredData).toHaveLength(1);
    });
  });

  describe('resetFilters', () => {
    it('returns to default state', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      act(() => result.current.updateFilter('search', 'x'));
      act(() => result.current.updateFilter('contentType', 'venue'));
      act(() => result.current.resetFilters());

      expect(result.current.filters.search).toBe('');
      expect(result.current.filters.contentType).toBe('all');
      expect(result.current.filters.page).toBe(1);
    });
  });

  describe('filterOptions', () => {
    it('lists unique content types and statuses from the data', () => {
      const { result } = renderHook(() => useCMSFilters({ data: ROWS }));
      expect(result.current.filterOptions.contentTypes.sort()).toEqual(
        ['event', 'news', 'venue'],
      );
      expect(result.current.filterOptions.statuses).toContain('published');
      expect(result.current.filterOptions.statuses).toContain('draft');
    });
  });
});
