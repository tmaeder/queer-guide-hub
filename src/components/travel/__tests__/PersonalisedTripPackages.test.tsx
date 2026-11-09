/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/hooks/useHotelSearch', () => ({ useHotelSearch: hotelSearchMock }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateMock }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    createTrip: { mutate: createTripMock, isPending: false },
    addPlacesBulk: { mutateAsync: addPlacesBulkMock },
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
vi.mock('@/components/travel/TransferSection', () => ({
  TransferSection: ({ city }: { city: string }) => <div>Transfers in {city}</div>,
}));

import { PersonalisedTripPackages } from '../PersonalisedTripPackages';

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

describe('PersonalisedTripPackages', () => {
  it('shows inspiration first and reranks a real event for Pride energy', () => {
    render(<PersonalisedTripPackages />);
    expect(screen.getByRole('heading', { name: /what kind of escape/i })).toBeInTheDocument();
    expect(screen.getByText('Nightlife in Berlin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pride energy/i }));
    expect(screen.getByRole('heading', { name: 'Pride weekend in Madrid' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Madrid Pride/i })).toHaveAttribute(
      'href',
      '/events/madrid-pride',
    );
    expect(screen.getByRole('link', { name: /queer venues in Madrid/i })).toHaveAttribute(
      'href',
      '/venues?city=Madrid',
    );
  });

  it('passes the selected stay type into the live hotel search', () => {
    render(<PersonalisedTripPackages />);
    fireEvent.click(screen.getByRole('button', { name: 'B&Bs' }));
    expect(hotelSearchMock).toHaveBeenLastCalledWith(expect.objectContaining({ hotelType: 'bnb' }));
  });

  it('requires an origin before exposing route-specific train and coach links', () => {
    render(<PersonalisedTripPackages />);
    expect(screen.getByRole('button', { name: /Trains/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Starting from/i), { target: { value: 'Zürich' } });
    expect(screen.getByRole('link', { name: /Trains/i })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=Berlin'),
    );
    expect(screen.getByRole('link', { name: /Coaches/i })).toHaveAttribute(
      'href',
      expect.stringContaining('arrivalCity=Berlin'),
    );
  });

  it('creates a trip with the event and chosen arrival mode in the seeded place', async () => {
    render(<PersonalisedTripPackages />);
    fireEvent.click(screen.getByRole('button', { name: /Pride energy/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Ferry/i }));
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
});
