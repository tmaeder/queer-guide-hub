/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/searchClient', () => ({
  submitOnboarding: vi.fn().mockResolvedValue({}),
  fetchAutocomplete: vi.fn().mockResolvedValue([]),
}));

import SearchPersonalization from '../SearchPersonalization';

describe('SearchPersonalization', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><SearchPersonalization /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
