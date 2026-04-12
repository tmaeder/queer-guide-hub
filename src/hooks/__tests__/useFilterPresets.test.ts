import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterPresets } from '../useFilterPresets';

describe('useFilterPresets', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1' as `${string}-${string}-${string}-${string}-${string}`);
  });

  it('should start with empty presets', () => {
    const { result } = renderHook(() => useFilterPresets('test-table'));
    expect(result.current.presets).toEqual([]);
  });

  it('should load presets from localStorage', () => {
    localStorage.setItem('admin-table-presets:venues', JSON.stringify([
      { id: '1', name: 'P1', filters: [], search: '', sorting: [] },
    ]));
    const { result } = renderHook(() => useFilterPresets('venues'));
    expect(result.current.presets).toHaveLength(1);
  });

  it('should save a preset', () => {
    const { result } = renderHook(() => useFilterPresets('test'));
    act(() => {
      result.current.save('My Filter', { filters: [], debouncedSearch: 'foo', sorting: [] });
    });
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe('My Filter');
    expect(result.current.presets[0].search).toBe('foo');
  });

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useFilterPresets('persist'));
    act(() => {
      result.current.save('Test', { filters: [], debouncedSearch: '', sorting: [] });
    });
    const stored = JSON.parse(localStorage.getItem('admin-table-presets:persist')!);
    expect(stored).toHaveLength(1);
  });

  it('should remove a preset', () => {
    const { result } = renderHook(() => useFilterPresets('rm'));
    act(() => {
      result.current.save('A', { filters: [], debouncedSearch: '', sorting: [] });
    });
    const id = result.current.presets[0].id;
    act(() => { result.current.remove(id); });
    expect(result.current.presets).toHaveLength(0);
  });

  it('should get preset by id', () => {
    const { result } = renderHook(() => useFilterPresets('get'));
    act(() => {
      result.current.save('Find Me', { filters: [], debouncedSearch: '', sorting: [] });
    });
    const found = result.current.get('test-uuid-1');
    expect(found?.name).toBe('Find Me');
  });

  it('should return null for unknown id', () => {
    const { result } = renderHook(() => useFilterPresets('miss'));
    expect(result.current.get('nope')).toBeNull();
  });

  it('should limit to 10 presets', () => {
    let counter = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(() => `uuid-${counter++}` as any);
    const { result } = renderHook(() => useFilterPresets('limit'));
    for (let i = 0; i < 12; i++) {
      act(() => {
        result.current.save(`P${i}`, { filters: [], debouncedSearch: '', sorting: [] });
      });
    }
    expect(result.current.presets.length).toBeLessThanOrEqual(10);
  });
});
