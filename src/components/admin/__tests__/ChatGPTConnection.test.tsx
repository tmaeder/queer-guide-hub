/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useConnMock } = vi.hoisted(() => ({ useConnMock: vi.fn() }));

vi.mock('@/hooks/useChatGPTConnection', () => ({ useChatGPTConnection: useConnMock }));

import { ChatGPTConnection } from '../ChatGPTConnection';

const baseHook = {
  status: null, loading: false, testing: false,
  connect: vi.fn(), disconnect: vi.fn(), testConnection: vi.fn(), refresh: vi.fn(),
};

beforeEach(() => useConnMock.mockReset());

describe('ChatGPTConnection', () => {
  it('shows loading state', () => {
    useConnMock.mockReturnValue({ ...baseHook, loading: true });
    render(<ChatGPTConnection />);
    expect(screen.getByText(/Loading connection status/)).toBeInTheDocument();
  });

  it('shows Not Connected when no status', () => {
    useConnMock.mockReturnValue({ ...baseHook, status: { connected: false } });
    render(<ChatGPTConnection />);
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect ChatGPT/ })).toBeInTheDocument();
  });

  it('shows Connected + Disconnect button when connected', () => {
    useConnMock.mockReturnValue({
      ...baseHook,
      status: { connected: true, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
    });
    render(<ChatGPTConnection />);
    expect(screen.getByText('Connected via OAuth')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeInTheDocument();
  });

  it('shows fallback warning when using_fallback', () => {
    useConnMock.mockReturnValue({ ...baseHook, status: { connected: false, using_fallback: true } });
    render(<ChatGPTConnection />);
    expect(screen.getByText(/API Key Fallback/i)).toBeInTheDocument();
  });

  it('Connect button fires connect()', () => {
    const connect = vi.fn();
    useConnMock.mockReturnValue({ ...baseHook, status: { connected: false }, connect });
    render(<ChatGPTConnection />);
    fireEvent.click(screen.getByRole('button', { name: /Connect ChatGPT/ }));
    expect(connect).toHaveBeenCalled();
  });
});
