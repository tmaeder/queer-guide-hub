import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TripTravelBuddiesCTA } from '@/components/trips/TripTravelBuddiesCTA';
import { TravelMeetLink } from '@/components/travel-meet/TravelMeetLink';
const mocks = vi.hoisted(() => ({
  status: 'ready',
  criminalized: false,
  unknown: false,
  setStatus: vi.fn(),
}));
vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => ({
    status: mocks.status,
    countries: [{ lgbti_criminalization: { legal: mocks.unknown ? null : true } }],
    hasUnknownDestination: mocks.unknown,
    hasCriminalizedDestination: mocks.criminalized,
    hasDeathPenaltyRiskDestination: false,
  }),
}));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ setStatus: mocks.setStatus }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
const mount = () =>
  render(
    <MemoryRouter>
      <TripTravelBuddiesCTA
        tripId="trip"
        cityId="city"
        countryIds={['country']}
        startDate="2099-06-01"
        endDate="2099-06-03"
      />
    </MemoryRouter>,
  );
beforeEach(() => {
  mocks.status = 'ready';
  mocks.criminalized = false;
  mocks.unknown = false;
  vi.clearAllMocks();
});
describe('private trip entry point', () => {
  it('carries trip and dates without publishing presence', () => {
    mount();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/meet?tripId=trip&cityId=city&start=2099-06-01&end=2099-06-03',
    );
    expect(mocks.setStatus).not.toHaveBeenCalled();
  });
  it.each(['loading', 'error', 'idle'])('waits for a real safety verdict: %s', (status) => {
    mocks.status = status;
    mount();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('compose opens the invitation composer, still behind its consent step', () => {
    render(
      <MemoryRouter>
        <TravelMeetLink context={{ cityId: 'city' }} countryIds={['country']} compose />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/meet?cityId=city&compose=1');
  });
  it('suppresses a criminalizing destination', () => {
    mocks.criminalized = true;
    mount();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('does not imply an unmeasured destination is safe', () => {
    mocks.unknown = true;
    mount();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
