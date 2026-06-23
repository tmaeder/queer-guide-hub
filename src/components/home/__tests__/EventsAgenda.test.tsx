/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockEvents = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: mockEvents.value, loading: false, fetchEvents: vi.fn() }),
}));
vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map(), loading: false }),
}));

import EventsAgenda from '../EventsAgenda';

describe('EventsAgenda', () => {
  it('renders (self-hides when empty)', () => {
    mockEvents.value = [];
    const { container } = render(
      <MemoryRouter>
        <EventsAgenda />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('reads the event image from images[]/logo_url, not a nonexistent image_url', () => {
    // Regression guard: the `events` table has no `image_url` column, so the
    // tile must source its thumbnail from `images[]` (or `logo_url`) — otherwise
    // every event renders a fallback.
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    mockEvents.value = [
      {
        id: 'evt-1',
        slug: 'pride-night',
        title: 'Pride Night',
        start_date: soon.toISOString(),
        images: ['https://images.example.com/pride-night.jpg'],
        logo_url: null,
      },
    ];

    const { container } = render(
      <MemoryRouter>
        <EventsAgenda />
      </MemoryRouter>,
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://images.example.com/pride-night.jpg');
  });
});
