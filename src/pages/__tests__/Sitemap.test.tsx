/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useDynamicSitemap', () => ({ useDynamicSitemap: () => ({ data: [], isLoading: false, error: null }) }));

import Sitemap from '../Sitemap';

describe('Sitemap', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Sitemap /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
