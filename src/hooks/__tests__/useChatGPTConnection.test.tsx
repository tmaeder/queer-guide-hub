import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const { invokeMock, toastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  toastMock: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
import { useChatGPTConnection } from '../useChatGPTConnection';

afterEach(() => {
  vi.restoreAllMocks();
  invokeMock.mockReset();
  toastMock.mockReset();
});

describe('useChatGPTConnection', () => {
  it('should expose connection API', () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useChatGPTConnection());
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.testConnection).toBe('function');
    expect(result.current.loading).toBe(true);
  });

  it('opens the OAuth popup inside the click, before the authorize call returns (Safari)', async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useChatGPTConnection());
    const win = { opener: {}, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    let resolveAuth: (v: unknown) => void = () => {};
    invokeMock.mockReturnValueOnce(new Promise((r) => (resolveAuth = r)));
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.connect();
    });
    expect(open).toHaveBeenCalledWith(
      'about:blank',
      'chatgpt-oauth',
      'width=600,height=700,scrollbars=yes',
    );
    resolveAuth({ data: { authorization_url: 'https://auth.example/authorize' }, error: null });
    await act(async () => {
      await done;
    });
    expect(win.location.href).toBe('https://auth.example/authorize');
    expect(open).toHaveBeenCalledTimes(1);
    win.closed = true;
  });

  it('says so when the popup is blocked instead of failing silently', async () => {
    invokeMock.mockResolvedValue({
      data: { authorization_url: 'https://auth.example/a' },
      error: null,
    });
    const { result } = renderHook(() => useChatGPTConnection());
    vi.spyOn(window, 'open').mockReturnValue(null);
    await act(async () => {
      await result.current.connect();
    });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Popup blocked' }));
  });

  it('closes the pending popup when the authorize call fails', async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useChatGPTConnection());
    const win = { opener: {}, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await act(async () => {
      await result.current.connect();
    });
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
