/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/useVisitorLocation', () => ({ useVisitorLocation: () => ({ location: null, loading: false }) }));

import RegionalEventsCalendar from '../RegionalEventsCalendar';

describe('RegionalEventsCalendar', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><RegionalEventsCalendar /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
