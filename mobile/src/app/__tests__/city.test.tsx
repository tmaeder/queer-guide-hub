import { render, screen } from '@testing-library/react-native';

const mockSession = { current: null as unknown };
const mockCity = { current: {} as Record<string, unknown> };
const mockContent = { current: {} as Record<string, unknown> };

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ slug: 'dubai' }),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', regionCode: 'CH' }] }));
jest.mock('@/features/auth/useSession', () => ({ useSession: () => mockSession.current }));
jest.mock('@/api/cities', () => ({
  useCity: () => mockCity.current,
  useCityContent: () => mockContent.current,
}));

import '@/i18n';
import CityScreen from '../city/[slug]';
import { ThemeProvider } from '@/theme/ThemeProvider';

const done = (data: unknown) => ({ isLoading: false, isError: false, data });
const city = (over = {}) =>
  done({ id: 'c1', slug: 'dubai', name: 'Dubai', description: 'A city.', country: { name: 'United Arab Emirates', code: 'AE' }, ...over });
const ev = (i: number) => ({
  id: `e${i}`,
  slug: `e${i}`,
  title: `Event ${i}`,
  start_date: '2099-01-01T20:00:00Z',
  end_date: null,
  timezone: 'UTC',
  latitude: null,
  longitude: null,
  city: 'Dubai',
  event_type: 'party',
  venue_name: null,
});

async function renderCity() {
  await render(
    <ThemeProvider>
      <CityScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockSession.current = null;
  mockCity.current = city();
  mockContent.current = { venues: done([]), events: done([]), gated: done({ count: 40, highRisk: true }) };
});

it('tells a signed-out visitor that gated listings exist, and why, without naming them', async () => {
  await renderCity();
  expect(screen.getByText('40 more listings here are shown only to signed-in members.')).toBeTruthy();
  expect(screen.getByText(/criminalised in this country/)).toBeTruthy();
  expect(screen.getByText('No places listed here yet.')).toBeTruthy();
});

it('does not give a law reason where gating is per listing', async () => {
  mockContent.current = { venues: done([]), events: done([]), gated: done({ count: 3, highRisk: false }) };
  await renderCity();
  expect(screen.getByText('3 more listings here are shown only to signed-in members.')).toBeTruthy();
  expect(screen.queryByText(/criminalised/)).toBeNull();
});

it('shows no notice to a signed-in member', async () => {
  mockSession.current = { user: { id: 'u' } };
  await renderCity();
  expect(screen.queryByText(/shown only to signed-in members/)).toBeNull();
});

it('previews the first events and counts the rest', async () => {
  mockContent.current = {
    venues: done([]),
    events: done(Array.from({ length: 11 }, (_, i) => ev(i))),
    gated: done({ count: 0, highRisk: false }),
  };
  await renderCity();
  expect(screen.getByText('Event 7')).toBeTruthy();
  expect(screen.queryByText('Event 8')).toBeNull();
  expect(screen.getByText('and 3 more events')).toBeTruthy();
});

it('says the city is not listed rather than rendering an empty page', async () => {
  mockCity.current = done(null);
  await renderCity();
  expect(screen.getByText("This city isn't listed.")).toBeTruthy();
});
