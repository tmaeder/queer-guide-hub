/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CalendarLayerId } from '../types';

const historySpy = vi.fn();
const birthdaysSpy = vi.fn();
const newsSpy = vi.fn();

vi.mock('@/hooks/useMyAgenda', () => ({
  useMyAgenda: () => ({
    items: [
      {
        id: 'trip_1',
        kind: 'trip',
        title: 'Berlin',
        subtitle: null,
        starts_at: '2026-07-10T00:00:00',
        ends_at: '2026-07-12T00:00:00',
        all_day: true,
        status: 'planning',
        open_target: '/trips/1',
      },
      {
        id: 'att_1',
        kind: 'event_rsvp',
        title: 'Party',
        subtitle: null,
        starts_at: '2026-07-11T21:00:00',
        ends_at: null,
        all_day: false,
        status: 'going',
        open_target: '/events/party',
      },
    ],
    days: [],
    loading: false,
  }),
}));
vi.mock('@/hooks/usePersonalityAnniversaries', () => ({
  usePersonalityAnniversaries: (_f: Date, _t: Date, enabled: boolean) => {
    historySpy(enabled);
    return {
      items: enabled
        ? [
            {
              id: 'p1',
              name: 'Icon',
              slug: 'icon',
              image_url: null,
              profession: null,
              anniversary: 'born',
              occurs_on: '2026-07-11',
              years_ago: 100,
              featured: false,
            },
          ]
        : [],
      loading: false,
    };
  },
}));
vi.mock('@/hooks/useFriendsBirthdays', () => ({
  useFriendsBirthdays: (_f: Date, _t: Date, enabled: boolean) => {
    birthdaysSpy(enabled);
    return { items: [], loading: false };
  },
}));
vi.mock('@/hooks/useSavedNewsByDate', () => ({
  useSavedNewsByDate: (_f: Date, _t: Date, enabled: boolean) => {
    newsSpy(enabled);
    return { items: [], loading: false };
  },
}));

import { useCalendarItems } from '../useCalendarItems';

const FROM = new Date('2026-07-01T00:00:00');
const TO = new Date('2026-07-31T23:59:59');

const run = (layers: CalendarLayerId[]) =>
  renderHook(() => useCalendarItems(FROM, TO, new Set(layers))).result.current;

describe('useCalendarItems', () => {
  it('passes enabled=false to disabled layers', () => {
    run(['trips', 'events']);
    expect(historySpy).toHaveBeenLastCalledWith(false);
    expect(birthdaysSpy).toHaveBeenLastCalledWith(false);
    expect(newsSpy).toHaveBeenLastCalledWith(false);
  });

  it('merges enabled layers sorted by start', () => {
    const { items } = run(['trips', 'events', 'history']);
    expect(items.map((i) => i.kind)).toEqual(['trip', 'history', 'event_rsvp']);
    expect(items.find((i) => i.kind === 'history')?.open_target).toBe('/personalities/icon');
  });

  it('filters agenda kinds by their layer toggle', () => {
    const { items } = run(['events']);
    expect(items.map((i) => i.kind)).toEqual(['event_rsvp']);
  });

  it('expands multi-day trips into each covered day', () => {
    const { byDay } = run(['trips']);
    expect(byDay.get('2026-07-10')?.some((i) => i.id === 'trip_1')).toBe(true);
    expect(byDay.get('2026-07-11')?.some((i) => i.id === 'trip_1')).toBe(true);
    expect(byDay.get('2026-07-12')?.some((i) => i.id === 'trip_1')).toBe(true);
    expect(byDay.get('2026-07-13')?.some((i) => i.id === 'trip_1')).toBeFalsy();
  });
});
