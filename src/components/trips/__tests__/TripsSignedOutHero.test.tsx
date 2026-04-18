import { describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '@/test/test-utils';

// Mock AuthDialog before importing the hero — the real AuthDialog imports
// `@/integrations/supabase/client` which pulls in network config at module load.
// The hero only needs to *open* the dialog, not render its internals.
vi.mock('@/components/auth/AuthDialog', () => ({
  AuthDialog: ({ open }: { open: boolean; onOpenChange: (o: boolean) => void }) => (
    <div data-testid="auth-dialog" data-open={open ? 'true' : 'false'} />
  ),
}));

// react-i18next: return the key as-is so assertions can match against keys
// directly. This keeps tests independent of the actual en.json translations.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.count === 'number') return `${key}:${opts.count}`;
      return key;
    },
  }),
}));

// Stub the templates hook so the hero has deterministic preview cards
// without hitting Supabase.
vi.mock('@/hooks/useTripTemplates', () => ({
  useTripTemplates: () => ({
    data: [
      {
        id: 'seasonal:berlin-pride',
        title: 'Pride Week Berlin',
        cities: 'Berlin',
        cityIds: [],
        days: 7,
        currency: 'EUR',
        coverImageUrl: null,
        gradient: 'linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)',
        source: 'seasonal',
      },
      {
        id: 'seasonal:barcelona',
        title: 'Barcelona Beach & Nightlife',
        cities: 'Barcelona',
        cityIds: [],
        days: 4,
        currency: 'EUR',
        coverImageUrl: null,
        gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
        source: 'seasonal',
      },
      {
        id: 'seasonal:bangkok-phuket',
        title: 'Bangkok & Phuket LGBTQ+ Explorer',
        cities: 'Bangkok, Phuket',
        cityIds: [],
        days: 10,
        currency: 'THB',
        coverImageUrl: null,
        gradient: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
        source: 'seasonal',
      },
    ],
    isLoading: false,
  }),
}));

import { TripsSignedOutHero } from '../TripsSignedOutHero';

describe('TripsSignedOutHero', () => {
  describe('Rendering', () => {
    it('renders the headline, subtitle and both CTAs', () => {
      renderWithProviders(<TripsSignedOutHero />);
      expect(screen.getByText('trips.signedOut.title')).toBeInTheDocument();
      expect(screen.getByText('trips.signedOut.subtitle')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /trips\.signedOut\.primaryCta/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /trips\.signedOut\.secondaryCta/i }),
      ).toBeInTheDocument();
    });

    it('renders all 3 value bullets', () => {
      renderWithProviders(<TripsSignedOutHero />);
      expect(
        screen.getByText('trips.signedOut.bullets.safety.title'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('trips.signedOut.bullets.itinerary.title'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('trips.signedOut.bullets.collaborate.title'),
      ).toBeInTheDocument();
    });

    it('renders all 3 sample trip cards from the templates hook', () => {
      renderWithProviders(<TripsSignedOutHero />);
      expect(screen.getByText('Pride Week Berlin')).toBeInTheDocument();
      expect(screen.getByText('Barcelona Beach & Nightlife')).toBeInTheDocument();
      expect(
        screen.getByText('Bangkok & Phuket LGBTQ+ Explorer'),
      ).toBeInTheDocument();
    });
  });

  describe('Auth dialog wiring', () => {
    it('starts with the auth dialog closed', () => {
      renderWithProviders(<TripsSignedOutHero />);
      expect(screen.getByTestId('auth-dialog')).toHaveAttribute(
        'data-open',
        'false',
      );
    });

    it('opens the auth dialog when the primary CTA is clicked', () => {
      renderWithProviders(<TripsSignedOutHero />);
      fireEvent.click(
        screen.getByRole('button', { name: /trips\.signedOut\.primaryCta/i }),
      );
      expect(screen.getByTestId('auth-dialog')).toHaveAttribute(
        'data-open',
        'true',
      );
    });

    it('opens the auth dialog when the secondary CTA is clicked', () => {
      renderWithProviders(<TripsSignedOutHero />);
      fireEvent.click(
        screen.getByRole('button', { name: /trips\.signedOut\.secondaryCta/i }),
      );
      expect(screen.getByTestId('auth-dialog')).toHaveAttribute(
        'data-open',
        'true',
      );
    });
  });
});
