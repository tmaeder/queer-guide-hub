/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/components/animation/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/effects/ParallaxHero', () => ({ ParallaxHero: () => null }));
vi.mock('@/components/motion', () => ({ MagneticButton: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { HotelHero, HotelOverview, HotelSidebar, HotelPhotos } from '../HotelDetail.parts';

const hotel = { id: 'h1', name: 'Pride Hotel', city_id: 'c1', country_id: 'co1', images: [] } as never;

describe('HotelDetail.parts', () => {
  it('HotelHero renders', () => {
    const { container } = render(
      <MemoryRouter><HotelHero hotel={hotel} cityName="Berlin" countryName="Germany" tripCount={0} isInTrip={false} onAddToTrip={vi.fn()} /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('HotelOverview renders', () => {
    const { container } = render(<HotelOverview hotel={hotel} t={(_k, d) => d ?? _k} />);
    expect(container).toBeTruthy();
  });
  it('HotelSidebar renders', () => {
    const { container } = render(<HotelSidebar hotel={hotel} t={(_k, d) => d ?? _k} />);
    expect(container).toBeTruthy();
  });
  it('HotelPhotos renders', () => {
    const { container } = render(<HotelPhotos hotel={hotel} />);
    expect(container).toBeTruthy();
  });
});
