/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EventsHeroSpotlight } from '../EventsHeroSpotlight';
import { selectDiscoveryEvent } from '@/lib/discoveryEvent';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'en' },
  }),
}));

const event = {
  id: 'event-id',
  slug: 'community-library',
  title: 'Community library',
  title_i18n: { en: 'Library open house' },
  start_date: '2026-11-12T00:30:00Z',
  timezone: 'America/New_York',
  city: 'New York',
  venue_name: 'The Library',
  organizer_name: 'Community Collective',
  images: null,
  liveness_status: 'live',
  age_restriction: null as string | null,
};

describe('EventsHeroSpotlight', () => {
  it('links to the listing and shows the local date, place, and organiser', () => {
    render(
      <MemoryRouter>
        <EventsHeroSpotlight event={event} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Library open house' })).toBeVisible();
    expect(screen.getByText(/Wed, Nov 11/)).toHaveAttribute('datetime', event.start_date);
    expect(screen.getByText('The Library · New York')).toBeVisible();
    expect(screen.getByText('Organizer · Community Collective')).toBeVisible();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/events/community-library');
  });

  it('chooses a near-term eligible listing even when the feed sorts featured events first', () => {
    const now = Date.parse('2026-11-09T00:00:00Z');
    expect(
      selectDiscoveryEvent(
        [
          { ...event, start_date: '2027-06-01T12:00:00Z', is_featured: true },
          { ...event, start_date: '2026-11-10T12:00:00Z', liveness_status: 'cancelled' },
          { ...event, start_date: '2026-11-11T12:00:00Z', age_restriction: '18+' },
          { ...event, start_date: '2026-11-15T12:00:00Z' },
          event,
        ],
        now,
      ),
    ).toBe(event);
    expect(selectDiscoveryEvent([event], Date.parse('2026-11-13T00:00:00Z'))).toBeUndefined();
  });
});
