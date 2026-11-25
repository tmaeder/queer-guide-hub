import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import People from '../People';

const { place } = vi.hoisted(() => ({
  place: {
    cityId: 'resolved-city' as string | null,
    loading: false,
    error: undefined as string | undefined,
    retry: vi.fn(),
  },
}));
vi.mock('@/hooks/useIntentLocation', () => ({ useIntentLocation: () => place }));
vi.mock('../TravelMeet', () => ({
  default: ({ resolvedCityId }: { resolvedCityId?: string }) => (
    <div data-testid="meetup-experience" data-city-id={resolvedCityId}>
      Shared meetup experience
    </div>
  ),
}));
vi.mock('@/components/meet/MeetNav', () => ({ MeetNavBar: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_: string, fallback: string) => fallback }),
}));
beforeEach(() => {
  place.loading = false;
  place.error = undefined;
  place.cityId = 'resolved-city';
});

describe('Meet entry', () => {
  it('opens the shared invitation experience instead of another editorial dashboard', () => {
    renderWithProviders(<People />, { route: '/meet' });
    expect(screen.getByTestId('meetup-experience')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Community spaces' })).not.toBeInTheDocument();
  });
  it('resolves explicit city slugs before entering the shared experience', () => {
    renderWithProviders(<People />, { route: '/meet?city=zurich' });
    expect(screen.getByTestId('meetup-experience')).toHaveAttribute(
      'data-city-id',
      'resolved-city',
    );
  });
  it('does not replace unresolved explicit cities with unrelated invitations', () => {
    place.loading = true;
    renderWithProviders(<People />, { route: '/meet?city=zurich' });
    expect(screen.queryByTestId('meetup-experience')).not.toBeInTheDocument();
  });
  it('offers location recovery when an explicit city cannot be resolved', () => {
    place.error = 'unavailable';
    place.cityId = null;
    renderWithProviders(<People />, { route: '/meet?city=unknown' });
    expect(screen.queryByTestId('meetup-experience')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
