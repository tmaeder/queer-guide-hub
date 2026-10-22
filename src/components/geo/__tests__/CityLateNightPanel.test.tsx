import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { expectNoPlaceholderLeaks } from '@/test/test-utils';
import { CityLateNightPanel } from '../CityLateNightPanel';

const rows = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock('@/hooks/useCityTransitService', () => ({
  useCityTransitService: () => ({ data: rows.current }),
}));

const H = 3600;
const r = (o: Record<string, unknown>) => ({
  feed_key: 'f',
  attribution: 'Timetable: opentransportdata.swiss',
  source_url: 'https://example.org',
  feed_end_date: '2026-12-12',
  mode: 'tram',
  route_ref: '4',
  is_night_line: false,
  day_class: 'weekday',
  first_departure_s: 5 * H,
  last_departure_s: 25 * H + 28 * 60,
  runs_all_night: false,
  trip_count: 9,
  on_time_share: null,
  reliability_period: null,
  ...o,
});

describe('CityLateNightPanel', () => {
  it('renders nothing without data — absence is never "no service"', () => {
    rows.current = [];
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <CityLateNightPanel cityId="x" />
      </I18nextProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('states the last tram, the all-night network and the source', () => {
    rows.current = [
      r({}),
      r({ day_class: 'friday', last_departure_s: 25 * H + 29 * 60 }),
      r({
        mode: 'bus',
        route_ref: 'N4',
        is_night_line: true,
        runs_all_night: true,
        day_class: 'friday',
        last_departure_s: 29 * H,
      }),
    ];
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <CityLateNightPanel cityId="x" />
      </I18nextProvider>,
    );
    expectNoPlaceholderLeaks(container);
    expect(screen.getByText('Last tram')).toBeInTheDocument();
    expect(screen.getByText(/Sun–Thu 01:28/)).toBeInTheDocument();
    expect(screen.getByText(/Fri & Sat: 1 lines until 05:00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /opentransportdata\.swiss/ })).toHaveAttribute(
      'href',
      'https://example.org',
    );
  });
});
