/** @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, airportMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), airportMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        eq: (_col: string, code: string) => ({
          limit: () => ({ maybeSingle: () => airportMock(code) }),
        }),
      }),
    }),
  },
}));

import { translateLegacyTravelParams, useLegacyTravelParams } from '../useLegacyTravelParams';

const t = (qs: string) => translateLegacyTravelParams(new URLSearchParams(qs));

describe('translateLegacyTravelParams', () => {
  it('leaves finder URLs alone', () => {
    expect(t('')).toBeNull();
    expect(t('step=stay&stay=bnb&guests=3')).toBeNull();
  });

  it('maps the old booking tabs onto the second door', () => {
    expect(t('tab=hotels&city=Berlin')).toMatchObject({ step: 'stay', cityName: 'Berlin' });
    expect(t('tab=activities&activityCity=Rome')).toMatchObject({
      step: 'to-do',
      cityName: 'Rome',
    });
    const flights = t('tab=flights&to=ber')!;
    expect(flights).toMatchObject({ step: 'getting-there', airport: 'BER' });
    expect(flights.next.get('by')).toBe('flight');
    expect(flights.next.get('door')).toBe('know');
    expect(t('intent=book')).toMatchObject({ step: null, cityName: null, airport: null });
  });

  it('carries dates, guests, stay type and the queer-friendly filter; drops the rest', () => {
    const r = t(
      'tab=hotels&hotelCity=Lisbon&checkIn=2027-05-01&checkOut=2027-05-04&guests=3&type=bnb&lgbtqOnly=1&priceMax=200&section=x',
    )!;
    expect(Object.fromEntries(r.next)).toEqual({
      section: 'x',
      guests: '3',
      door: 'know',
      when: 'custom',
      start: '2027-05-01',
      end: '2027-05-04',
      stay: 'bnb',
      qf: '1',
    });
    expect(r.cityName).toBe('Lisbon');
  });

  it('ignores stay types and dates the finder cannot show', () => {
    const r = t('tab=hotels&type=resort&checkIn=soon')!;
    expect(r.next.has('stay')).toBe(false);
    expect(r.next.has('start')).toBe(false);
  });
});

function setup(initial: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ pending: useLegacyTravelParams(), location: useLocation() }), {
    wrapper,
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  airportMock.mockReset();
});

describe('useLegacyTravelParams', () => {
  it('resolves the city name and lands on the old tab’s step', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: 'berlingen', name: 'Berlingen', country_name: 'Switzerland' },
        { id: 'berlin-de', name: 'Berlin', country_name: 'Germany' },
      ],
      error: null,
    });
    const { result } = setup('/travel?tab=hotels&city=Berlin');
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('door')).toBe('know');
    expect(params.get('dest')).toBe('berlin-de');
    expect(params.get('step')).toBe('stay');
    expect(params.has('tab')).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith('search_cities', { q: 'Berlin', max_results: 5 });
  });

  it('resolves an airport code to its city', async () => {
    airportMock.mockResolvedValue({ data: { id: 'berlin-de' }, error: null });
    const { result } = setup('/travel?tab=flights&to=BER');
    await waitFor(() => expect(result.current.pending).toBe(false));
    const params = new URLSearchParams(result.current.location.search);
    expect(airportMock).toHaveBeenCalledWith('BER');
    expect(params.get('dest')).toBe('berlin-de');
    expect(params.get('step')).toBe('getting-there');
  });

  it('an unknown city opens Where & when instead of a step with no place', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = setup('/travel?tab=hotels&city=Atlantis');
    await waitFor(() => expect(result.current.pending).toBe(false));
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('door')).toBe('know');
    expect(params.has('dest')).toBe(false);
    expect(params.has('step')).toBe(false);
  });

  it('a failed lookup still lands on the second door', async () => {
    rpcMock.mockRejectedValue(new Error('offline'));
    const { result } = setup('/travel?tab=hotels&city=Berlin');
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(new URLSearchParams(result.current.location.search).get('door')).toBe('know');
  });
});
