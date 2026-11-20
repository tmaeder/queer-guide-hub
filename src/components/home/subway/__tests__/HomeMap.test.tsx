/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

const { mapProps } = vi.hoisted(() => ({ mapProps: [] as Record<string, unknown>[] }));

vi.mock('@/components/home/useHomeCity', () => ({
  useHomeCity: () => ({ loading: false, cityId: 'c1', cityName: 'Berlin' }),
}));
vi.mock('@/hooks/regionOverride', () => ({
  useCityCentre: () => ({ data: { latitude: 52.5, longitude: 13.4 }, isLoading: false }),
}));
vi.mock('@/components/map/ExploreMap', () => ({
  default: (props: Record<string, unknown>) => {
    mapProps.push(props);
    return null;
  },
}));

import HomeMap from '../HomeMap';

describe('homepage map', () => {
  // The live-pin pulse repaints the whole 79-layer style every frame for 5.4s
  // after each data load. On the homepage that runs while the visitor scrolls
  // past: measured headless, 30k WebGL draws with motion on vs 4k with it off.
  it('does not run the live-pin pulse', () => {
    renderWithProviders(<HomeMap />);
    expect(mapProps.at(-1)?.livePulse).toBe(false);
  });
});
