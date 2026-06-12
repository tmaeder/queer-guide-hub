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

  it('shows the quiet edit entry when user already has prefs', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    fetchPrefsMock.mockResolvedValue({ budget: 'mid' });
    render(<TravelPrefsPrompt />, { wrapper });
    await waitFor(() => expect(fetchPrefsMock).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Travel preferences/i })).toBeInTheDocument();
    expect(screen.queryByText(/Personalize your travel/i)).not.toBeInTheDocument();
  });

  it('shows the full banner when user has no prefs, with an in-context Set up button', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    fetchPrefsMock.mockResolvedValue({});
    render(<TravelPrefsPrompt />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Personalize your travel/i)).toBeInTheDocument());
    // in-context capture: a sheet trigger, not a link to settings
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set up/i })).toBeInTheDocument();
  });

  it('Dismiss persists to sessionStorage and collapses to the quiet entry', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    fetchPrefsMock.mockResolvedValue({});
    render(<TravelPrefsPrompt />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Personalize your travel/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    expect(sessionStorage.getItem('qg_travel_prefs_dismissed')).toBe('1');
    expect(screen.queryByText(/Personalize your travel/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Travel preferences/i })).toBeInTheDocument();
  });
});
