/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthMock, useToastMock, useTripMessagesMock, sendMutate } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useToastMock: vi.fn(),
  useTripMessagesMock: vi.fn(),
  sendMutate: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripCollaboration', () => ({ useTripMessages: useTripMessagesMock }));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));

import { TripChat } from '../TripChat';

beforeEach(() => {
  useAuthMock.mockReset();
  useToastMock.mockReset();
  useTripMessagesMock.mockReset();
  sendMutate.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useToastMock.mockReturnValue({ toast: vi.fn() });
});

describe('TripChat', () => {
  it('shows loading state', () => {
    useTripMessagesMock.mockReturnValue({ data: undefined, isLoading: true, sendMessage: { mutate: sendMutate, isPending: false } });
    render(<TripChat tripId="t1" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    useTripMessagesMock.mockReturnValue({ data: [], isLoading: false, sendMessage: { mutate: sendMutate, isPending: false } });
    render(<TripChat tripId="t1" />);
    expect(screen.getByText(/Start the conversation/i)).toBeInTheDocument();
  });

  it('renders message list', () => {
    useTripMessagesMock.mockReturnValue({
      data: [
        { id: 'm1', sender_id: 'u2', sender: { display_name: 'Bob', avatar_url: null }, content: 'Hello', created_at: new Date().toISOString(), reply_to: null },
      ],
      isLoading: false,
      sendMessage: { mutate: sendMutate, isPending: false },
    });
    render(<TripChat tripId="t1" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('Send disabled until text typed', () => {
    useTripMessagesMock.mockReturnValue({ data: [], isLoading: false, sendMessage: { mutate: sendMutate, isPending: false } });
    render(<TripChat tripId="t1" />);
    const buttons = screen.getAllByRole('button');
    const send = buttons[buttons.length - 1];
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'hi' } });
    expect(send).not.toBeDisabled();
  });

  it('Send submits content via mutate', () => {
    useTripMessagesMock.mockReturnValue({ data: [], isLoading: false, sendMessage: { mutate: sendMutate, isPending: false } });
    render(<TripChat tripId="t1" />);
    fireEvent.change(screen.getByPlaceholderText(/Type a message/i), { target: { value: 'hi' } });
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(sendMutate).toHaveBeenCalledWith({ content: 'hi', replyTo: undefined }, expect.any(Object));
  });
});
