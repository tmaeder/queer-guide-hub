/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useUserDirectoryQuery', () => ({
  useUserDirectoryQuery: () => ({ data: [], isLoading: false }),
  defaultUserFilters: { interests: [] },
}));
vi.mock('@/components/layout/PageLoadingState', () => ({ PageLoadingState: () => <div>loading</div> }));

import UserDirectory from '../UserDirectory';

describe('UserDirectory', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><UserDirectory /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
