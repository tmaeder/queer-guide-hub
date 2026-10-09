/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const adultState = vi.hoisted(() => ({ affirmed: false }));
const intimateState = vi.hoisted(() => ({ profile: null as { consent_18plus_at: string } | null }));
vi.mock('@/hooks/useAgeAffirmation', () => ({
  useAgeAffirmation: () => ({ affirmed: adultState.affirmed, affirm: vi.fn() }),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useIntimateKinkTags: () => ({ data: [], isLoading: false }),
  useMyIntimateProfile: () => ({ data: intimateState.profile, isLoading: false }),
  useMyIntimateText: () => ({ data: null, isLoading: false }),
  useSetIntimateText: () => ({ mutateAsync: vi.fn().mockResolvedValue(null), isPending: false }),
  useUpsertIntimateProfile: () => ({
    mutateAsync: vi.fn().mockResolvedValue(null),
    isPending: false,
  }),
}));

import IntimateOnboard from '../IntimateOnboard';

describe('IntimateOnboard', () => {
  beforeEach(() => {
    adultState.affirmed = false;
    intimateState.profile = null;
  });

  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <IntimateOnboard />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('asks for 18+ confirmation when no prior confirmation exists', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <IntimateOnboard />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/I confirm I am at least 18 years old/i)).toBeInTheDocument();
  });

  it('skips the duplicate 18+ step when the user already confirmed elsewhere', () => {
    adultState.affirmed = true;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <IntimateOnboard />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText(/I confirm I am at least 18 years old/i)).toBeNull();
    expect(screen.getByText('Pick what applies to you.')).toBeInTheDocument();
  });

  it('skips the duplicate step when intimate consent already exists', () => {
    intimateState.profile = { consent_18plus_at: '2026-01-01T00:00:00.000Z' };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <IntimateOnboard />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText(/I confirm I am at least 18 years old/i)).toBeNull();
  });
});
