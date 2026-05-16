/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useNews', () => ({ useNews: () => ({ articles: [], loading: false, error: null }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

import LatestNewsSlider from '../LatestNewsSlider';

describe('LatestNewsSlider', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><LatestNewsSlider /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
