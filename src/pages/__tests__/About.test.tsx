/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useConsolidatedStats', () => ({ useConsolidatedStats: () => ({ stats: { venues: 0, cities: 0, countries: 0, events: 0, news: 0, users: 0 }, loading: false }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

import About from '../About';

describe('About', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><About /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
