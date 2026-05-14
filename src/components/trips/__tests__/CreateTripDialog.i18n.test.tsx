import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

// Use the real i18n instance (bundled JSON resources, synchronous init).
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/test-utils';

// Stub the geo autocomplete so the test doesn't hit Supabase.
vi.mock('@/components/trips/create/CityCountryAutocomplete', () => ({
  CityCountryAutocomplete: ({ label }: { label?: string }) => (
    <div data-testid="geo-autocomplete">{label}</div>
  ),
}));

vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    createTrip: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/utils/tripTracking', () => ({ trackTripEvent: vi.fn() }));

import { CreateTripDialog } from '../CreateTripDialog';

function renderDialog() {
  return renderWithProviders(
    <I18nextProvider i18n={i18n}>
      <CreateTripDialog open={true} onClose={() => {}} />
    </I18nextProvider>,
  );
}

describe('CreateTripDialog — i18n key leakage', () => {
  beforeAll(async () => {
    // Make sure i18n is fully initialized before we render.
    if (!i18n.isInitialized) {
      await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()));
    }
  });

  it('does not render any raw trips.* i18n keys on first open', () => {
    renderDialog();
    // Dialog is rendered into a portal; scan the whole document.
    const html = document.body.innerHTML;
    const leaked = html.match(/trips\.[a-zA-Z0-9_.]+/g) ?? [];
    expect(leaked, `Raw keys found in DOM: ${leaked.join(', ')}`).toEqual([]);
  });

  it('renders the resolved title text, not the key', () => {
    renderDialog();
    const expected = i18n.t('trips.dialog.create.title');
    expect(expected).not.toMatch(/^trips\./);
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
  });
});
