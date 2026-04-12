import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { mockSelect, mockDelete, mockInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
  mockInsert: vi.fn(),
}));

const mockUser = { id: 'user-1' };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: mockSelect,
      }),
      delete: () => ({
        eq: () => ({
          eq: mockDelete,
        }),
      }),
      insert: mockInsert,
    }),
  },
}));

import { useFavorites } from '../useFavorites';

describe('useFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ data: [{ venue_id: 'v-1' }, { venue_id: 'v-2' }], error: null });
  });

  it('should load favorites on mount', async () => {
    const { result } = renderHook(() => useFavorites('venue'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFavorited('v-1')).toBe(true);
    expect(result.current.isFavorited('v-2')).toBe(true);
    expect(result.current.isFavorited('v-3')).toBe(false);
  });

  it('should expose toggleFavorite', async () => {
    const { result } = renderHook(() => useFavorites('venue'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.toggleFavorite).toBe('function');
  });

  it('should optimistically add favorite', async () => {
    mockInsert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useFavorites('venue'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggleFavorite('v-new'); });
    expect(result.current.isFavorited('v-new')).toBe(true);
  });

  it('should optimistically remove favorite', async () => {
    mockDelete.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useFavorites('venue'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.toggleFavorite('v-1'); });
    expect(result.current.isFavorited('v-1')).toBe(false);
  });

  it('should return favoriteIds set', async () => {
    const { result } = renderHook(() => useFavorites('venue'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favoriteIds.size).toBe(2);
  });
});
