import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { TravelJourneyNav } from '../TravelJourneyNav';

describe('TravelJourneyNav', () => {
  it('exposes the complete travel journey in a stable order', () => {
    renderWithProviders(<TravelJourneyNav />, { route: '/travel' });
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Find a trip',
      'My trips',
    ]);
  });

  it('marks an individual trip as part of My trips', () => {
    renderWithProviders(<TravelJourneyNav />, { route: '/trips/trip-42?view=plan' });
    expect(screen.getByRole('link', { name: /my trips/i })).toHaveAttribute('aria-current', 'page');
  });
});
