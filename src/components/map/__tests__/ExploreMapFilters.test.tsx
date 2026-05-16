/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import { ExploreMapFiltersPanel } from '../ExploreMapFilters';

describe('ExploreMapFiltersPanel', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><ExploreMapFiltersPanel filters={{}} onFiltersChange={vi.fn()} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
