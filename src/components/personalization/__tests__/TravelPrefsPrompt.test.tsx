/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
// The editor is heavy (loads other hooks); stub it — we only assert the entry point.
vi.mock('@/components/profile/TravelPreferencesEditor', () => ({
  TravelPreferencesEditor: () => <div data-testid="travel-prefs-editor" />,
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
});

describe('TravelPrefsPrompt', () => {
  it('renders nothing when signed-out', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = render(<TravelPrefsPrompt />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it('always shows a persistent Travel preferences entry, with no dismiss', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<TravelPrefsPrompt />, { wrapper });
    expect(screen.getByRole('button', { name: /Travel preferences/i })).toBeInTheDocument();
    // standard, not optional: no dismiss control, no "Set up" banner
    expect(screen.queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Personalize your travel/i)).not.toBeInTheDocument();
  });

  it('opens the canonical editor in a sheet when clicked', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<TravelPrefsPrompt />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Travel preferences/i }));
    expect(screen.getByTestId('travel-prefs-editor')).toBeInTheDocument();
  });
});
