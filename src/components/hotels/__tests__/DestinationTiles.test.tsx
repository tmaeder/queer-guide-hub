/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));
vi.mock('@/utils/fallbackImages', () => ({ getRandomFallbackImage: () => '/fallback.png' }));

import { DestinationTiles } from '../DestinationTiles';

describe('DestinationTiles', () => {
  it('renders nothing when no cities', () => {
    const { container } = render(<DestinationTiles cities={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one link per city with image + count text', () => {
    render(
      <DestinationTiles
        cities={[
          { city_id: 'c1', name: 'Berlin', slug: 'berlin', image_url: '/b.jpg', hotel_count: 5, country: 'DE' },
        ] as never}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/hotels?city=berlin');
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText(/5 hotels.*DE/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/b.jpg');
  });

  it('falls back to image when image_url missing', () => {
    render(
      <DestinationTiles
        cities={[{ city_id: 'c1', name: 'X', slug: null, image_url: null, hotel_count: 1 }] as never}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', '/fallback.png');
    expect(screen.getByText(/1 hotel\b/)).toBeInTheDocument();
  });

  it('uses name when slug missing in href', () => {
    render(
      <DestinationTiles
        cities={[{ city_id: 'c1', name: 'New York', slug: null, image_url: null, hotel_count: 2 }] as never}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/hotels?city=New%20York');
  });
});
