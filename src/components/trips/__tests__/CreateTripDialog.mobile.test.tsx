import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, ready: true }),
}));

vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ createTrip: { mutateAsync: vi.fn(), isPending: false } }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: () => <div data-testid="geo-picker" />,
}));

vi.mock('@/utils/tripTracking', () => ({ trackTripEvent: vi.fn() }));

// Force useMediaQuery to report mobile viewport.
vi.mock('@mui/material/useMediaQuery', () => ({ default: () => true }));

import { CreateTripDialog } from '../CreateTripDialog';

describe('CreateTripDialog on mobile', () => {
  it('renders as a bottom-sheet / full-height drawer (data-mobile="true")', () => {
    renderWithProviders(<CreateTripDialog open={true} onClose={vi.fn()} />);
    const shell = screen.getByTestId('create-trip-dialog');
    expect(shell).toHaveAttribute('data-mobile', 'true');
  });

  it('matches the mobile layout snapshot', () => {
    const { baseElement } = renderWithProviders(
      <CreateTripDialog open={true} onClose={vi.fn()} />,
    );
    const paper = baseElement.querySelector('.MuiDialog-paper');
    expect(paper?.className).toMatchSnapshot();
  });
});
