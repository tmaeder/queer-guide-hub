/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLayers } from '@/lib/nearbyLayers';

const m = vi.hoisted(() => ({
  optedIn: true,
  navigate: vi.fn(),
  people: vi.fn(() => ({ data: [] })),
  dating: vi.fn(() => ({ data: [] })),
  mapSpots: vi.fn(() => ({ data: [] })),
  list: vi.fn(() => ({ data: { spots: [], total: 0 }, isLoading: false, isError: false })),
  lastLayers: null as unknown,
}));

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => m.navigate }));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({ data: m.optedIn ? { opted_in_at: '2026-01-01' } : null }),
}));
vi.mock('@/hooks/useCruisingGuide', () => ({
  useNearbyPresenceAreas: m.people,
  useCruisingPresenceAreas: m.dating,
  useCruisingMapSpots: m.mapSpots,
  useCruisingSpotsList: m.list,
}));
vi.mock('@/components/cruising/CruisingMapPanel', () => ({
  CruisingMapPanel: ({
    layers,
    onSelectArea,
  }: {
    layers: unknown;
    onSelectArea: (a: { city_id: string; city_name: string }, k: string) => void;
  }) => {
    m.lastLayers = layers;
    return (
      <button
        type="button"
        onClick={() => onSelectArea({ city_id: 'c1', city_name: 'Zürich' }, 'dating')}
      >
        dating area
      </button>
    );
  },
}));

import { NearbyMap } from '../NearbyMap';

const renderMap = (path = '/meet/nearby') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NearbyMap />
    </MemoryRouter>,
  );

beforeEach(() => {
  m.optedIn = true;
  vi.clearAllMocks();
});

describe('parseLayers', () => {
  it('defaults to every layer for opted-in members and People only otherwise', () => {
    expect(parseLayers(null, true)).toEqual({ people: true, dating: true, spots: true });
    expect(parseLayers(null, false)).toEqual({ people: true, dating: false, spots: false });
  });
  it('never turns the dating layer on for someone who has not opted in', () => {
    expect(parseLayers('people,dating,spots', false).dating).toBe(false);
  });
  it('reads the old Dating-map values', () => {
    expect(parseLayers('both', true)).toEqual({ people: true, dating: true, spots: true });
    expect(parseLayers('spots', true)).toEqual({ people: false, dating: false, spots: true });
  });
});

describe('NearbyMap', () => {
  it('shows three layer toggles to opted-in members and toggles one off', () => {
    renderMap();
    for (const name of ['People', 'Dating', 'Spots']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Spots' }));
    expect(screen.getByRole('button', { name: 'Spots' })).toHaveAttribute('aria-pressed', 'false');
    expect(m.lastLayers).toEqual({ people: true, dating: true, spots: false });
  });

  it('hides the Dating layer and never queries it for members not opted in', () => {
    m.optedIn = false;
    renderMap();
    expect(screen.queryByRole('button', { name: 'Dating' })).toBeNull();
    expect(m.dating).toHaveBeenLastCalledWith(false);
    expect(m.people).toHaveBeenLastCalledWith(true);
  });

  it('opens dating profiles for a city when a dating area is tapped', () => {
    renderMap();
    fireEvent.click(screen.getByText('dating area'));
    expect(m.navigate).toHaveBeenCalledWith('/meet/dating?city=c1&in=Z%C3%BCrich');
  });
});
