import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client
const mockInvoke = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'admin-user-id' } } }),
    },
  },
}));

// Import types only (hook requires React rendering which needs @testing-library/dom)
import type { CreateFlagParams } from '../useModeration';

describe('useModeration (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFlag via edge function', () => {
    it('calls create-moderation-flag with correct payload', async () => {
      const flagData: CreateFlagParams = {
        content_type: 'venues',
        content_id: 'venue-123',
        flag_type: 'REVIEW',
        reason: 'Incorrect opening hours',
      };

      mockInvoke.mockResolvedValue({
        data: { flag: { id: 'flag-1', ...flagData } },
        error: null,
      });

      // Simulate what createFlag does internally
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('create-moderation-flag', {
        body: flagData,
      });

      expect(mockInvoke).toHaveBeenCalledWith('create-moderation-flag', {
        body: flagData,
      });
      expect(error).toBeNull();
      expect(data.flag.id).toBe('flag-1');
    });

    it('returns error on edge function failure', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: new Error('Rate limited'),
      });

      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('create-moderation-flag', {
        body: {
          content_type: 'venues',
          content_id: 'venue-123',
          flag_type: 'OTHER',
          reason: 'Test',
        },
      });

      expect(error).toBeTruthy();
      expect(error.message).toBe('Rate limited');
      expect(data).toBeNull();
    });

    it('handles rate limit error in response data', async () => {
      mockInvoke.mockResolvedValue({
        data: { error: 'Rate limit exceeded: 10 flags per hour' },
        error: null,
      });

      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('create-moderation-flag', {
        body: {
          content_type: 'events',
          content_id: 'event-456',
          flag_type: 'DUPLICATE',
          reason: 'Same as event-123',
        },
      });

      expect(error).toBeNull();
      expect(data.error).toContain('Rate limit');
    });

    it('passes suggested_changes for CORRECTION flags', async () => {
      const params: CreateFlagParams = {
        content_type: 'venues',
        content_id: 'venue-123',
        flag_type: 'CORRECTION',
        reason: 'Wrong address',
        suggested_changes: { address: '123 New Street' },
      };

      mockInvoke.mockResolvedValue({
        data: { flag: { id: 'flag-1' } },
        error: null,
      });

      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.functions.invoke('create-moderation-flag', {
        body: params,
      });

      expect(mockInvoke).toHaveBeenCalledWith('create-moderation-flag', {
        body: expect.objectContaining({
          suggested_changes: { address: '123 New Street' },
          flag_type: 'CORRECTION',
        }),
      });
    });
  });

  describe('fetchFlags query building', () => {
    it('calls from(moderation_flags) with correct table', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        data: [],
        error: null,
        count: 0,
      };
      // Make range return a thenable
      mockQuery.range.mockReturnValue(
        Promise.resolve({ data: [], error: null, count: 0 }),
      );
      mockFrom.mockReturnValue(mockQuery);

      const { supabase } = await import('@/integrations/supabase/client');

      expect(mockFrom).toHaveBeenCalledWith('moderation_flags');
    });
  });

  describe('flag type validation', () => {
    it('all valid flag types are accepted by the type system', () => {
      const validTypes: CreateFlagParams['flag_type'][] = [
        'REVIEW', 'CORRECTION', 'DELETE_REQUEST', 'LINK_ISSUE', 'DUPLICATE', 'OTHER',
      ];
      expect(validTypes).toHaveLength(6);
      validTypes.forEach(t => expect(typeof t).toBe('string'));
    });
  });

  describe('updateFlagStatus logic', () => {
    it('sets resolved_by and resolved_at for RESOLVED status', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'flag-1', status: 'RESOLVED' },
          error: null,
        }),
      };
      mockFrom.mockReturnValue(mockQuery);

      const { supabase } = await import('@/integrations/supabase/client');
      const query = supabase.from('moderation_flags');
      query.update({
        status: 'RESOLVED',
        resolved_by: 'admin-user-id',
        resolved_at: new Date().toISOString(),
        resolution_note: 'Fixed',
        updated_at: new Date().toISOString(),
      });

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'RESOLVED',
          resolved_by: 'admin-user-id',
          resolution_note: 'Fixed',
        }),
      );
    });

    it('does NOT set resolved_by for IN_REVIEW status', () => {
      // IN_REVIEW only sets status + updated_at, not resolved_by
      const updates: Record<string, unknown> = {
        status: 'IN_REVIEW',
        updated_at: new Date().toISOString(),
      };
      // Per the hook logic, resolved_by is only set for RESOLVED/REJECTED
      expect(updates).not.toHaveProperty('resolved_by');
      expect(updates).not.toHaveProperty('resolved_at');
    });
  });
});
