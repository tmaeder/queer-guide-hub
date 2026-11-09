import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { TravelJourneyNav } from '../TravelJourneyNav';

describe('TravelJourneyNav', () => {
  it('exposes the complete travel journey in a stable order', () => {
    renderWithProviders(<TravelJourneyNav />, { route: '/travel' });
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Inspire',
      'Build a trip',
      'My trips',
      'Book',
    ]);
  });

  it('marks an individual trip as part of My trips', () => {
    renderWithProviders(<TravelJourneyNav />, { route: '/trips/trip-42?view=plan' });
    expect(screen.getByRole('link', { name: /my trips/i })).toHaveAttribute('aria-current', 'page');
  });

  it('marks the route builder independently from owned trips', () => {
    renderWithProviders(<TravelJourneyNav />, { route: '/trips/discover' });
    expect(screen.getByRole('link', { name: /build a trip/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /my trips/i })).not.toHaveAttribute('aria-current');
  });
});
