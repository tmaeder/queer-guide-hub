import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useMyIntimateProfile = vi.fn();
const useOptOutIntimateProfile = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: (...a: unknown[]) => useMyIntimateProfile(...a),
  useOptOutIntimateProfile: (...a: unknown[]) => useOptOutIntimateProfile(...a),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { IntimateTab } from '../IntimateTab';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient();
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('IntimateTab', () => {
  beforeEach(() => {
    useMyIntimateProfile.mockReset();
  });

  it('shows CTA when not opted-in', () => {
    useMyIntimateProfile.mockReturnValue({ data: null, isLoading: false });
    render(wrap(<IntimateTab />));
    expect(screen.getByText(/Enable intimate profile/i)).toBeInTheDocument();
  });

  it('shows management buttons when opted-in', () => {
    useMyIntimateProfile.mockReturnValue({
      data: { opted_in_at: new Date().toISOString() },
      isLoading: false,
    });
    render(wrap(<IntimateTab />));
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText(/Hide/)).toBeInTheDocument();
    expect(screen.getByText(/Delete intimate profile/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    useMyIntimateProfile.mockReturnValue({ data: undefined, isLoading: true });
    render(wrap(<IntimateTab />));
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });
});
