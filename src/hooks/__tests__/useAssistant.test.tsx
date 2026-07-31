/**
 * The assistant's error copy is the only thing users see when the worker
 * fails, so it must never be a machine string. During the Workers-AI neuron
 * outage the worker returned {"error":"assistant_error"} on every turn and the
 * hook rendered that token verbatim in the UI — these tests pin the mapping.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const askAssistant = vi.fn();

vi.mock('@/lib/assistantClient', async () => {
  class AssistantException extends Error {}
  return {
    askAssistant: (...args: unknown[]) => askAssistant(...args),
    AssistantException,
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

vi.mock('@/components/auth/TurnstileWidget', () => ({
  TurnstileWidget: () => null,
}));

const { useAssistant } = await import('@/hooks/useAssistant');
const { AssistantException } = await import('@/lib/assistantClient');

async function sendAndReadError(rejection: unknown) {
  askAssistant.mockRejectedValueOnce(rejection);
  const { result } = renderHook(() => useAssistant());
  await act(async () => {
    await result.current.send('gay bars in lisbon');
  });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  return result.current.error as string;
}

describe('useAssistant error copy', () => {
  beforeEach(() => {
    askAssistant.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('never surfaces the raw worker error token', async () => {
    const error = await sendAndReadError(new AssistantException('assistant_error'));
    expect(error).not.toContain('assistant_error');
    expect(error).toBe("Couldn't reach the guide. Try again in a moment.");
  });

  it('keeps the raw token in the console for diagnosis', async () => {
    await sendAndReadError(new AssistantException('assistant_error'));
    expect(console.error).toHaveBeenCalledWith('[assistant]', 'assistant_error');
  });

  it('maps an unmapped HTTP failure to copy, not the status string', async () => {
    const error = await sendAndReadError(new AssistantException('assistant 502'));
    expect(error).not.toMatch(/502/);
  });

  it('keeps the specific turnstile message', async () => {
    const error = await sendAndReadError(new AssistantException('turnstile_failed'));
    expect(error).toBe("Couldn't verify your browser. Reload the page and try again.");
  });

  it('keeps the specific rate-limit message', async () => {
    const error = await sendAndReadError(new AssistantException('rate_limited'));
    expect(error).toBe('Too many questions in a row — wait a minute and try again.');
  });
});
