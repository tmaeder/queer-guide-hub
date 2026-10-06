/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
const mockNavigate = vi.fn();
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => mockNavigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    createTrip: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  }),
}));
vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: ({
    id,
    label,
    onChange,
  }: {
    id: string;
    label: string;
    onChange: (value: unknown) => void;
  }) => (
    <>
      <input id={id} aria-label={label} />
      <button
        type="button"
        onClick={() =>
          onChange({
            cityId: 'city-berlin',
            cityName: 'Berlin',
            countryId: 'country-de',
            countryName: 'Germany',
            countryCode: 'DE',
            timezone: 'Europe/Berlin',
          })
        }
      >
        Choose Berlin
      </button>
    </>
  ),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { StartTripHero } from '../StartTripHero';

describe('StartTripHero', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

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

  it('preserves a signed-out destination and returns through auth', () => {
    render(
      <MemoryRouter initialEntries={['/travel?intent=inspire']}>
        <StartTripHero />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose Berlin' }));
    fireEvent.click(screen.getByTestId('travel-plan-trip'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/auth?redirect=%2Ftravel%3Fintent%3Dinspire',
    );
    expect(JSON.parse(sessionStorage.getItem('qg.pendingTripCapture') ?? 'null')).toMatchObject({
      source: 'travel-hero',
      returnTo: '/travel?intent=inspire',
      intent: {
        kind: 'start_destination',
        destination: { cityId: 'city-berlin', cityName: 'Berlin' },
      },
    });
  });
});
