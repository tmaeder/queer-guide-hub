import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { useSharedMobilityValue } from '../SharedMobilityValue';
import { cellsToGeoJSON } from '@/components/map/hooks/useSharedMobilityLayer';
import { snapshotAgeMinutes } from '@/hooks/useSharedMobility';

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/hooks/useSharedMobility', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useSharedMobility')>()),
  useSharedMobilityNear: () => ({ data: state.data }),
}));

function Probe() {
  return <div data-testid="v">{useSharedMobilityValue(47.37, 8.54)}</div>;
}
const renderProbe = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <Probe />
    </I18nextProvider>,
  );
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

describe('useSharedMobilityValue', () => {
  it('renders nothing where the feed does not cover the area — never "0 bikes" in Berlin', () => {
    state.data = {
      count: 0,
      radius_m: 300,
      covered: false,
      generated_at: minsAgo(2),
      attribution: 'x',
    };
    renderProbe();
    expect(screen.getByTestId('v')).toBeEmptyDOMElement();
  });

  it('renders nothing when the snapshot is stale', () => {
    state.data = {
      count: 9,
      radius_m: 300,
      covered: true,
      generated_at: minsAgo(45),
      attribution: 'x',
    };
    renderProbe();
    expect(screen.getByTestId('v')).toBeEmptyDOMElement();
  });

  it('states the count, radius, age and source when covered and fresh', () => {
    state.data = {
      count: 12,
      radius_m: 300,
      covered: true,
      generated_at: minsAgo(3),
      attribution: 'Shared mobility: sharedmobility.ch (SFOE)',
    };
    renderProbe();
    expect(screen.getByText('About 12 within 300 m')).toBeInTheDocument();
    expect(screen.getByText(/3 min ago · Shared mobility: sharedmobility\.ch/)).toBeInTheDocument();
  });
});

describe('shared mobility helpers', () => {
  it('cellsToGeoJSON puts lng first, as GeoJSON requires', () => {
    expect(cellsToGeoJSON([[47.3705, 8.54175, 2]]).features[0]).toMatchObject({
      geometry: { coordinates: [8.54175, 47.3705] },
      properties: { count: 2 },
    });
  });
  it('snapshotAgeMinutes is null for a missing timestamp', () => {
    expect(snapshotAgeMinutes(undefined)).toBeNull();
    expect(snapshotAgeMinutes(new Date(0).toISOString(), 6 * 60000)).toBe(6);
  });
});
