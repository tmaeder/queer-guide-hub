import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from 'lucide-react';

/**
 * Open-Meteo daily weather client. Keyless + CORS-open — called straight from
 * the browser, no edge function. Two data sources:
 *  - forecast: real 16-day forecast (api.open-meteo.com)
 *  - typical:  same calendar window one year ago (archive-api.open-meteo.com),
 *              shown for trip days beyond the forecast horizon and labeled
 *              "typical" in the UI so it's never mistaken for a forecast.
 */

export type WeatherSource = 'forecast' | 'typical';

export interface DayWeather {
  /** ISO date the reading applies to (for typical: the trip date, not the archive date). */
  date: string;
  /** WMO weather interpretation code. */
  code: number;
  tMaxC: number;
  tMinC: number;
  /** 0-100; only available for forecasts. */
  precipProbMax: number | null;
  source: WeatherSource;
}

export const FORECAST_DAYS = 16;

interface OpenMeteoDaily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max?: (number | null)[];
}

function toDayWeather(daily: OpenMeteoDaily, source: WeatherSource): DayWeather[] {
  return daily.time.map((date, i) => ({
    date,
    code: daily.weather_code[i],
    tMaxC: daily.temperature_2m_max[i],
    tMinC: daily.temperature_2m_min[i],
    precipProbMax: daily.precipitation_probability_max?.[i] ?? null,
    source,
  }));
}

export async function fetchForecast(lat: number, lng: number): Promise<DayWeather[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=${FORECAST_DAYS}&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo forecast ${res.status}`);
  const json = (await res.json()) as { daily?: OpenMeteoDaily };
  if (!json.daily) return [];
  return toDayWeather(json.daily, 'forecast');
}

/**
 * "Typical" weather for a date range: the same window one year earlier from
 * the historical archive. `dates` in the result are shifted forward one year
 * so callers can look rows up by trip date directly.
 */
export async function fetchTypicalRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<DayWeather[]> {
  const shift = (iso: string) => `${parseInt(iso.slice(0, 4), 10) - 1}${iso.slice(4)}`;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${shift(startDate)}&end_date=${shift(endDate)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo archive ${res.status}`);
  const json = (await res.json()) as { daily?: OpenMeteoDaily };
  if (!json.daily) return [];
  return toDayWeather(json.daily, 'typical').map((d) => ({
    ...d,
    date: `${parseInt(d.date.slice(0, 4), 10) + 1}${d.date.slice(4)}`,
  }));
}

/** Round a coordinate so nearby places share one cache entry (~1 km grid). */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── WMO weather code → monochrome lucide icon + i18n label ─────────
// https://open-meteo.com/en/docs — WMO interpretation codes.

interface WeatherKindDef {
  icon: LucideIcon;
  labelKey: string;
  defaultLabel: string;
}

const KINDS: Record<string, WeatherKindDef> = {
  clear: { icon: Sun, labelKey: 'trips.weather.clear', defaultLabel: 'Clear' },
  partly: { icon: CloudSun, labelKey: 'trips.weather.partlyCloudy', defaultLabel: 'Partly cloudy' },
  overcast: { icon: Cloud, labelKey: 'trips.weather.overcast', defaultLabel: 'Overcast' },
  fog: { icon: CloudFog, labelKey: 'trips.weather.fog', defaultLabel: 'Fog' },
  drizzle: { icon: CloudDrizzle, labelKey: 'trips.weather.drizzle', defaultLabel: 'Drizzle' },
  rain: { icon: CloudRain, labelKey: 'trips.weather.rain', defaultLabel: 'Rain' },
  snow: { icon: CloudSnow, labelKey: 'trips.weather.snow', defaultLabel: 'Snow' },
  thunder: { icon: CloudLightning, labelKey: 'trips.weather.thunderstorm', defaultLabel: 'Thunderstorm' },
};

export function weatherKind(code: number): keyof typeof KINDS {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'partly';
}

export function weatherIconFor(code: number): LucideIcon {
  return KINDS[weatherKind(code)].icon;
}

export function weatherLabelKeyFor(code: number): { key: string; defaultLabel: string } {
  const def = KINDS[weatherKind(code)];
  return { key: def.labelKey, defaultLabel: def.defaultLabel };
}
