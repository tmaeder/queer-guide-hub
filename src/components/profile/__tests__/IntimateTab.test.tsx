import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useMyIntimateProfile = vi.fn();
const useOptOutIntimateProfile = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));
const upsertMutate = vi.fn();

vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: (...a: unknown[]) => useMyIntimateProfile(...a),
  useOptOutIntimateProfile: (...a: unknown[]) => useOptOutIntimateProfile(...a),
  useMyIntimateText: () => ({ data: null }),
  useIntimateKinkTags: () => ({ data: [] }),
  useUpsertIntimateProfile: () => ({
    mutateAsync: vi.fn(),
    mutate: upsertMutate,
    isPending: false,
  }),
  useSetIntimateText: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/intimate/HankyCodePicker', () => ({ HankyCodePicker: () => null }));
vi.mock('@/hooks/useHankySignals', () => ({
  roleFromHanky: () => [],
  useHankyVariants: () => ({ data: [] }),
  useMyHankySignals: () => ({ data: {} }),
}));
vi.mock('@/hooks/useKinkRatings', () => ({ useMyKinkRatings: () => ({ data: new Map() }) }));
vi.mock('@/hooks/useKinkTaxonomy', () => ({ useKinkTaxonomy: () => ({ data: undefined }) }));
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

  it('edits every field inline when opted-in', () => {
    const now = new Date().toISOString();
    useMyIntimateProfile.mockReturnValue({
      data: { opted_in_at: now, consent_18plus_at: now, genitalia: 'vulva', role: [] },
      isLoading: false,
    });
    render(wrap(<IntimateTab />));
    expect(screen.queryByText(/Enable intimate profile/i)).toBeNull();
    // Role comes from the hanky pockets now; no separate role picker.
    expect(screen.queryByRole('region', { name: 'Your role' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Your safer sex' })).toBeInTheDocument();
    // Into/Limits duplicate the checklist below.
    expect(screen.queryByRole('region', { name: 'Into' })).toBeNull();
    // Who you want to meet lives in the matching rules, not here.
    expect(screen.queryByRole('region', { name: 'Who you are looking for' })).toBeNull();
    expect(screen.queryByRole('slider', { name: /Age range/ })).toBeNull();
    // Build and height moved to Body & about; age band stays here as a slider.
    expect(screen.queryByRole('region', { name: 'Body' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Age band' })).toBeInTheDocument();
    // Size/angle only apply to a penis.
    expect(screen.queryByRole('region', { name: 'Size' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Hide/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('offers to show a hidden profile without re-onboarding', () => {
    useMyIntimateProfile.mockReturnValue({
      data: { opted_in_at: null, consent_18plus_at: new Date().toISOString() },
      isLoading: false,
    });
    render(wrap(<IntimateTab />));
    expect(screen.getByRole('button', { name: 'Show profile' })).toBeInTheDocument();
  });

  it('derives the age band from the date of birth instead of asking again', () => {
    const now = new Date().toISOString();
    useMyIntimateProfile.mockReturnValue({
      data: {
        opted_in_at: now,
        consent_18plus_at: now,
        genitalia: 'vulva',
        role: [],
        age_band: null,
      },
      isLoading: false,
    });
    const dob = `${new Date().getFullYear() - 31}-01-01`;
    render(wrap(<IntimateTab dateOfBirth={dob} />));
    expect(screen.queryByRole('slider', { name: 'Age band' })).toBeNull();
    expect(screen.getByText('30-34')).toBeInTheDocument();
    expect(upsertMutate).toHaveBeenCalledWith({ age_band: '30-34' });
  });

  it('shows loading state', () => {
    useMyIntimateProfile.mockReturnValue({ data: undefined, isLoading: true });
    render(wrap(<IntimateTab />));
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });
});
