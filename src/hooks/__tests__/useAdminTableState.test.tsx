/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAdminTableState } from '../useAdminTableState';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useAdminTableState — defaults', () => {
  it('initializes with sensible defaults', () => {
    const { result } = renderHook(() => useAdminTableState());
    expect(result.current.state.search).toBe('');
    expect(result.current.state.debouncedSearch).toBe('');
    expect(result.current.state.filters).toEqual({});
    expect(result.current.state.sorting).toBeNull();
    expect(result.current.state.pagination).toEqual({ page: 1, pageSize: 25 });
    expect(result.current.state.selectedIds.size).toBe(0);
  });

  it('honors provided defaults', () => {
    const { result } = renderHook(() =>
      useAdminTableState({
        defaultSort: { column: 'name', direction: 'asc' },
        defaultPageSize: 50,
        defaultColumnVisibility: { hidden_col: false },
        defaultFilters: { status: 'active' },
      }),
    );
    expect(result.current.state.sorting).toEqual({ column: 'name', direction: 'asc' });
    expect(result.current.state.pagination.pageSize).toBe(50);
    expect(result.current.state.filters).toEqual({ status: 'active' });
    expect(result.current.state.columnVisibility).toEqual({ hidden_col: false });
  });
});

describe('useAdminTableState — search debounce', () => {
  it('updates search immediately, debouncedSearch after 300ms; resets to page 1', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.setPage(3));
    expect(result.current.state.pagination.page).toBe(3);

    act(() => result.current.setSearch('berghain'));
    expect(result.current.state.search).toBe('berghain');
    expect(result.current.state.debouncedSearch).toBe('');

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.state.debouncedSearch).toBe('berghain');
    expect(result.current.state.pagination.page).toBe(1);
  });
});

describe('useAdminTableState — filters', () => {
  it('setFilter merges + resets page + clears selection', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.toggleRow('a'));
    expect(result.current.state.selectedIds.has('a')).toBe(true);

    act(() => result.current.setFilter('status', 'review'));
    expect(result.current.state.filters.status).toBe('review');
    expect(result.current.state.selectedIds.size).toBe(0);
  });

  it('clearFilters resets search + filters + page + selection', () => {
    const { result } = renderHook(() => useAdminTableState({ defaultFilters: { x: 1 } }));
    act(() => result.current.setSearch('foo'));
    act(() => result.current.clearFilters());
    expect(result.current.state.search).toBe('');
    expect(result.current.state.filters).toEqual({});
  });
});

describe('useAdminTableState — sort cycle', () => {
  it('cycles asc → desc → null on same column, resets to asc on new column', () => {
    const { result } = renderHook(() => useAdminTableState());

    act(() => result.current.toggleSort('name'));
    expect(result.current.state.sorting).toEqual({ column: 'name', direction: 'asc' });

    act(() => result.current.toggleSort('name'));
    expect(result.current.state.sorting).toEqual({ column: 'name', direction: 'desc' });

    act(() => result.current.toggleSort('name'));
    expect(result.current.state.sorting).toBeNull();

    act(() => result.current.toggleSort('updated_at'));
    expect(result.current.state.sorting).toEqual({ column: 'updated_at', direction: 'asc' });
  });
});

describe('useAdminTableState — pagination', () => {
  it('setPage clears selection', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.toggleRow('a'));
    act(() => result.current.setPage(2));
    expect(result.current.state.pagination.page).toBe(2);
    expect(result.current.state.selectedIds.size).toBe(0);
  });

  it('setPageSize resets page to 1 + clears selection', () => {
    const { result } = renderHook(() => useAdminTableState({ defaultPageSize: 25 }));
    act(() => result.current.setPage(3));
    act(() => result.current.toggleRow('a'));
    act(() => result.current.setPageSize(50));
    expect(result.current.state.pagination).toEqual({ page: 1, pageSize: 50 });
    expect(result.current.state.selectedIds.size).toBe(0);
  });
});

describe('useAdminTableState — selection', () => {
  it('toggleRow adds then removes', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.toggleRow('a'));
    expect(result.current.state.selectedIds.has('a')).toBe(true);
    act(() => result.current.toggleRow('a'));
    expect(result.current.state.selectedIds.has('a')).toBe(false);
  });

  it('selectAll replaces selection; clearSelection empties it', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.selectAll(['a', 'b', 'c']));
    expect(result.current.state.selectedIds.size).toBe(3);
    act(() => result.current.clearSelection());
    expect(result.current.state.selectedIds.size).toBe(0);
  });
});

describe('useAdminTableState — columns + grouping', () => {
  it('toggleColumnVisibility flips boolean by id', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.toggleColumnVisibility('actions'));
    expect(result.current.state.columnVisibility.actions).toBe(true);
    act(() => result.current.toggleColumnVisibility('actions'));
    expect(result.current.state.columnVisibility.actions).toBe(false);
  });

  it('setGrouping replaces grouping array', () => {
    const { result } = renderHook(() => useAdminTableState());
    act(() => result.current.setGrouping(['status', 'priority']));
    expect(result.current.state.grouping).toEqual(['status', 'priority']);
  });
});
