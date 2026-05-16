/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useConsolidatedStats', () => ({ useConsolidatedStats: () => ({ stats: { venues: 0, cities: 0, countries: 0, events: 0, news: 0, users: 0 }, loading: false, error: null }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import Index from '../Index';

describe('Index', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Index /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
