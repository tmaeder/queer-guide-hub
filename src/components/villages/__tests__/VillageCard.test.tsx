import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useVisitedPlaceLookup', () => ({
  useVisitedPlaceLookup: () => ({ has: () => false, getKind: () => null, isEmpty: true }),
}));

import { VillageCard } from '../VillageCard';

function makeVillage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1', slug: 'castro', name: 'The Castro', description: 'Historic LGBTQ+ neighborhood',
    featured: false, image_url: null,
    cities: { id: 'c-1', name: 'San Francisco' }, countries: { id: 'co-1', name: 'USA' },
    ...overrides,
  };
}

describe('VillageCard', () => {
  it('should render village name', () => {
    render(<MemoryRouter><VillageCard village={makeVillage() as unknown as React.ComponentProps<typeof VillageCard>['village']} /></MemoryRouter>);
    expect(screen.getByText('The Castro')).toBeInTheDocument();
  });

  it('should render location', () => {
    render(<MemoryRouter><VillageCard village={makeVillage() as unknown as React.ComponentProps<typeof VillageCard>['village']} /></MemoryRouter>);
    expect(screen.getByText('San Francisco, USA')).toBeInTheDocument();
  });

  it('should render description', () => {
    render(<MemoryRouter><VillageCard village={makeVillage() as unknown as React.ComponentProps<typeof VillageCard>['village']} /></MemoryRouter>);
    expect(screen.getByText(/historic lgbtq/i)).toBeInTheDocument();
  });

  it('should show Featured badge when featured', () => {
    render(<MemoryRouter><VillageCard village={makeVillage({ featured: true }) as unknown as React.ComponentProps<typeof VillageCard>['village']} /></MemoryRouter>);
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('should link to village page', () => {
    render(<MemoryRouter><VillageCard village={makeVillage() as unknown as React.ComponentProps<typeof VillageCard>['village']} /></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/villages/castro');
  });
});
