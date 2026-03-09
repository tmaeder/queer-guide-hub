import type { Env } from '../types';
import { jsonResponse, errorResponse, corsResponse } from '../cors';

export async function handleWeatherForecast(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  try {
    const body = await req.json<{
      lat?: number;
      lon?: number;
      latitude?: number;
      longitude?: number;
      cityName?: string;
    }>();

    // Support both naming conventions from different callers
    const lat = body.lat ?? body.latitude;
    const lon = body.lon ?? body.longitude;
    const cityName = body.cityName;

    if (lat == null || lon == null) {
      return errorResponse('Latitude and longitude are required', 400, req, env);
    }

    if (!env.OPENWEATHER_API_KEY) {
      return errorResponse('Weather API key not configured', 500, req, env);
    }

    // Check cache first (5 min TTL)
    const cacheKey = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const cached = await env.CACHE.get(cacheKey);
    if (cached) {
      return jsonResponse(JSON.parse(cached), 200, req, env, {
        'Cache-Control': 'public, max-age=300',
      });
    }

    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${env.OPENWEATHER_API_KEY}&units=metric`;
    const response = await fetch(forecastUrl);

    if (!response.ok) {
      return errorResponse('Failed to fetch weather data', response.status, req, env);
    }

    const data = await response.json<{
      list: Array<{
        dt_txt: string;
        main: { temp: number; temp_min: number; temp_max: number; humidity: number; pressure: number };
        weather: Array<{ description: string; icon: string }>;
        wind: { speed: number };
      }>;
      city?: { name?: string; country?: string };
    }>();

    const dailyForecasts = [];
    for (let i = 0; i < data.list.length; i += 8) {
      const forecast = data.list[i];
      if (dailyForecasts.length < 5) {
        dailyForecasts.push({
          date: forecast.dt_txt.split(' ')[0],
          temp: Math.round(forecast.main.temp),
          tempMin: Math.round(forecast.main.temp_min),
          tempMax: Math.round(forecast.main.temp_max),
          description: forecast.weather[0].description,
          icon: forecast.weather[0].icon,
          humidity: forecast.main.humidity,
          windSpeed: forecast.wind.speed,
          pressure: forecast.main.pressure,
        });
      }
    }

    const result = {
      success: true,
      city: cityName || data.city?.name,
      country: data.city?.country,
      forecast: dailyForecasts,
    };

    // Cache for 5 minutes
    await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });

    return jsonResponse(result, 200, req, env, {
      'Cache-Control': 'public, max-age=300',
    });
  } catch (err) {
    console.error('Weather forecast error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}
