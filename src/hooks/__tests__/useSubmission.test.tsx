import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
    rpc: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { useSubmission } from '../useSubmission';
import { submissionRegistry } from '@/config/submissionRegistry';

const eventConfig = submissionRegistry.event!;

describe('useSubmission (event wizard)', () => {
  it('nextStep on empty Step 1 blocks advance and reports first invalid field', async () => {
    const { result } = renderHook(() => useSubmission(eventConfig));

    let outcome: { ok: boolean; firstInvalid?: string } = { ok: true };
    await act(async () => {
      outcome = await result.current.nextStep();
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.firstInvalid).toBe('title');
    expect(result.current.currentStep).toBe(0);
    expect(result.current.errors.title).toMatch(/required/i);
    expect(result.current.errors.event_type).toMatch(/required/i);
    expect(result.current.stepAnnouncement).toMatch(/fix/i);
  });

  it('nextStep advances when Step 1 required fields are filled', async () => {
    const { result } = renderHook(() => useSubmission(eventConfig));

    act(() => {
      result.current.setField('title', 'Pride 2026');
      result.current.setField('event_type', 'pride');
    });

    let outcome: { ok: boolean; firstInvalid?: string } = { ok: false };
    await act(async () => {
      outcome = await result.current.nextStep();
    });

    expect(outcome.ok).toBe(true);
    expect(result.current.currentStep).toBe(1);
    expect(result.current.stepAnnouncement).toBe('');
  });

  it('setField clears the corresponding error after a failed validation', async () => {
    const { result } = renderHook(() => useSubmission(eventConfig));

    await act(async () => {
      await result.current.nextStep();
    });
    expect(result.current.errors.title).toBeTruthy();

    act(() => {
      result.current.setField('title', 'A real title');
    });

    await waitFor(() => {
      expect(result.current.errors.title).toBeUndefined();
    });
  });

  it('does not require end_date on Step 2', async () => {
    const { result } = renderHook(() => useSubmission(eventConfig));

    act(() => {
      result.current.setField('title', 'Pride 2026');
      result.current.setField('event_type', 'pride');
    });
    await act(async () => {
      await result.current.nextStep();
    });

    act(() => {
      result.current.setField('start_date', new Date().toISOString());
      result.current.setField('city', 'Berlin');
      result.current.setField('country', 'Germany');
    });

    let outcome: { ok: boolean; firstInvalid?: string } = { ok: false };
    await act(async () => {
      outcome = await result.current.nextStep();
    });

    expect(outcome.ok).toBe(true);
    expect(result.current.currentStep).toBe(2);
  });
});
