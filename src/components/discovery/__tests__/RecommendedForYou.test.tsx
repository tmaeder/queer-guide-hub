/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));

import { RecommendedForYou } from '../RecommendedForYou';

describe('RecommendedForYou', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><RecommendedForYou /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
