import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  FORECAST_DAYS,
  fetchForecast,
  fetchTypicalRange,
  roundCoord,
  type DayWeather,
} from '@/lib/weather/openMeteo';

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
