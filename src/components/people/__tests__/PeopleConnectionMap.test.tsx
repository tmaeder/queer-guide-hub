import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/map/MapShell', () => ({
  MapShell: () => <div data-testid="map-shell" />,
}));

import { PeopleConnectionMap } from '../PeopleConnectionMap';

describe('PeopleConnectionMap', () => {
  it('offers public community and protected cruising map modes', () => {
    render(
      <MemoryRouter>
        <PeopleConnectionMap />
      </MemoryRouter>,
    );

    expect(screen.getByRole('tab', { name: 'Community' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Cruising/ })).toHaveAttribute(
      'href',
      '/people/dating?panel=spots&layers=spots',
    );
    expect(screen.getByTestId('map-shell')).toBeInTheDocument();
  });
});
