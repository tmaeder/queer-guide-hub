/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useCityImages', () => ({ useCityImages: () => ({ fetchCityImage: vi.fn().mockResolvedValue(null), loading: false }) }));

import { PlacesCard } from '../PlacesCard';

describe('PlacesCard', () => {
  it('renders city', () => {
    const { container } = render(
      <MemoryRouter><PlacesCard type="city" name="Berlin" data={{ id: 'c1', slug: 'berlin' } as never} onClick={vi.fn()} /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
