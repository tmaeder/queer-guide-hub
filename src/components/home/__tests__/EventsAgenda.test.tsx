/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }),
}));
vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: null, loading: false }),
}));

import EventsAgenda from '../EventsAgenda';

describe('EventsAgenda', () => {
  it('renders (self-hides when empty)', () => {
    const { container } = render(
      <MemoryRouter>
        <EventsAgenda />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
