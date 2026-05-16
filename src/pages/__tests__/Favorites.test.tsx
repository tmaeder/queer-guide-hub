/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchAllUserFavorites: vi.fn().mockResolvedValue({ venues: [], events: [], cities: [], countries: [] }) }));

import Favorites from '../Favorites';

describe('Favorites', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Favorites /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
