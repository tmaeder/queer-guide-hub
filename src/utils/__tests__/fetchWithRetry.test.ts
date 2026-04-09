import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the module
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { queryWithRetry, invokeWithRetry } from '../fetchWithRetry';

describe('queryWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns data on first successful attempt', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null, count: 1 });

    const result = await queryWithRetry(mockQuery);

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.error).toBeNull();
    expect(result.count).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns error on non-retryable error (4xx)', async () => {
    const error = { message: 'Not found', status: 404 };
    const mockQuery = vi.fn().mockResolvedValue({ data: null, error, count: null });

    const result = await queryWithRetry(mockQuery, { maxRetries: 3 });

    expect(result.data).toBeNull();
    expect(result.error).toEqual(error);
    expect(mockQuery).toHaveBeenCalledTimes(1); // No retries for 4xx
  });

  it('retries on server error (5xx) and succeeds', async () => {
    const serverError = { message: 'Internal error', status: 500 };
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: serverError, count: null })
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null, count: 1 });

    const result = await queryWithRetry(mockQuery, { maxRetries: 3 });

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.error).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('retries on network error and exhausts retries', async () => {
    const networkError = new Error('Failed to fetch');
    const mockQuery = vi.fn().mockRejectedValue(networkError);

    const result = await queryWithRetry(mockQuery, { maxRetries: 2 });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('times out on slow queries', async () => {
    const mockQuery = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: [], error: null }), 20000))
    );

    const result = await queryWithRetry(mockQuery, { maxRetries: 1, timeoutMs: 100 });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('does not retry auth errors (401)', async () => {
    const authError = { message: 'Unauthorized', status: 401 };
    const mockQuery = vi.fn().mockResolvedValue({ data: null, error: authError, count: null });

    const result = await queryWithRetry(mockQuery, { maxRetries: 3 });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(result.error).toEqual(authError);
  });
});

describe('invokeWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns data on successful invocation', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { result: 'ok' }, error: null });

    const result = await invokeWithRetry('test-function');

    expect(result.data).toEqual({ result: 'ok' });
    expect(result.error).toBeNull();
  });

  it('passes body and headers to invoke', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: null });

    await invokeWithRetry('test-function', {
      body: { query: 'test' },
      headers: { 'X-Custom': 'value' },
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('test-function', {
      body: { query: 'test' },
      headers: { 'X-Custom': 'value' },
    });
  });
});
