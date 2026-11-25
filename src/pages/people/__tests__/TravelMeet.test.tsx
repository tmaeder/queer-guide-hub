import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import TravelMeet from '../TravelMeet';
import type { TravelMeetResults, TravelMeetPlan } from '@/hooks/useTravelMeet';
import type { GeoSelection } from '@/components/trips/create/CityCountryAutocomplete';

const cityId = '30000000-0000-4000-8000-000000000001';
const tripId = '40000000-0000-4000-8000-000000000001';
const context = `cityId=${cityId}&start=2099-06-01&end=2099-06-03`;
const mocks = vi.hoisted(() => ({
  user: { id: 'host' } as { id: string } | null,
  mutate: vi.fn(),
  navigate: vi.fn(),
  retry: vi.fn(),
  invalidate: vi.fn(),
  track: vi.fn(),
  data: { allowed: true, plans: [], own_plans: [], alert_id: null } as TravelMeetResults,
  isError: false,
  event: false,
  seedDates: true,
  adult: false,
  adultEvent: false,
  safety: {
    status: 'ready',
    countries: [{ lgbti_criminalization: { legal: true } }],
    hasCriminalizedDestination: false,
    hasDeathPenaltyRiskDestination: false,
    hasUnknownDestination: false,
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('@/hooks/useAgeAffirmation', () => ({
  useAgeAffirmation: () => ({ affirmed: mocks.adult, checking: false }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => mocks.navigate,
  useCurrentLocale: () => 'en',
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('@/hooks/useTravelMeet', () => ({
  useTravelMeet: () => ({
    data: mocks.data,
    isError: mocks.isError,
    isSuccess: !mocks.isError,
    isLoading: false,
    refetch: mocks.retry,
    action: { isPending: false, isError: false, mutateAsync: mocks.mutate, reset: vi.fn() },
  }),
  useTravelMeetSeed: () => ({
    data: {
      geo: {
        cityId: '30000000-0000-4000-8000-000000000001',
        cityName: 'Berlin',
        countryId: 'country',
        countryName: 'Germany',
        countryCode: 'DE',
        timezone: 'Europe/Berlin',
      },
      start: mocks.seedDates ? '2099-06-01' : '',
      end: mocks.seedDates ? '2099-06-03' : '',
      title: '',
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('@/hooks/useTripSafety', () => ({ useTripSafety: () => mocks.safety }));
vi.mock('@/hooks/useTrips', () => ({ useTrips: () => ({ data: [] }) }));
vi.mock('@/hooks/useEvents', () => ({
  useEventsQuery: () => ({
    events: mocks.event
      ? [
          {
            id: 'event',
            title: 'Pride picnic',
            is_public: true,
            slug: 'pride-picnic',
            start_date: '2099-06-02',
            age_restriction: mocks.adultEvent ? '18+' : null,
          },
        ]
      : [],
    loading: false,
    error: null,
  }),
}));
vi.mock('@/components/meet/MeetOpportunities', () => ({
  MeetOpportunities: () => <p>Public groups from around the world</p>,
}));
vi.mock('@/components/meet/MeetNav', () => ({ MeetNavBar: () => null }));
vi.mock('@/components/moderation/ReportContentDialog', () => ({
  ReportContentDialog: ({ open, contentId }: { open: boolean; contentId: string }) =>
    open ? <div data-testid="travel-report" data-content-id={contentId} /> : null,
}));
vi.mock('@/utils/consentedAnalytics', () => ({ trackConsentedEvent: mocks.track }));
vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: ({ label, value }: { label: string; value: GeoSelection | null }) => (
    <label>
      {label}
      <input readOnly value={value?.cityName ?? ''} />
    </label>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

function mount(query = context, path = '/meet') {
  return render(
    <MemoryRouter initialEntries={[`${path}?${query}`]}>
      <TravelMeet />
    </MemoryRouter>,
  );
}
const plan: TravelMeetPlan = {
  id: 'plan',
  city_id: cityId,
  avatar_url: null,
  event_id: null,
  event_slug: null,
  event_title: null,
  owner_id: 'other',
  title: 'Coffee and a gallery',
  description: 'A relaxed afternoon',
  city_name: 'Berlin',
  activity: 'coffee',
  host_kind: 'traveller',
  display_name: 'Alex',
  start_date: '2099-06-02',
  end_date: '2099-06-02',
  request: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  mocks.user = { id: 'host' };
  mocks.data = { allowed: true, plans: [], own_plans: [], alert_id: null };
  mocks.isError = false;
  mocks.event = false;
  mocks.seedDates = true;
  mocks.adult = false;
  mocks.adultEvent = false;
  mocks.safety = {
    status: 'ready',
    countries: [{ lgbti_criminalization: { legal: true } }],
    hasCriminalizedDestination: false,
    hasDeathPenaltyRiskDestination: false,
    hasUnknownDestination: false,
  };
  mocks.mutate.mockResolvedValue({ id: 'created' });
});
describe('shared Meet experience', () => {
  it('applies a direct activity choice and carries it into an invitation without publishing on selection', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Art & culture' }));
    expect(screen.getByRole('button', { name: 'Art & culture' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Open to anything' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Find meetups' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a meetup' }));
    expect(document.getElementById('meet-activity')).toHaveValue('culture');
    fireEvent.change(screen.getByLabelText('Your invitation'), {
      target: { value: 'A gallery afternoon' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        action: 'create',
        data: expect.objectContaining({ activity: 'culture', title: 'A gallery afternoon' }),
      }),
    );
  });

  it('honours the shared adult-content preference in public event suggestions', () => {
    mocks.event = true;
    mocks.adultEvent = true;
    const view = mount();
    expect(screen.queryByRole('link', { name: 'Pride picnic' })).not.toBeInTheDocument();
    mocks.adult = true;
    view.rerender(
      <MemoryRouter>
        <TravelMeet />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Pride picnic' })).toBeInTheDocument();
  });
  it('browses a visible two-week default without requiring travel dates', () => {
    mocks.seedDates = false;
    mount(`cityId=${cityId}`);
    expect(screen.getByText('Next two weeks · change dates')).toBeInTheDocument();
    const start = (document.getElementById('meet-start') as HTMLInputElement).value;
    const end = (document.getElementById('meet-end') as HTMLInputElement).value;
    expect(Date.parse(end) - Date.parse(start)).toBe(13 * 86400000);
    expect(screen.getByRole('heading', { name: 'Meetups to join' })).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('keeps existing travel entry links on the same meetup experience', () => {
    mount(context, '/meet/travel');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Find queer company.');
  });
  it('reports the host in the same auth-user ID space as the existing profile flow', () => {
    mocks.data.plans = [plan];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Report or block' }));
    expect(screen.getByTestId('travel-report')).toHaveAttribute('data-content-id', plan.owner_id);
  });

  it('moves focus into the composer and restores its trigger on cancel', () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Suggest a meetup' });
    fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Invite someone along' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Suggest a meetup' })).toHaveFocus();
  });

  it('keeps profiles private and carries destination and dates through authentication', () => {
    mocks.user = null;
    mocks.data.plans = [plan];
    mount();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to see invitations' }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      `/auth?redirect=${encodeURIComponent(`/meet?${context}`)}`,
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('publishes a separate invitation only after explicit consent, preserving the private trip reference', async () => {
    mount(`${context}&tripId=${tripId}`);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a meetup' }));
    fireEvent.change(screen.getByLabelText('Your invitation'), {
      target: { value: 'Coffee and a gallery visit' },
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish invitation' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        action: 'create',
        data: expect.objectContaining({
          city_id: cityId,
          trip_id: tripId,
          title: 'Coffee and a gallery visit',
          start_date: '2099-06-01',
          end_date: '2099-06-03',
        }),
      }),
    );
  });
  it('preserves an anonymous draft for review after sign-in, without publishing it', () => {
    mocks.user = null;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a meetup' }));
    fireEvent.change(screen.getByLabelText('Your invitation'), {
      target: { value: 'A museum afternoon' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to publish' }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem('qg-travel-meet-draft')!).draft.title).toBe(
      'A museum afternoon',
    );
    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining('compose%3D1'));
  });
  it('distinguishes a failed load from an empty destination and offers retry', () => {
    mocks.isError = true;
    mount();
    expect(
      screen.getByText('We could not load invitations. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No invitations overlap these dates yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
  it('saves an explicit date-and-activity-scoped in-app alert for empty results', async () => {
    mount(`${context}&activity=coffee`);
    fireEvent.click(
      screen.getByRole('button', { name: 'Notify me in Messages when a plan matches' }),
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        action: 'alert',
        data: {
          city_id: cityId,
          start_date: '2099-06-01',
          end_date: '2099-06-03',
          activity: 'coffee',
        },
      }),
    );
  });
  it('sends a join request without opening a chat', async () => {
    mocks.data.plans = [plan];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ask to join' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({ action: 'request', data: { id: 'plan' } }),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('opens the existing Messages conversation only after host acceptance', async () => {
    mocks.data.own_plans = [
      {
        ...plan,
        cancelled: false,
        expired: false,
        allowed: true,
        requests: [
          {
            id: 'request',
            status: 'pending',
            requester_id: 'guest',
            display_name: 'Guest',
            conversation_id: null,
          },
        ],
      },
    ];
    mocks.mutate.mockResolvedValue({ conversation_id: 'conversation' });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Accept and chat' }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/messages?conversation=conversation'),
    );
    expect(mocks.mutate).toHaveBeenCalledWith({ action: 'accept', data: { id: 'request' } });
  });
  it('uses a real event as invitation context without publishing on selection', () => {
    mocks.event = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Invite someone to this' }));
    expect(screen.getByLabelText('Your invitation')).toHaveValue('Pride picnic: go together?');
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('hides invitations and publishing when destination discovery is restricted', () => {
    mocks.data.allowed = false;
    mocks.data.plans = [plan];
    mount();
    expect(screen.getByText('Meetups are unavailable for this destination')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to join' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suggest a meetup' })).not.toBeInTheDocument();
  });
  it('requires a valid date window before results or publication', () => {
    mount(`cityId=${cityId}&start=2099-06-01&end=2099-08-01`);
    expect(screen.queryByRole('button', { name: 'Suggest a meetup' })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Find company' }));
    expect(screen.getByRole('alert')).toHaveTextContent('31-day window');
  });
});
