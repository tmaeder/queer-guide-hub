/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders LGBTQ+ legal badge on a country with high equality score', () => {
    render(
      <MemoryRouter>
        <PlacesCard
          type="country"
          name="Spain"
          data={{ id: 'es', slug: 'spain', name: 'Spain', equality_score: 88 } as never}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('legality-protected')).toBeTruthy();
  });

  it('renders restrictions badge on a criminalized country', () => {
    render(
      <MemoryRouter>
        <PlacesCard
          type="country"
          name="Saudi Arabia"
          data={{
            id: 'sa',
            slug: 'saudi-arabia',
            name: 'Saudi Arabia',
            equality_score: 5,
            lgbti_criminalization: { same_sex_acts: true },
          } as never}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('legality-restricted')).toBeTruthy();
  });

  it('renders no legality badge when no LGBTQ+ data is present', () => {
    render(
      <MemoryRouter>
        <PlacesCard
          type="country"
          name="Unknown"
          data={{ id: 'x', slug: 'x', name: 'Unknown' } as never}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('legality-protected')).toBeNull();
    expect(screen.queryByTestId('legality-mixed')).toBeNull();
    expect(screen.queryByTestId('legality-restricted')).toBeNull();
  });
});
