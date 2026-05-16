/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

const { useAuthMock, fetchPrefsMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fetchPrefsMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useTravelPreferencesEditor', () => ({
  fetchProfileTravelPreferences: fetchPrefsMock,
}));

import { TravelPrefsPrompt } from '../TravelPrefsPrompt';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useAuthMock.mockReset();
  fetchPrefsMock.mockReset();
  sessionStorage.clear();
});

describe('TravelPrefsPrompt', () => {
  it('renders nothing when signed-out', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = render(<TravelPrefsPrompt />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when user already has prefs', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    fetchPrefsMock.mockResolvedValue({ budget: 'mid' });
    const { container } = render(<TravelPrefsPrompt />, { wrapper });
    await waitFor(() => expect(fetchPrefsMock).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('shows prompt when user has no prefs', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    fetchPrefsMock.mockResolvedValue({});
    render(<TravelPrefsPrompt />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Personalize your travel/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Set up/i })).toHaveAttribute('href', '/profile/settings?tab=travel');
  });

  it('Dismiss persists to sessionStorage and hides the prompt', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    fetchPrefsMock.mockResolvedValue({});
    const { container } = render(<TravelPrefsPrompt />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Personalize your travel/i)).toBeInTheDocument());
    const dismissBtns = screen.getAllByRole('button');
    fireEvent.click(dismissBtns[dismissBtns.length - 1]);
    expect(sessionStorage.getItem('qg_travel_prefs_dismissed')).toBe('1');
    expect(container.firstChild).toBeNull();
  });
});
