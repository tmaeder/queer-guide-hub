// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { Candidate } from '@/lib/itinerary/generateItinerary';
import { clearPlanPreview, readPlanPreview } from '@/lib/trips/personalizedPlan';
import { PersonalizedTripPlanner } from '../PersonalizedTripPlanner';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  save: vi.fn(),
  setActiveTripId: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').at(-1),
    i18n: { resolvedLanguage: 'en' },
  }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useOptionalActiveTrip: () => ({ setActiveTripId: mocks.setActiveTripId }),
}));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ createTripWithStops: { mutateAsync: mocks.save, isPending: false } }),
}));
vi.mock('@/hooks/useUserTravelPreferences', () => ({
  useUserTravelPreferences: () => ({ data: { budget_tier: 'budget' } }),
}));
vi.mock('@/hooks/useAccessibilityMatches', () => ({
  useAccessibilityNeeds: () => ({ data: [] }),
}));
vi.mock('@/hooks/useItineraryPool', () => ({
  useItineraryPool: (ids: string[]) => ({ data: ids.length ? candidates : undefined }),
}));
vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: ({ onChange }: { onChange: (value: typeof destination) => void }) => (
    <button type="button" onClick={() => onChange(destination)}>
      Select Berlin
    </button>
  ),
}));

const destination = {
  cityId: 'berlin',
  cityName: 'Berlin',
  countryId: 'de',
  countryName: 'Germany',
  countryCode: 'DE',
  timezone: 'Europe/Berlin',
};
const candidates: Candidate[] = Array.from({ length: 8 }, (_, index) => ({
  kind: 'venue',
  id: `venue-${index}`,
  name: `Venue ${index}`,
  slug: null,
  cityId: 'berlin',
  countryId: 'de',
  latitude: 52.5,
  longitude: 13.4,
  category: 'cafe',
  subtype: null,
  dayPart: ['morning', 'afternoon', 'evening'],
  dayPartKnown: true,
  tags: [],
  accessibilityAttributes: [],
  amenities: [],
  priceLevel: 1,
  isFree: null,
  qualityScore: 80,
  rating: null,
  imageUrl: null,
  startsAt: null,
  endsAt: null,
  venueId: null,
}));

function renderPlanner() {
  return render(
    <MemoryRouter initialEntries={['/travel']}>
      <PersonalizedTripPlanner />
    </MemoryRouter>,
  );
}

afterEach(() => {
  clearPlanPreview();
  mocks.user = null;
  vi.clearAllMocks();
});

it('resumes the reviewed guest itinerary and retries saving with the same trip ID and dated stops', async () => {
  const arrival = format(addDays(new Date(), 4), 'yyyy-MM-dd');
  const departure = format(addDays(new Date(), 5), 'yyyy-MM-dd');
  const guest = renderPlanner();
  fireEvent.click(screen.getByRole('button', { name: 'Select Berlin' }));
  fireEvent.change(screen.getByLabelText('arrival'), { target: { value: arrival } });
  fireEvent.change(screen.getByLabelText('departure'), { target: { value: departure } });
  fireEvent.change(screen.getByLabelText('adults'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'preview' }));
  const options = screen.getAllByRole('checkbox');
  expect(options.length).toBeGreaterThan(1);
  fireEvent.click(options[0]);
  fireEvent.click(screen.getByRole('button', { name: 'signIn' }));
  const preview = readPlanPreview();
  expect(preview?.excludedIds).toHaveLength(1);
  expect(mocks.navigate).toHaveBeenCalledWith(
    '/auth?redirect=%2Ftravel%3Fsection%3Dplan%23personalized-planner',
  );
  expect(mocks.save).not.toHaveBeenCalled();
  guest.unmount();

  mocks.user = { id: 'traveler' };
  mocks.save
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockResolvedValueOnce({ id: 'saved-trip' });
  renderPlanner();
  expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  const saved = mocks.save.mock.calls[0][0];
  expect(saved).toEqual(mocks.save.mock.calls[1][0]);
  expect(saved).toMatchObject({
    requestId: preview?.requestId,
    trip: { adult_count: 3, primary_city_id: 'berlin', start_date: arrival, end_date: departure },
  });
  expect(saved.stops).toHaveLength(options.length - 1);
  expect(saved.stops.some((stop: { day_date: string }) => stop.day_date === departure)).toBe(true);
  expect(
    saved.stops.some((stop: { venue_id: string }) => stop.venue_id === preview?.excludedIds[0]),
  ).toBe(false);
  await vi.waitFor(() => {
    expect(mocks.setActiveTripId).toHaveBeenCalledWith('saved-trip');
    expect(mocks.navigate).toHaveBeenCalledWith('/trips/saved-trip?view=plan&section=plan');
    expect(readPlanPreview()).toBeNull();
  });
});
