import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFetchAutocomplete = vi.fn();
vi.mock('@/lib/searchClient', () => ({
  fetchAutocomplete: (...args: unknown[]) => mockFetchAutocomplete(...args),
}));

import { useSearchSuggestions } from '../useSearchSuggestions';

describe('useSearchSuggestions', () => {
  beforeEach(() => {
    mockFetchAutocomplete.mockReset();
  });

  it('should start with empty suggestions', () => {
    const { result } = renderHook(() => useSearchSuggestions(''));
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should not fetch for queries shorter than 2 chars', () => {
    renderHook(() => useSearchSuggestions('a'));
    expect(mockFetchAutocomplete).not.toHaveBeenCalled();
  });

  it('should dedup recurring events by title+city', async () => {
    mockFetchAutocomplete.mockResolvedValue([
      { id: '1', type: 'event', title: 'Berlin Pride', city: 'Berlin' },
      { id: '2', type: 'event', title: 'Berlin Pride', city: 'Berlin' },
      { id: '3', type: 'city', title: 'Berlin' },
    ]);

    const { result } = renderHook(() => useSearchSuggestions('Berlin'));
    await waitFor(() => expect(result.current.suggestions.length).toBeGreaterThan(0));

    const eventSuggestions = result.current.suggestions.filter((s) => s.type === 'event');
    expect(eventSuggestions).toHaveLength(1);
    expect(result.current.suggestions).toHaveLength(2);
  });

  it('should cap at 2 per type', async () => {
    mockFetchAutocomplete.mockResolvedValue([
      { id: '1', type: 'event', title: 'Event A', city: 'Berlin' },
      { id: '2', type: 'event', title: 'Event B', city: 'Berlin' },
      { id: '3', type: 'event', title: 'Event C', city: 'Munich' },
      { id: '4', type: 'city', title: 'Berlin' },
    ]);

    const { result } = renderHook(() => useSearchSuggestions('Berlin'));
    await waitFor(() => expect(result.current.suggestions.length).toBeGreaterThan(0));

    const eventSuggestions = result.current.suggestions.filter((s) => s.type === 'event');
    expect(eventSuggestions).toHaveLength(2);
  });

  it('should include slug from autocomplete response', async () => {
    mockFetchAutocomplete.mockResolvedValue([
      { id: '1', type: 'city', title: 'Berlin', slug: 'berlin', country: 'Germany' },
    ]);

    const { result } = renderHook(() => useSearchSuggestions('Berlin'));
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));

    expect(result.current.suggestions[0].slug).toBe('berlin');
  });

  it('should show country as subtitle for city type', async () => {
    mockFetchAutocomplete.mockResolvedValue([
      { id: '1', type: 'city', title: 'Berlin', slug: 'berlin', country: 'Germany', city: 'Berlin' },
    ]);

    const { result } = renderHook(() => useSearchSuggestions('Berlin'));
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));

    expect(result.current.suggestions[0].subtitle).toBe('Germany');
  });

  it('should show city as subtitle for venue type', async () => {
    mockFetchAutocomplete.mockResolvedValue([
      { id: '1', type: 'venue', title: 'Woof Berlin', city: 'Berlin', country: 'DE' },
    ]);

    const { result } = renderHook(() => useSearchSuggestions('Woof'));
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));

    expect(result.current.suggestions[0].subtitle).toBe('Berlin');
  });

  it('should silently fail on autocomplete errors (no banner)', async () => {
    mockFetchAutocomplete.mockRejectedValue(new Error('network blip'));
    const { result } = renderHook(() => useSearchSuggestions('Berlin'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Autocomplete is enhancement, not core — surface no error banner.
    expect(result.current.error).toBeNull();
    expect(result.current.suggestions).toEqual([]);
  });
});
