/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthMock, useChatMock, useSendMock, usePresenceMock, sendMutate } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useChatMock: vi.fn(),
  useSendMock: vi.fn(),
  usePresenceMock: vi.fn(),
  sendMutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      return (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
    },
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useTripChat', () => ({
  useTripChat: useChatMock,
  useSendTripMessage: useSendMock,
}));
vi.mock('@/hooks/useTripPresence', () => ({ useTripPresence: usePresenceMock }));

import { TripChatTab } from '../TripChatTab';

beforeEach(() => {
  useAuthMock.mockReset();
  useChatMock.mockReset();
  useSendMock.mockReset();
  usePresenceMock.mockReset();
  sendMutate.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useSendMock.mockReturnValue({ mutate: sendMutate, isPending: false });
  usePresenceMock.mockReturnValue([]);
});

describe('TripChatTab', () => {
  it('shows loading state', () => {
    useChatMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<TripChatTab tripId="t1" />);
    expect(screen.getByText(/Loading conversation/i)).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    useChatMock.mockReturnValue({ data: [], isLoading: false });
    render(<TripChatTab tripId="t1" />);
    expect(screen.getByText(/Start the trip chat/i)).toBeInTheDocument();
  });

  it('renders message bubbles', () => {
    useChatMock.mockReturnValue({
      data: [
        { id: 'm1', sender_id: 'u2', sender: { display_name: 'Bob', avatar_url: null }, content: 'Hello', created_at: new Date().toISOString() },
        { id: 'm2', sender_id: 'u1', sender: { display_name: 'Me', avatar_url: null }, content: 'Hi', created_at: new Date().toISOString() },
      ],
      isLoading: false,
    });
    render(<TripChatTab tripId="t1" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('Send button disabled until text typed', () => {
    useChatMock.mockReturnValue({ data: [], isLoading: false });
    render(<TripChatTab tripId="t1" />);
    const send = screen.getByRole('button', { name: /Send/i });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Message the trip/i), { target: { value: 'yo' } });
    expect(send).not.toBeDisabled();
  });

  it('Send button submits draft via mutate', () => {
    useChatMock.mockReturnValue({ data: [], isLoading: false });
    render(<TripChatTab tripId="t1" />);
    fireEvent.change(screen.getByPlaceholderText(/Message the trip/i), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));
    expect(sendMutate).toHaveBeenCalledWith({ content: 'hi' }, expect.any(Object));
  });

  it('Enter key sends (no shift)', () => {
    useChatMock.mockReturnValue({ data: [], isLoading: false });
    render(<TripChatTab tripId="t1" />);
    const ta = screen.getByPlaceholderText(/Message the trip/i);
    fireEvent.change(ta, { target: { value: 'hi' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(sendMutate).toHaveBeenCalled();
  });

  it('renders presence avatars when members present', () => {
    useChatMock.mockReturnValue({ data: [], isLoading: false });
    usePresenceMock.mockReturnValue([
      { user_id: 'u1', display_name: 'Alice', avatar_url: null },
      { user_id: 'u2', display_name: 'Bob', avatar_url: null },
    ]);
    render(<TripChatTab tripId="t1" />);
    expect(screen.getByText(/viewing now/i)).toBeInTheDocument();
  });
});
