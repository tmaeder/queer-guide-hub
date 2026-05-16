/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import { UniversalSearchBar } from '../UniversalSearchBar';

describe('UniversalSearchBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><UniversalSearchBar /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
