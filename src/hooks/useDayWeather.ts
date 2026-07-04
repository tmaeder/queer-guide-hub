import { useQueries, useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  FORECAST_DAYS,
  fetchForecast,
  fetchTypicalRange,
  roundCoord,
  weatherLabelKeyFor,
  type DayWeather,
} from '@/lib/weather/openMeteo';
import type { TripWithDetails } from '@/hooks/useTrips';

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * Weather for one trip day at a coordinate. Days within the 16-day
 * Open-Meteo horizon get a real forecast; farther future days get "typical"
 * weather (same month last year). Past days and missing coordinates return
 * null. Queries are keyed on a ~1 km coordinate grid so every DayCard of a
 * same-city trip shares two cache entries at most.
 */
export function useDayWeather(date: string, coord: Coord | null): DayWeather | null {
  const daysAhead = differenceInCalendarDays(new Date(date), new Date());
  const lat = coord ? roundCoord(coord.lat) : null;
  const lng = coord ? roundCoord(coord.lng) : null;

  const wantForecast = coord != null && daysAhead >= 0 && daysAhead < FORECAST_DAYS;
  const wantTypical = coord != null && daysAhead >= FORECAST_DAYS && daysAhead <= 400;

  const forecast = useQuery({
    queryKey: ['om-forecast', lat, lng],
    queryFn: () => fetchForecast(lat!, lng!),
    enabled: wantForecast,
    staleTime: 3 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const month = format(new Date(date), 'yyyy-MM');
  const typical = useQuery({
    queryKey: ['om-typical', lat, lng, month],
    queryFn: () =>
      fetchTypicalRange(
        lat!,
        lng!,
        format(startOfMonth(new Date(date)), 'yyyy-MM-dd'),
        format(endOfMonth(new Date(date)), 'yyyy-MM-dd'),
      ),
    enabled: wantTypical,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const rows = wantForecast ? forecast.data : wantTypical ? typical.data : null;
  return rows?.find((d) => d.date === date) ?? null;
}

export interface WeatherSignal {
  label: string;
  tMaxC: number;
  tMinC: number;
  typical?: boolean;
}

/**
 * Weather for every day of a trip as a compact `{date → signal}` map, built
 * for the AI concierge payload. Shares react-query cache keys with
 * `useDayWeather`. Coordinates come from the first located trip place.
 */
export function useTripWeatherSignals(
  trip: Pick<TripWithDetails, 'trip_days' | 'trip_places'> | undefined,
): Record<string, WeatherSignal> {
  const p = trip?.trip_places?.find((pl) => pl.latitude != null && pl.longitude != null);
  const lat = p ? roundCoord(p.latitude!) : null;
  const lng = p ? roundCoord(p.longitude!) : null;

  const dates = (trip?.trip_days ?? [])
    .map((d) => d.date)
    .filter((date) => {
      const ahead = differenceInCalendarDays(new Date(date), new Date());
      return ahead >= 0 && ahead <= 400;
    });

  const hasNear = dates.some(
    (d) => differenceInCalendarDays(new Date(d), new Date()) < FORECAST_DAYS,
  );
  const farMonths = [
    ...new Set(
      dates
        .filter((d) => differenceInCalendarDays(new Date(d), new Date()) >= FORECAST_DAYS)
        .map((d) => format(new Date(d), 'yyyy-MM')),
    ),
  ].slice(0, 3);

  const forecast = useQuery({
    queryKey: ['om-forecast', lat, lng],
    queryFn: () => fetchForecast(lat!, lng!),
    enabled: lat != null && hasNear,
    staleTime: 3 * 60 * 60 * 1000,
    retry: 1,
  });

  const typicalQueries = useQueries({
    queries: farMonths.map((month) => {
      const first = new Date(`${month}-01T00:00:00`);
      return {
        queryKey: ['om-typical', lat, lng, month],
        queryFn: () =>
          fetchTypicalRange(
            lat!,
            lng!,
            format(startOfMonth(first), 'yyyy-MM-dd'),
            format(endOfMonth(first), 'yyyy-MM-dd'),
          ),
        enabled: lat != null,
        staleTime: 24 * 60 * 60 * 1000,
        retry: 1,
      };
    }),
  });

  const byDate = new Map<string, DayWeather>();
  for (const row of forecast.data ?? []) byDate.set(row.date, row);
  for (const q of typicalQueries) for (const row of q.data ?? []) byDate.set(row.date, row);

  const signals: Record<string, WeatherSignal> = {};
  for (const date of dates) {
    const w = byDate.get(date);
    if (!w) continue;
    signals[date] = {
      label: weatherLabelKeyFor(w.code).defaultLabel,
      tMaxC: w.tMaxC,
      tMinC: w.tMinC,
      ...(w.source === 'typical' ? { typical: true } : {}),
    };
  }
  return signals;
}
