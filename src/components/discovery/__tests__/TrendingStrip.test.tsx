/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));

import { TrendingStrip } from '../TrendingStrip';

describe('TrendingStrip', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><TrendingStrip /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
