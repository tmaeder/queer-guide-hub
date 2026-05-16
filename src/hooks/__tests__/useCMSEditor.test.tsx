/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }), single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}));
vi.mock('@/config/contentTypeRegistry', () => ({ getContentType: () => null }));

import { useCMSEditor } from '../useCMSEditor';

describe('useCMSEditor', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useCMSEditor({ contentType: 'venues', itemId: null }));
    expect(result.current).toBeDefined();
  });
});
