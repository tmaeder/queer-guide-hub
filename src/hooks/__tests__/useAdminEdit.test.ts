import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockSingle, mockInsert, mockGetUser } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockInsert: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'admin_edit_log') {
        return {
          insert: mockInsert,
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: mockSingle }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({ single: mockSingle }),
          }),
        }),
      };
    },
    auth: { getUser: mockGetUser },
  },
}));

import { useAdminEdit } from '../useAdminEdit';

describe('useAdminEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockInsert.mockResolvedValue({ error: null });
  });

  it('should start not loading', () => {
    const { result } = renderHook(() => useAdminEdit());
    expect(result.current.loading).toBe(false);
  });

  it('should expose editContent and fetchEditLog', () => {
    const { result } = renderHook(() => useAdminEdit());
    expect(typeof result.current.editContent).toBe('function');
    expect(typeof result.current.fetchEditLog).toBe('function');
  });

  it('should return error on fetch failure', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });
    const { result } = renderHook(() => useAdminEdit());
    let res: any;
    await act(async () => {
      res = await result.current.editContent('venues', 'v-1', { name: 'New Name' });
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Not found');
  });
});
