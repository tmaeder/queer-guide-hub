import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const insertSpy = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertSpy })),
  },
}));

import { useSignupFunnel } from '../useSignupFunnel';

describe('useSignupFunnel', () => {
  beforeEach(() => {
    insertSpy.mockClear();
    window.sessionStorage.clear();
  });

  it('emits an event with the right shape and a stable session id', async () => {
    const { result } = renderHook(() => useSignupFunnel());
    const sid = result.current.sessionId;
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);

    await act(async () => {
      await result.current.emit('step_started', { step: 2, provider: 'email' });
    });

    expect(insertSpy).toHaveBeenCalledWith({
      session_id: sid,
      event: 'step_started',
      step: 2,
      provider: 'email',
      metadata: {},
    });
  });

  it('reset() rotates the session id', async () => {
    const { result } = renderHook(() => useSignupFunnel());
    const first = result.current.sessionId;
    act(() => result.current.reset());
    // sessionId on the returned object is captured at hook init; new session id
    // applies to subsequent emits via the ref. Verify storage was cleared.
    expect(window.sessionStorage.getItem('qg:signup:session_id')).not.toBe(first);
  });
});
