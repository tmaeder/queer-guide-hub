/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/trips/TripViewSwitcher', () => ({
  TripViewSwitcher: () => null,
  getTripViewFromSearch: () => 'plan',
}));

import TripWorkspace from '../TripWorkspace';

describe('TripWorkspace', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><TripWorkspace /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
