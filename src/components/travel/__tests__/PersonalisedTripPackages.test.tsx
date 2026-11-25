/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';

const {
  templatesMock,
  hotelSearchMock,
  authMock,
  navigateMock,
  createTripMock,
  addPlacesBulkMock,
} = vi.hoisted(() => ({
  templatesMock: vi.fn(),
  hotelSearchMock: vi.fn(),
  authMock: vi.fn(),
  navigateMock: vi.fn(),
  createTripMock: vi.fn(),
  addPlacesBulkMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    ArrowRight: Icon,
    BedDouble: Icon,
    Bike: Icon,
    Bus: Icon,
    CalendarDays: Icon,
    Car: Icon,
    CarTaxiFront: Icon,
    Footprints: Icon,
    Hotel: Icon,
    MapPin: Icon,
    Plane: Icon,
    Ship: Icon,
    Sparkles: Icon,
    Train: Icon,
    TramFront: Icon,
  };
});
vi.mock('@/components/transit/TrackLoader', () => ({ TrackLoader: () => <span /> }));
vi.mock('@/hooks/useTripTemplates', () => ({ useTripTemplates: templatesMock }));
vi.mock('@/hooks/useVisitorOrigin', () => ({
  useVisitorOrigin: () => ({ originCity: null, originIata: null, loading: false }),
}));
vi.mock('@/hooks/useHotelSearch', () => ({ useHotelSearch: hotelSearchMock }));
vi.mock('@/hooks/useGroundConnections', () => ({
  useGroundConnections: ({ enabled, from }: { enabled: boolean; from: string }) => ({
    isError: false,
    isLoading: false,
    isFetching: false,
    data: !enabled
      ? undefined
      : from === 'Berlin'
        ? [
            {
              departure: '2026-11-30T10:00:00Z',
              arrival: '2026-11-30T18:00:00Z',
              departureTz: 'Europe/Berlin',
              arrivalTz: 'Europe/Zurich',
              fromStop: 'Berlin Hbf',
              toStop: 'Zürich HB',
              durationMinutes: 480,
              transfers: 0,
              lines: ['ICE 371'],
            },
          ]
        : [
            {
              departure: '2026-11-27T08:56:00Z',
              arrival: '2026-11-27T17:33:00Z',
              departureTz: 'Asia/Tokyo',
              arrivalTz: 'Europe/Berlin',
              fromStop: 'Zürich HB',
              toStop: 'Berlin Hbf',
              durationMinutes: 517,
              transfers: 1,
              lines: ['ICE 108', 'ICE 598'],
            },
          ],
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateMock }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    createTrip: { mutate: createTripMock, isPending: false },
    addPlacesBulk: { mutateAsync: addPlacesBulkMock },
  }),
}));
vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => ({
    status: 'ready',
    countries: [{ lgbti_criminalization: { legal: true } }],
    hasCriminalizedDestination: false,
    hasDeathPenaltyRiskDestination: false,
  }),
}));
vi.mock('@/hooks/useActiveTrip', () => ({ useOptionalActiveTrip: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/travel/CarRentalSection', () => ({
  CarRentalSection: ({ city }: { city: string }) => <div>Car hire in {city}</div>,
}));
vi.mock('@/components/travel/InlineCitySearch', () => ({ InlineCitySearch: () => null }));
vi.mock('@/components/travel/InlineFlightDeals', () => ({ InlineFlightDeals: () => null }));
vi.mock('@/components/travel/QueerGuideStays', () => ({ QueerGuideStays: () => null }));
vi.mock('@/components/travel/TransferSection', () => ({
  TransferSection: ({ city }: { city: string }) => <div>Transfers in {city}</div>,
}));

import { PersonalisedTripPackages } from '../PersonalisedTripPackages';

/** Shows the URL and offers a browser-style Back, so tests can see history. */
function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>
        history back
      </button>
    </>
  );
}

function renderFinder(initial = '/travel') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <PersonalisedTripPackages />
      <RouterProbe />
    </MemoryRouter>,
  );
}

const urlParams = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');

const templates = [
  {
    id: 'event-1',
    title: 'Pride weekend in Madrid',
    cities: 'Madrid',
    cityIds: ['madrid'],
    primaryCityId: 'madrid',
    primaryCountryId: 'spain',
    days: 4,
    currency: 'EUR',
    coverImageUrl: 'https://images.example/madrid.jpg',
    source: 'event',
    vibe: null,
    reason: '2026-06-25',
    event: {
      id: 'pride-id',
      slug: 'madrid-pride',
      title: 'Madrid Pride',
      startDate: '2026-06-25',
      endDate: '2026-06-28',
    },
    venueCount: null,
  },
  {
    id: 'nightlife-1',
    title: 'Nightlife in Berlin',
    cities: 'Berlin',
    cityIds: ['berlin'],
    primaryCityId: 'berlin',
    primaryCountryId: 'germany',
    days: 3,
    currency: 'EUR',
    coverImageUrl: 'https://images.example/berlin.jpg',
    source: 'seasonal',
    vibe: 'nightlife',
    reason: '24 places listed',
    event: null,
    venueCount: 24,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  templatesMock.mockReturnValue({ data: templates, isLoading: false });
  hotelSearchMock.mockReturnValue({ data: [], isLoading: false });
  authMock.mockReturnValue({ user: { id: 'u1' } });
  addPlacesBulkMock.mockResolvedValue(undefined);
});

/** Walk the wizard from the mood step to the package step. */
function toPackage() {
  fireEvent.click(screen.getByRole('button', { name: /See matches/i }));
  fireEvent.click(screen.getByRole('button', { name: /See the package/i }));
}

function toStay() {
  toPackage();
  fireEvent.click(screen.getByRole('button', { name: /Where to stay/i }));
}

function toTransport() {
  toStay();
  fireEvent.click(screen.getByRole('button', { name: /How to get there/i }));
}

describe('PersonalisedTripPackages', () => {
  it('step 4 shows queer-run stays, then a Booking.com search shaped by type, dates and budget', () => {
    renderFinder();
    toStay();
    expect(screen.getByText(/\d+ nights?/)).toBeInTheDocument();
    expect(screen.getByText('More stays for these dates')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Compare all/i })).not.toBeInTheDocument();
    const booking = () => screen.getByRole('link', { name: /in Berlin.*Booking\.com/ });
    expect(booking()).toHaveTextContent('Hotels in Berlin');
    expect(booking()).toHaveTextContent('up to €300 a night');
    let url = new URL(booking().getAttribute('href')!);
    expect(url.hostname).toBe('www.booking.com');
    expect(url.searchParams.get('group_adults')).toBe('2');
    expect(url.searchParams.get('checkin')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(url.searchParams.get('nflt')).toBe('ht_id=204;price=EUR-0-300-1');
    fireEvent.click(screen.getByRole('button', { name: 'B&Bs' }));
    url = new URL(booking().getAttribute('href')!);
    expect(url.searchParams.get('nflt')).toBe('ht_id=208;price=EUR-0-300-1');
  });

  it('step 6 draws the trip as a route and each stop jumps back to its step', () => {
    renderFinder();
    toTransport();
    fireEvent.change(screen.getByLabelText('Travelling from'), { target: { value: 'Zürich' } });
    fireEvent.click(screen.getByRole('button', { name: /^Make it a trip/i }));
    expect(screen.getByText('Your route')).toBeInTheDocument();
    const stops = screen.getAllByRole('button', { name: /\. Change$/ });
    expect(stops.map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/Zürich → Berlin\. By train\. Change$/),
      expect.stringMatching(/ – .+: .+\. \d+ nights? · up to €300 a night\. Change$/),
      expect.stringMatching(/Events, places and tours\. Free days, picked as you go\. Change$/),
      expect.stringMatching(/Berlin → Zürich\. By train\. Change$/),
      expect.stringMatching(/^Mood: /),
      expect.stringMatching(/^Who: 2 people/),
    ]);
    fireEvent.click(stops[1]);
    expect(screen.getByText('Stay your way')).toBeInTheDocument();
  });

  it.each([
    ['Looking for travel buddies', /^Find travel buddies in Berlin/, false],
    ['Open to meeting up', /^Invite someone along in Berlin/, true],
  ])('%s in step 1 adds a travel buddies link to the summary', (choice, label, compose) => {
    renderFinder();
    expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: choice }));
    toTransport();
    fireEvent.click(screen.getByRole('button', { name: /^Make it a trip/i }));
    const url = new URL(
      screen.getByRole('link', { name: label }).getAttribute('href')!,
      'https://queer.guide',
    );
    expect(url.pathname).toBe('/meet/travel');
    expect(url.searchParams.get('cityId')).toBe('berlin');
    expect(url.searchParams.get('start')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(url.searchParams.get('compose')).toBe(compose ? '1' : null);
  });

  it('step 3 switches between events, places and tours; tour kinds filter the inline tours', () => {
    let report: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: typeof report) {
          report = cb;
        }
        observe() {
          report?.([{ contentRect: { width: 800 } }]);
        }
        disconnect() {}
      },
    );
    renderFinder();
    toPackage();
    const tabs = screen.getByRole('group', { name: 'Things to do' });
    expect(tabs).toHaveTextContent(/Events.*Places.*Tours/);
    fireEvent.click(screen.getByRole('button', { name: 'Tours' }));
    expect(screen.getByRole('button', { name: 'Tours' })).toHaveAttribute('aria-pressed', 'true');
    const frame = () => new URL(screen.getByTitle(/in Berlin$/).getAttribute('src')!);
    expect(frame().searchParams.get('q')).toBe('Berlin LGBTQ tour');
    expect(frame().searchParams.get('number_of_items')).toBe('3');
    expect(frame().searchParams.get('partner_id')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Walking tours' }));
    expect(screen.getByRole('button', { name: 'Walking tours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(frame().searchParams.get('q')).toBe('Berlin walking tour');
    expect(screen.queryByRole('link', { name: /Walking tours/ })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows inspiration first and reranks a real event for Pride energy', () => {
    renderFinder();
    expect(screen.getByText(/pick a mood, then check the package/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /See matches/i }));
    expect(screen.getByText('Nightlife in Berlin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mood/ }));

    fireEvent.click(screen.getByRole('button', { name: /Pride energy/i }));
    toPackage();
    expect(screen.getByRole('heading', { name: 'Pride weekend in Madrid' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Madrid Pride/i })).toHaveAttribute(
      'href',
      '/events/madrid-pride',
    );
  });

  it('passes the selected stay type into the live hotel search', () => {
    renderFinder();
    toStay();
    fireEvent.click(screen.getByRole('button', { name: 'B&Bs' }));
    expect(hotelSearchMock).toHaveBeenLastCalledWith(expect.objectContaining({ hotelType: 'bnb' }));
  });

  it('every ground mode shows route cards inline once a start is given, with no search button', () => {
    renderFinder();
    toTransport();
    fireEvent.click(screen.getByRole('button', { name: /^Train$/i }));
    expect(screen.getByText('Add where you start to see routes.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Search (trains|coaches)/i }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Travelling from'), { target: { value: 'Zürich' } });
    const row = screen.getByRole('link', { name: /17:56 → 18:33/ });
    expect(row).toHaveTextContent('1 change');
    expect(row).toHaveTextContent('ICE 108 · ICE 598');
    expect(row.getAttribute('href')).toContain('outwardDate=');
    expect(row.getAttribute('href')).toContain('T17%3A56%3A00');
    expect(screen.getByText('Out · Fri 27 Nov')).toBeInTheDocument();
    expect(screen.getByText(/^Back · /)).toBeInTheDocument();
    const back = screen.getByRole('link', { name: /11:00 → 19:00/ });
    expect(back).toHaveTextContent('direct');
    expect(back.getAttribute('href')).toContain('origin=Berlin');
    expect(back.getAttribute('href')).toContain('destination=Z%C3%BCrich');
    const trainline = screen.getByRole('link', { name: /^Trainline$/ });
    expect(trainline.getAttribute('href')).toContain('destination=Berlin');
    expect(trainline.getAttribute('href')).toContain('passengers=2');
    expect(screen.getByRole('link', { name: /^Omio$/ }).getAttribute('href')).toContain(
      'mode=trains',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Coach$/i }));
    expect(screen.getByRole('link', { name: /^FlixBus$/ }).getAttribute('href')).toContain(
      'arrivalCity=Berlin',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Ferry$/i }));
    expect(
      screen.getByRole('link', { name: /Route with crossings/ }).getAttribute('href'),
    ).toContain('travelmode=transit');

    fireEvent.click(screen.getByRole('button', { name: /^Drive$/i }));
    expect(screen.getByLabelText('Driving from')).toHaveValue('Zürich');
    expect(screen.getByRole('link', { name: /Driving route/ }).getAttribute('href')).toContain(
      'travelmode=driving',
    );
  });

  it('creates a trip with the event and chosen arrival mode in the seeded place', async () => {
    renderFinder();
    fireEvent.click(screen.getByRole('button', { name: /Pride energy/i }));
    toTransport();
    fireEvent.click(screen.getByRole('button', { name: /^Ferry/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Make it a trip/i }));
    fireEvent.click(screen.getByRole('button', { name: /Build this escape/i }));

    const onSuccess = createTripMock.mock.calls[0][1].onSuccess;
    await onSuccess({ id: 'trip-1' });
    expect(addPlacesBulkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        rows: [expect.objectContaining({ event_id: 'pride-id', arrive_mode: 'ferry' })],
      }),
    );
  });

  it('writes the step and picks to the URL', () => {
    renderFinder();
    toStay();
    fireEvent.click(screen.getByRole('button', { name: 'B&Bs' }));
    expect(urlParams().get('step')).toBe('stay');
    expect(urlParams().get('stay')).toBe('bnb');
  });

  it('restores the step and picks from the URL', () => {
    renderFinder('/travel?step=stay&stay=bnb&guests=3');
    expect(screen.getByText('Stay your way')).toBeInTheDocument();
    const booking = screen.getByRole('link', { name: /in Berlin.*Booking\.com/ });
    const url = new URL(booking.getAttribute('href')!);
    expect(url.searchParams.get('nflt')).toBe('ht_id=208;price=EUR-0-300-1');
    expect(url.searchParams.get('group_adults')).toBe('3');
  });

  it('Back returns to the previous step', () => {
    renderFinder();
    toStay();
    fireEvent.click(screen.getByRole('button', { name: 'history back' }));
    expect(urlParams().get('step')).toBe('to-do');
    expect(screen.queryByText('Stay your way')).not.toBeInTheDocument();
  });
});
