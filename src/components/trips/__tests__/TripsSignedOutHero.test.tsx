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

    it('renders all 3 sample trip cards with their keys', () => {
      renderWithProviders(<TripsSignedOutHero />);
      expect(
        screen.getByText('trips.signedOut.samples.berlin'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('trips.signedOut.samples.barcelona'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('trips.signedOut.samples.bangkok'),
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
