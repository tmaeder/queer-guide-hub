/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const {
  useAuthMock, useToastMock, useTripMutationsMock, useConciergeMock, useSendConciergeMock,
  sendMutate, addPlaceMutateAsync,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useToastMock: vi.fn(),
  useTripMutationsMock: vi.fn(),
  useConciergeMock: vi.fn(),
  useSendConciergeMock: vi.fn(),
  sendMutate: vi.fn(),
  addPlaceMutateAsync: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string | Record<string, unknown>) => (typeof d === 'string' ? d : (d as { defaultValue?: string })?.defaultValue ?? _k) }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTrips', () => ({ useTripMutations: useTripMutationsMock }));
vi.mock('@/hooks/useTripConcierge', () => ({
  useTripConcierge: useConciergeMock,
  useSendConciergeMessage: useSendConciergeMock,
}));

import { AiPlanTab } from '../AiPlanTab';

const trip = { id: 't1', trip_days: [{ id: 'd1', date: '2026-06-01' }] } as never;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthMock.mockReset();
  useToastMock.mockReset();
  useTripMutationsMock.mockReset();
  useConciergeMock.mockReset();
  useSendConciergeMock.mockReset();
  sendMutate.mockReset();
  addPlaceMutateAsync.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useToastMock.mockReturnValue({ toast: vi.fn() });
  useTripMutationsMock.mockReturnValue({ addPlace: { mutateAsync: addPlaceMutateAsync } });
  useSendConciergeMock.mockReturnValue({ mutate: sendMutate, isPending: false });
});

describe('AiPlanTab', () => {
  it('shows loading spinner while messages load', () => {
    useConciergeMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<AiPlanTab trip={trip} />, { wrapper });
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows start hint when no messages', () => {
    useConciergeMock.mockReturnValue({ data: [], isLoading: false });
    render(<AiPlanTab trip={trip} />, { wrapper });
    expect(screen.getByText(/5 days of queer Lisbon/i)).toBeInTheDocument();
  });

  it('renders user + assistant message bubbles', () => {
    useConciergeMock.mockReturnValue({
      data: [
        { id: 'm1', role: 'user', content: 'help', draft: null },
        { id: 'm2', role: 'assistant', content: 'sure', draft: null },
      ],
      isLoading: false,
    });
    render(<AiPlanTab trip={trip} />, { wrapper });
    expect(screen.getByText('help')).toBeInTheDocument();
    expect(screen.getByText('sure')).toBeInTheDocument();
  });

  it('Send disabled until text typed; clicking sends mutate', () => {
    useConciergeMock.mockReturnValue({ data: [], isLoading: false });
    render(<AiPlanTab trip={trip} />, { wrapper });
    const send = screen.getByRole('button', { name: /Send/i });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/concierge anything/i), { target: { value: 'plan it' } });
    fireEvent.click(send);
    expect(sendMutate).toHaveBeenCalledWith('plan it', expect.any(Object));
  });

  it('renders Apply to trip button when assistant message has draft', () => {
    useConciergeMock.mockReturnValue({
      data: [{ id: 'm1', role: 'assistant', content: 'here', draft: { days: [{ date: '2026-06-01', places: [{ custom_name: 'Cafe' }] }] } }],
      isLoading: false,
    });
    render(<AiPlanTab trip={trip} />, { wrapper });
    expect(screen.getByText('Cafe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply to trip/i })).toBeInTheDocument();
  });

  it("shows 'out of range' badge when draft date not in trip", () => {
    useConciergeMock.mockReturnValue({
      data: [{ id: 'm1', role: 'assistant', content: 'x', draft: { days: [{ date: '2099-01-01', places: [{ custom_name: 'X' }] }] } }],
      isLoading: false,
    });
    render(<AiPlanTab trip={trip} />, { wrapper });
    expect(screen.getByText(/out of range/i)).toBeInTheDocument();
  });
});
