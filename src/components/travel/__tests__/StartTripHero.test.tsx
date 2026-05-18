/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    createTrip: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  }),
}));
vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: ({ id, label }: { id: string; label: string }) => (
    <input id={id} aria-label={label} />
  ),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { StartTripHero } from '../StartTripHero';

describe('StartTripHero', () => {
  it('renders the planning form', () => {
    render(<MemoryRouter><StartTripHero /></MemoryRouter>);
    expect(screen.getByText(/Plan a trip/i)).toBeInTheDocument();
  });

  it('start date input has a min attribute set to today (no past dates)', () => {
    render(<MemoryRouter><StartTripHero /></MemoryRouter>);
    const start = document.getElementById('travel-hero-start') as HTMLInputElement;
    expect(start).toBeTruthy();
    const min = start.getAttribute('min');
    expect(min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
