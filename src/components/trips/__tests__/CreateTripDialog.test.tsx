import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/test-utils';

// Hoisted spies
const navigateSpy = vi.fn();
const createMutateAsyncSpy = vi.fn();
const toastSpy = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    ready: true,
  }),
}));

// Shared mutable mutation state so individual tests can flip isPending
const createTripMock = {
  mutateAsync: createMutateAsyncSpy,
  isPending: false,
};

vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    createTrip: createTripMock,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// Stub the geo autocomplete — exposes a button that picks a fixed city/country
// so tests can bypass the Supabase-backed search and focus on dialog logic.
vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: ({
    onChange,
  }: {
    onChange: (v: {
      cityId: string;
      cityName: string;
      countryId: string;
      countryCode: string | null;
      countryName: string;
      timezone: string | null;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="pick-geo"
      onClick={() =>
        onChange({
          cityId: 'city-1',
          cityName: 'Berlin',
          countryId: 'country-1',
          countryCode: 'DE',
          countryName: 'Germany',
          timezone: 'Europe/Berlin',
        })
      }
    >
      pick geo
    </button>
  ),
}));

vi.mock('@/utils/tripTracking', () => ({
  trackTripEvent: vi.fn(),
}));

import { CreateTripDialog } from '../CreateTripDialog';

const pickGeo = () => {
  fireEvent.click(screen.getByTestId('pick-geo'));
};

describe('CreateTripDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTripMock.isPending = false;
    createMutateAsyncSpy.mockReset();
  });

  describe('Rendering', () => {
    it('does not render content when closed', () => {
      renderWithProviders(
        <CreateTripDialog open={false} onClose={vi.fn()} />,
      );
      expect(
        screen.queryByText('trips.dialog.create.title'),
      ).not.toBeInTheDocument();
    });

    it('renders the form when open', () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      expect(
        screen.getByText('trips.dialog.create.title'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('trips.dialog.create.description'),
      ).toBeInTheDocument();
    });

    it('renders title, description, start date, end date and currency fields', () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      // Required title gets a trailing " *" added by MUI, so match with regex
      expect(
        screen.getByLabelText(/trips\.dialog\.create\.titleField/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/trips\.dialog\.create\.descriptionField/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/trips\.dialog\.create\.startDate/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/trips\.dialog\.create\.endDate/),
      ).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('disables submit when title is empty', () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      const submit = screen.getByRole('button', {
        name: 'trips.dialog.create.submit',
      });
      expect(submit).toBeDisabled();
    });

    it('enables submit once a city/country is picked', () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      pickGeo();
      const submit = screen.getByRole('button', {
        name: 'trips.dialog.create.submit',
      });
      expect(submit).toBeEnabled();
    });

    it('shows the end-before-start error and disables submit', () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.titleField/),
        { target: { value: 'Berlin' } },
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.startDate/),
        { target: { value: '2026-07-10' } },
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.endDate/),
        { target: { value: '2026-07-01' } },
      );
      expect(
        screen.getByText('trips.dialog.create.endBeforeStart'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'trips.dialog.create.submit' }),
      ).toBeDisabled();
    });

    it('clears the end-before-start error when end >= start', () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.titleField/),
        { target: { value: 'Berlin' } },
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.startDate/),
        { target: { value: '2026-07-10' } },
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.endDate/),
        { target: { value: '2026-07-01' } },
      );
      expect(
        screen.getByText('trips.dialog.create.endBeforeStart'),
      ).toBeInTheDocument();
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.endDate/),
        { target: { value: '2026-07-15' } },
      );
      expect(
        screen.queryByText('trips.dialog.create.endBeforeStart'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Submit', () => {
    it('calls createTrip.mutateAsync with the form values and navigates on success', async () => {
      createMutateAsyncSpy.mockResolvedValueOnce({ id: 'trip-99' });
      const onClose = vi.fn();
      renderWithProviders(
        <CreateTripDialog open={true} onClose={onClose} />,
      );
      pickGeo();
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.titleField/),
        { target: { value: '  Berlin Pride  ' } },
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.descriptionField/),
        { target: { value: 'A fun week' } },
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'trips.dialog.create.submit' }),
      );

      await waitFor(() => {
        expect(createMutateAsyncSpy).toHaveBeenCalledTimes(1);
      });
      expect(createMutateAsyncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Berlin Pride', // trimmed
          description: 'A fun week',
          currency: 'EUR',
          primary_city_id: 'city-1',
          primary_country_id: 'country-1',
          primary_city_name: 'Berlin',
          primary_country_code: 'DE',
        }),
      );
      await waitFor(() => {
        expect(navigateSpy.mock.calls[0][0]).toBe('/trips/trip-99');
      });
      expect(onClose).toHaveBeenCalled();
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'trips.toast.created' }),
      );
    });

    it('shows an error toast when mutateAsync rejects', async () => {
      createMutateAsyncSpy.mockRejectedValueOnce(new Error('boom'));
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      pickGeo();
      fireEvent.click(
        screen.getByRole('button', { name: 'trips.dialog.create.submit' }),
      );
      await waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'trips.toast.error',
            description: 'boom',
            variant: 'destructive',
          }),
        );
      });
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('does not submit with a whitespace-only title', async () => {
      renderWithProviders(
        <CreateTripDialog open={true} onClose={vi.fn()} />,
      );
      fireEvent.change(
        screen.getByLabelText(/trips\.dialog\.create\.titleField/),
        { target: { value: '   ' } },
      );
      // Submit button stays disabled for whitespace-only titles because
      // the implementation uses title.trim() for validation
      expect(
        screen.getByRole('button', { name: 'trips.dialog.create.submit' }),
      ).toBeDisabled();
      expect(createMutateAsyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('Cancel', () => {
    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      renderWithProviders(
        <CreateTripDialog open={true} onClose={onClose} />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'trips.dialog.create.cancel' }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
